import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  TransactionStateValues,
  ConfirmedTransaction,
} from "../transaction.state";
import { LedgerGraphConfigValues } from "../../../../ledger-graph.builder";

/**
 * Confirm Accounts Node - Auto-approve with smart defaults
 *
 * This node automatically approves account creation with LLM-generated names.
 * No interrupts - accounts are created seamlessly.
 *
 * Users can later rename/modify accounts via Account Management subgraph.
 */
@Injectable()
export class ConfirmAccountsNode {
  private readonly logger = new Logger(ConfirmAccountsNode.name);

  async execute(
    state: TransactionStateValues,
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<Partial<TransactionStateValues>> {
    this.logger.log("Auto-confirming account selection (no interrupt)");

    // Simply approve and build confirmed transactions
    // New accounts will be created automatically with LLM-generated names
    if (state.newAccountsNeeded.length > 0) {
      this.logger.log(
        `Auto-approving ${state.newAccountsNeeded.length} new accounts: ${state.newAccountsNeeded.map((a) => a.name).join(", ")}`,
      );
    }

    return await this.buildConfirmedTransactions(state);
  }

  /**
   * Build confirmed transactions ready for creation
   */
  private async buildConfirmedTransactions(
    state: TransactionStateValues,
  ): Promise<Partial<TransactionStateValues>> {
    const confirmedTransactions: ConfirmedTransaction[] =
      state.parsedTransactions.map((tx, idx) => {
        const mapping = state.accountMappings[idx];

        if (!mapping) {
          this.logger.error(`Missing account mapping for transaction ${idx}`, {
            tx,
          });
          throw new Error(
            `Missing account mapping for transaction at index ${idx}`,
          );
        }

        if (!mapping.debitAccount || !mapping.creditAccount) {
          this.logger.error(
            `Incomplete account mapping for transaction ${idx}`,
            { mapping },
          );
          throw new Error(
            `Incomplete account mapping: missing debit or credit account`,
          );
        }

        return {
          description: tx.description,
          amount: tx.amount,
          date: tx.date || new Date().toISOString().split("T")[0],
          currency: tx.currency || "USD",
          tags: tx.tags || [],
          debitAccountCode: mapping.debitAccount.code,
          creditAccountCode: mapping.creditAccount.code,
        };
      });

    this.logger.log(
      `Built ${confirmedTransactions.length} confirmed transactions`,
    );

    return {
      confirmedTransactions,
    };
  }
}
