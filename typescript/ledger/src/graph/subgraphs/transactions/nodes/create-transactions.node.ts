import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { TransactionStateValues } from "../transaction.state";
import { AccountService } from "../../../../service/account/account.service";
import { JournalEntryService } from "../../../../service/journal-entry/journal-entry.service";
import { JournalEntryStatus } from "../../../../common/types";
import { LedgerGraphConfigValues } from "../../../../ledger-graph.builder";

/**
 * Create Transactions Node
 *
 * Final step: creates new accounts (if needed) and all journal entries.
 * This runs after user confirmation (or immediately if no confirmation needed).
 */
@Injectable()
export class CreateTransactionsNode {
  private readonly logger = new Logger(CreateTransactionsNode.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService
  ) {}

  async execute(
    state: TransactionStateValues,
    _config: LangGraphRunnableConfig<LedgerGraphConfigValues>
  ): Promise<Partial<TransactionStateValues>> {
    this.logger.log(
      `Creating ${state.confirmedTransactions.length} transaction(s)`
    );

    try {
      const userId = state.userId;
      const createdJournalEntryIds: string[] = [];

      // Step 1: Create new accounts if needed
      if (state.newAccountsNeeded.length > 0) {
        this.logger.log(
          `Creating ${state.newAccountsNeeded.length} new accounts`
        );

        for (const accountSpec of state.newAccountsNeeded) {
          await this.accountService.createAccount({
            userId,
            accountCode: accountSpec.code,
            accountName: accountSpec.name,
            accountType: accountSpec.type,
            normalBalance: accountSpec.normalBalance!,
            currency: accountSpec.currency || "USD",
          });

          this.logger.log(
            `Created account: ${accountSpec.code} - ${accountSpec.name}`
          );
        }
      }

      // Step 2: Create all journal entries
      this.logger.log(
        `Creating ${state.confirmedTransactions.length} journal entries`
      );

      for (const tx of state.confirmedTransactions) {
        const journalEntry = await this.journalEntryService.createJournalEntry({
          userId,
          description: tx.description,
          status: JournalEntryStatus.POSTED,
          date: tx.date,
          tags: tx.tags,
          entries: [
            {
              accountCode: tx.debitAccountCode,
              description: tx.description,
              debitAmount: tx.amount,
              creditAmount: 0,
            },
            {
              accountCode: tx.creditAccountCode,
              description: tx.description,
              debitAmount: 0,
              creditAmount: tx.amount,
            },
          ],
        });

        createdJournalEntryIds.push(journalEntry._id.toString());

        this.logger.log(
          `Created journal entry: ${journalEntry._id} - ${tx.description} (${tx.amount} ${tx.currency})`
        );
      }

      // Build success message
      const successMessage = this.buildSuccessMessage(
        state,
        createdJournalEntryIds.length
      );

      // Build attachment card with transaction details
      const attachment = this.buildTransactionCard(
        state,
        createdJournalEntryIds
      );

      this.logger.log(
        `Transaction creation complete. Created ${state.newAccountsNeeded.length} accounts ` +
          `and ${createdJournalEntryIds.length} journal entries`
      );

      return {
        createdJournalEntryIds,
        attachment,
        metadata: {
          ...state.metadata,
          successMessage,
          accountsCreated: state.newAccountsNeeded.length,
          transactionsCreated: createdJournalEntryIds.length,
        },
      };
    } catch (error) {
      this.logger.error("Transaction creation failed:", error);
      return {
        hasErrors: true,
        errorMessages: [error.message || "Failed to create transactions"],
      };
    }
  }

  /**
   * Build success message
   */
  private buildSuccessMessage(
    state: TransactionStateValues,
    transactionCount: number
  ): string {
    const accountCount = state.newAccountsNeeded.length;
    const totalAmount = state.confirmedTransactions.reduce(
      (sum, tx) => sum + tx.amount,
      0
    );
    const currency = state.confirmedTransactions[0]?.currency || "USD";

    let message = `✅ Created ${transactionCount} transaction${transactionCount > 1 ? "s" : ""}`;

    message += ` totaling ${totalAmount} ${currency}`;

    if (accountCount > 0) {
      message += `. Created ${accountCount} new account${accountCount > 1 ? "s" : ""}`;
    }

    return message;
  }

  /**
   * Build transaction card attachment with details
   */
  private buildTransactionCard(
    state: TransactionStateValues,
    journalEntryIds: string[]
  ): any {
    const isBatch = state.confirmedTransactions.length > 1;
    const totalAmount = state.confirmedTransactions.reduce(
      (sum, tx) => sum + tx.amount,
      0
    );
    const currency = state.confirmedTransactions[0]?.currency || "USD";

    const fields: any[] = [];

    // Add transaction details
    if (isBatch) {
      // Batch transactions - show summary + list
      fields.push({
        label: "Transaction Count",
        value: state.confirmedTransactions.length.toString(),
      });

      fields.push({
        label: "Total Amount",
        value: `${totalAmount} ${currency}`,
      });

      // List each transaction
      const transactionsList = state.confirmedTransactions
        .map((tx, index) => {
          const debitAccount = state.accountMappings[index]?.debitAccount;
          const creditAccount = state.accountMappings[index]?.creditAccount;
          return `${tx.description}: ${tx.amount} ${tx.currency} (${debitAccount?.name} → ${creditAccount?.name})`;
        })
        .join("\n");

      fields.push({
        label: "Transactions",
        value: transactionsList,
      });
    } else {
      // Single transaction - show details
      const tx = state.confirmedTransactions[0];
      const mapping = state.accountMappings[0];

      fields.push({
        label: "Description",
        value: tx.description,
      });

      fields.push({
        label: "Amount",
        value: `${tx.amount} ${tx.currency}`,
      });

      fields.push({
        label: "Date",
        value: tx.date,
      });

      fields.push({
        label: "Debit",
        value: `${mapping?.debitAccount.code} - ${mapping?.debitAccount.name}`,
      });

      fields.push({
        label: "Credit",
        value: `${mapping?.creditAccount.code} - ${mapping?.creditAccount.name}`,
      });
    }

    // Add new accounts if any were created
    if (state.newAccountsNeeded.length > 0) {
      const accountsList = state.newAccountsNeeded
        .map(acc => `${acc.code} - ${acc.name} (${acc.type})`)
        .join("\n");

      fields.push({
        label: "Created Accounts",
        value: accountsList,
      });
    }

    return {
      type: "card",
      value: {
        title: isBatch
          ? "✅ Transactions Created"
          : "✅ Transaction Created",
        fields,
        metadata: {
          cardType: isBatch
            ? "batch_transaction_success"
            : "transaction_success",
          journalEntryIds,
          transactionCount: state.confirmedTransactions.length,
          accountsCreated: state.newAccountsNeeded.length,
        },
      },
    };
  }
}
