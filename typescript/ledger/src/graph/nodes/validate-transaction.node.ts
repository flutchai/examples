import { Injectable, Logger } from "@nestjs/common";
import {
  WorkflowStateValues,
  WorkflowStateUtils,
  ValidationResults,
} from "../graph.state";
import { AccountService } from "../../service/account/account.service";
import { JournalEntryService } from "../../service/journal-entry/journal-entry.service";
import { CreateJournalEntryDto } from "../../common/types";
import { LedgerAuditService } from "../../common/audit.service";
import { LedgerMetrics } from "../../common/metrics.service";

@Injectable()
export class ValidateTransactionNode {
  private readonly logger = new Logger(ValidateTransactionNode.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService,
    private readonly audit: LedgerAuditService,
    private readonly metrics: LedgerMetrics
  ) {}

  async execute(
    state: WorkflowStateValues
  ): Promise<Partial<WorkflowStateValues>> {
    this.metrics.incOperations();
    this.logger.log("Validating transaction");
    this.audit.log("validate_transaction", {
      userId: state.input.userId,
      transactionId: state.builtTransaction?.transactionId,
    });

    try {
      if (!state.builtTransaction) {
        throw new Error("Cannot validate without built transaction");
      }

      // Perform comprehensive validation
      const validation = await this.validateTransaction(state);

      if (validation.isValid) {
        this.logger.log(
          `Transaction validation passed: accounts verified=${validation.accountsVerified}, balance checked=${validation.balanceChecked}`
        );

        // Advance to final step
        const stepUpdate = WorkflowStateUtils.advanceStep(
          state,
          "present_result"
        );
        const metadataUpdate = WorkflowStateUtils.updateMetadata(state, {
          validated: true,
          accountsVerified: validation.accountsVerified,
          balanceChecked: validation.balanceChecked,
        });

        return {
          ...stepUpdate,
          ...metadataUpdate,
          validation,
        };
      } else {
        this.logger.log(
          `Transaction validation failed: ${validation.errors.length} errors - ${validation.errors.slice(0, 2).join(", ")}${validation.errors.length > 2 ? "..." : ""}`
        );

        // Validation failed
        const errorUpdate = WorkflowStateUtils.addError(
          state,
          `Validation failed: ${validation.errors.join(", ")}`
        );

        return {
          ...errorUpdate,
          validation,
          output: {
            text: `Transaction validation failed: ${validation.errors.join(", ")}`,
            metadata: {
              error: true,
              validationErrors: validation.errors,
              validationWarnings: validation.warnings,
            },
          },
        };
      }
    } catch (error) {
      this.logger.error("Transaction validation failed:", error);
      const errorUpdate = WorkflowStateUtils.addError(state, error.message);

      return {
        ...errorUpdate,
        validation: {
          isValid: false,
          errors: [error.message],
          warnings: [],
          accountsVerified: false,
          balanceChecked: false,
        },
        output: {
          text: `Validation error: ${error.message}`,
          metadata: { error: true },
        },
      };
    }
  }

  private async validateTransaction(
    state: WorkflowStateValues
  ): Promise<ValidationResults> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let accountsVerified = false;
    let balanceChecked = false;

    const { builtTransaction, input } = state;

    if (!builtTransaction) {
      errors.push("No transaction to validate");
      return {
        isValid: false,
        errors,
        warnings,
        accountsVerified,
        balanceChecked,
      };
    }

    // 1. Validate transaction balance
    if (!builtTransaction.isBalanced) {
      errors.push(
        `Transaction is not balanced: Debit=${builtTransaction.totalDebit}, Credit=${builtTransaction.totalCredit}`
      );
    } else {
      balanceChecked = true;
    }

    // 2. Validate journal entry structure
    const journalEntryDto: CreateJournalEntryDto = {
      userId: input.userId,
      description: input.description,
      reference: input.reference,
      entries: builtTransaction.journalEntryLines.map(line => ({
        accountCode: line.accountCode,
        description: line.description,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
      })),
    };

    const journalValidation =
      await this.journalEntryService.validateJournalEntry(journalEntryDto);
    if (!journalValidation.isValid) {
      errors.push(...journalValidation.errors);
    }
    if (journalValidation.warnings) {
      warnings.push(...journalValidation.warnings);
    }

    // 3. Validate individual accounts
    try {
      const accountCodes = builtTransaction.journalEntryLines.map(
        line => line.accountCode
      );
      const uniqueAccountCodes = [...new Set(accountCodes)];

      for (const accountCode of uniqueAccountCodes) {
        try {
          const account = await this.accountService.getAccount(
            accountCode,
            input.userId as string
          );

          // Check if account is active
          if (!account.isActive) {
            errors.push(`Account ${accountCode} is not active`);
          }

          // Check for sufficient funds (for debit transactions on asset accounts)
          const accountLines = builtTransaction.journalEntryLines.filter(
            line => line.accountCode === accountCode
          );

          for (const line of accountLines) {
            if (line.creditAmount > 0 && account.accountType === "ASSET") {
              // This is a credit to an asset account (money going out)
              if (account.balance < line.creditAmount) {
                errors.push(
                  `Insufficient funds in account ${accountCode}: balance=${account.balance}, required=${line.creditAmount}`
                );
              }
            }
          }
        } catch (error) {
          errors.push(`Account ${accountCode} not found or invalid`);
        }
      }
      accountsVerified = true;
    } catch (error) {
      errors.push(`Account validation failed: ${error.message}`);
    }

    // 4. Business rule validation
    if (input.amount <= 0) {
      errors.push("Transaction amount must be positive");
    }

    if (input.amount > 1000000) {
      warnings.push("Large transaction amount detected");
    }

    // 5. Check for duplicate transactions (simple check)
    if (input.reference) {
      try {
        const existingEntries =
          await this.journalEntryService.getJournalEntriesByReference(
            input.reference
          );
        if (existingEntries.length > 0) {
          warnings.push(`Reference ${input.reference} has been used before`);
        }
      } catch (error) {
        // Non-critical error, just log it
        this.logger.warn(
          `Could not check for duplicate reference: ${error.message}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      accountsVerified,
      balanceChecked,
    };
  }
}
