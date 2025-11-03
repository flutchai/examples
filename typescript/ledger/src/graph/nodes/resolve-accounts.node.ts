import { Injectable, Logger } from "@nestjs/common";
import {
  WorkflowStateValues,
  WorkflowStateUtils,
  ResolvedAccounts,
} from "../graph.state";
import { AccountService } from "../../service/account/account.service";
import { TransactionType } from "../../common/types";
import { LedgerAuditService } from "../../common/audit.service";
import { LedgerMetrics } from "../../common/metrics.service";

@Injectable()
export class ResolveAccountsNode {
  private readonly logger = new Logger(ResolveAccountsNode.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly audit: LedgerAuditService,
    private readonly metrics: LedgerMetrics
  ) {}

  async execute(
    state: WorkflowStateValues
  ): Promise<Partial<WorkflowStateValues>> {
    this.metrics.incOperations();
    this.logger.debug("Resolving accounts for transaction");
    this.audit.log("resolve_accounts", {
      userId: state.input.userId,
      description: state.parsedIntent?.description,
    });

    try {
      if (!state.parsedIntent) {
        throw new Error("Cannot resolve accounts without parsed intent");
      }

      // Ensure default accounts exist for the user
      const defaultAccounts = await this.accountService.setupDefaultAccounts(
        state.input.userId
      );

      // Resolve accounts based on transaction - LEGACY NODE NOT USED
      const resolvedAccounts = await this.resolveAccountsForTransaction(
        TransactionType.TRANSACTION,
        state.input,
        defaultAccounts
      );

      // Advance to next step (legacy - not used in new architecture)
      const stepUpdate = WorkflowStateUtils.advanceStep(
        state,
        "present_result"
      );
      const metadataUpdate = WorkflowStateUtils.updateMetadata(state, {
        accountsResolved: true,
        defaultAccountsUsed: resolvedAccounts.defaultAccountsUsed,
      });

      const currency =
        resolvedAccounts.fromAccount?.currency ||
        resolvedAccounts.toAccount?.currency ||
        state.parsedIntent?.currency ||
        "USD";

      return {
        ...stepUpdate,
        ...metadataUpdate,
        resolvedAccounts,
        parsedIntent: { ...state.parsedIntent, currency },
      };
    } catch (error) {
      this.logger.error("Account resolution failed:", error);
      const errorUpdate = WorkflowStateUtils.addError(state, error.message);

      return {
        ...errorUpdate,
        output: {
          text: `Failed to resolve accounts: ${error.message}`,
          metadata: { error: true },
        },
      };
    }
  }

  private async resolveAccountsForTransaction(
    transactionType: TransactionType,
    input: any,
    defaultAccounts: any
  ): Promise<ResolvedAccounts> {
    // LEGACY CODE - This node is not used. Account resolution now handled by AccountIntelligenceService
    throw new Error(
      "ResolveAccountsNode is deprecated. Use AccountIntelligenceService for account resolution."
    );

    /* COMMENTED OUT - OLD LOGIC
    const { fromAccountCode, toAccountCode } = input;

    switch (transactionType) {
      case "DEPOSIT":
        return {
          toAccount: {
            code: defaultAccounts.cash.accountCode,
            name: defaultAccounts.cash.accountName,
            type: defaultAccounts.cash.accountType,
            currency: defaultAccounts.cash.currency,
          },
          fromAccount: {
            code: defaultAccounts.equity.accountCode,
            name: defaultAccounts.equity.accountName,
            type: defaultAccounts.equity.accountType,
            currency: defaultAccounts.equity.currency,
          },
          defaultAccountsUsed: true,
        };

      case TransactionType.WITHDRAWAL:
        return {
          fromAccount: {
            code: defaultAccounts.cash.accountCode,
            name: defaultAccounts.cash.accountName,
            type: defaultAccounts.cash.accountType,
            currency: defaultAccounts.cash.currency,
          },
          toAccount: {
            code: defaultAccounts.equity.accountCode,
            name: defaultAccounts.equity.accountName,
            type: defaultAccounts.equity.accountType,
            currency: defaultAccounts.equity.currency,
          },
          defaultAccountsUsed: true,
        };

      case TransactionType.EXPENSE:
      case TransactionType.PAYMENT:
        return {
          toAccount: {
            code: defaultAccounts.expense.accountCode,
            name: defaultAccounts.expense.accountName,
            type: defaultAccounts.expense.accountType,
            currency: defaultAccounts.expense.currency,
          },
          fromAccount: {
            code: defaultAccounts.cash.accountCode,
            name: defaultAccounts.cash.accountName,
            type: defaultAccounts.cash.accountType,
            currency: defaultAccounts.cash.currency,
          },
          defaultAccountsUsed: true,
        };

      case TransactionType.RECEIPT:
        return {
          toAccount: {
            code: defaultAccounts.cash.accountCode,
            name: defaultAccounts.cash.accountName,
            type: defaultAccounts.cash.accountType,
            currency: defaultAccounts.cash.currency,
          },
          fromAccount: {
            code: defaultAccounts.revenue.accountCode,
            name: defaultAccounts.revenue.accountName,
            type: defaultAccounts.revenue.accountType,
            currency: defaultAccounts.revenue.currency,
          },
          defaultAccountsUsed: true,
        };

      case TransactionType.TRANSFER:
        if (!fromAccountCode || !toAccountCode) {
          throw new Error(
            "Transfer transactions require both from and to account codes"
          );
        }

        // Get account details for the specified accounts
        const fromAccount = await this.accountService.getAccount(
          fromAccountCode,
          input.userId
        );
        const toAccount = await this.accountService.getAccount(
          toAccountCode,
          input.userId
        );

        return {
          fromAccount: {
            code: fromAccount.accountCode,
            name: fromAccount.accountName,
            type: fromAccount.accountType,
            currency: fromAccount.currency,
          },
          toAccount: {
            code: toAccount.accountCode,
            name: toAccount.accountName,
            type: toAccount.accountType,
            currency: toAccount.currency,
          },
          defaultAccountsUsed: false,
        };

      default:
        throw new Error(`Unsupported transaction type: ${transactionType}`);
    }
    */
  }
}
