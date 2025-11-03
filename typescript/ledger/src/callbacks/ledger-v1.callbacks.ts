// packages/graphs/ledger/src/callbacks/ledger-v1.callbacks.ts

import {
  Callback,
  ExtendedCallbackContext,
  CallbackResult,
} from "@flutchai/flutch-sdk";
import { Injectable, Logger } from "@nestjs/common";
import { AccountService } from "../service/account/account.service";
import { TransactionService } from "../service/transaction/transaction.service";
import { JournalEntryService } from "../service/journal-entry/journal-entry.service";
import { PendingAccountPlanService } from "../service/pending-account-plan/pending-account-plan.service";
import {
  Currency,
  JournalEntryStatus,
  NormalBalance,
  AccountType,
} from "../common/types";

/**
 * Callbacks for Ledger v1.0.0
 *
 * Contains all handlers for interactive user actions
 * for financial accounting and transaction management.
 */
@Injectable()
export class LedgerV1Callbacks {
  private readonly logger = new Logger(LedgerV1Callbacks.name);

  constructor() {
    this.logger.debug("LedgerV1Callbacks constructor called");
  }

  /**
   * Get service from builder's DI container
   */
  private getService<T>(
    context: ExtendedCallbackContext,
    serviceClass: new (...args: any[]) => T
  ): T {
    if (!context.builder || typeof context.builder.getService !== "function") {
      throw new Error("Builder instance not available in callback context");
    }
    return context.builder.getService(serviceClass);
  }

  /**
   * User confirms the transaction
   */
  @Callback("approve-transaction")
  async handleApproveTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction approval", {
      userId: context.userId,
      transactionId: context.params.transactionId,
    });

    try {
      const { transactionId, amount, description } = context.params;

      if (!transactionId) {
        return {
          success: false,
          error: "Transaction ID is required",
        };
      }

      // Access builder methods through context
      if (context.builder) {
        this.logger.debug(
          `Processing with builder: ${context.builder.constructor.name}`
        );
        // Can call builder methods, for example:
        // const validationResult = await context.builder.validateTransactionId(transactionId);
      }

      // Transaction confirmation logic
      // In a real implementation, this would be a database call

      return {
        success: true,
        message: `✅ Transaction ${transactionId} confirmed`,
        patch: {
          text: `Transaction confirmed!\n\n💰 Amount: ${amount}\n📝 Description: ${description}\n✅ Status: Confirmed`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error approving transaction", error);
      return {
        success: false,
        error: "Error confirming transaction",
      };
    }
  }

  /**
   * User rejects the transaction
   */
  @Callback("reject-transaction")
  async handleRejectTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction rejection", {
      userId: context.userId,
      transactionId: context.params.transactionId,
    });

    try {
      const { transactionId, amount, description } = context.params;

      if (!transactionId) {
        return {
          success: false,
          error: "Transaction ID is required",
        };
      }

      // Transaction rejection logic

      return {
        success: true,
        message: `❌ Transaction ${transactionId} rejected`,
        patch: {
          text: `Transaction rejected\n\n💰 Amount: ${amount}\n📝 Description: ${description}\n❌ Status: Rejected`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error rejecting transaction", error);
      return {
        success: false,
        error: "Error rejecting transaction",
      };
    }
  }

  /**
   * Change transaction category
   */
  @Callback("update-category")
  async handleUpdateCategory(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing category update", {
      userId: context.userId,
      transactionId: context.params.transactionId,
    });

    try {
      const { transactionId, newCategory, oldCategory } = context.params;

      if (!transactionId || !newCategory) {
        return {
          success: false,
          error: "Transaction ID and new category are required",
        };
      }

      // Category update logic

      // In a real system, new buttons are created in the graph, not in the callback
      return {
        success: true,
        message: `📂 Category updated: ${oldCategory} → ${newCategory}`,
        patch: {
          text: `Transaction category changed\n\n🔄 ${oldCategory} → ${newCategory}\n✅ Changes saved`,
          disableButtons: true, // Disable current buttons
        },
      };
    } catch (error) {
      this.logger.error("Error updating category", error);
      return {
        success: false,
        error: "Error changing category",
      };
    }
  }

  /**
   * Revert category change
   */
  @Callback("revert-category")
  async handleRevertCategory(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing category revert", {
      userId: context.userId,
      transactionId: context.params.transactionId,
    });

    try {
      const { transactionId, oldCategory, newCategory } = context.params;

      // Category revert logic

      return {
        success: true,
        message: `↩️ Category reverted: ${newCategory} → ${oldCategory}`,
        patch: {
          text: `Category change cancelled\n\n↩️ ${newCategory} → ${oldCategory}\n✅ Restored`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error reverting category", error);
      return {
        success: false,
        error: "Error reverting change",
      };
    }
  }

  /**
   * Request additional transaction information
   */
  @Callback("get-transaction-details")
  async handleGetTransactionDetails(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Getting transaction details", {
      userId: context.userId,
      transactionId: context.params.transactionId,
    });

    try {
      const { transactionId } = context.params;

      if (!transactionId) {
        return {
          success: false,
          error: "Transaction ID is required",
        };
      }

      // In a real implementation, this would be an API or DB query
      const transactionDetails = {
        id: transactionId,
        amount: context.params.amount || 1500.5,
        date: new Date().toLocaleDateString(),
        category: "Groceries",
        description: "Supermarket purchases",
        account: "Main card",
        status: "Processed",
      };

      // Transaction details - this is an informational callback, it doesn't create new buttons
      return {
        success: true,
        message: "📊 Transaction details loaded",
        attachments: [
          {
            text: `🧾 **Detailed transaction information**

🆔 **ID:** ${transactionDetails.id}
💰 **Amount:** ${transactionDetails.amount}
📅 **Date:** ${transactionDetails.date}
📂 **Category:** ${transactionDetails.category}
📝 **Description:** ${transactionDetails.description}
💳 **Account:** ${transactionDetails.account}
📊 **Status:** ${transactionDetails.status}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error("Error getting transaction details", error);
      return {
        success: false,
        error: "Error retrieving transaction information",
      };
    }
  }

  /**
   * Confirm creation of new accounts for transaction
   */
  @Callback("approve-transaction-with-accounts")
  async handleApproveTransactionWithAccounts(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction approval with new accounts", {
      userId: context.userId,
      threadId: context.params.threadId,
    });

    try {
      const { createAccounts, debitAccount, creditAccount, threadId } =
        context.params;

      if (!debitAccount || !creditAccount) {
        return {
          success: false,
          error: "Both debit and credit account information is required",
        };
      }

      const resolvedAccounts: any = {};

      // Create new accounts if needed
      if (createAccounts) {
        // Create debit account
        const accountService = this.getService(context, AccountService);
        const createdDebitAccount = await accountService.createAccount({
          userId: context.userId,
          accountCode: debitAccount.accountCode,
          accountName: debitAccount.accountName,
          accountType: debitAccount.accountType,
          normalBalance: debitAccount.normalBalance,
          parentAccount: null,
        });

        // Create credit account
        const createdCreditAccount = await accountService.createAccount({
          userId: context.userId,
          accountCode: creditAccount.accountCode,
          accountName: creditAccount.accountName,
          accountType: creditAccount.accountType,
          normalBalance: creditAccount.normalBalance,
          parentAccount: null,
        });

        resolvedAccounts.fromAccount = {
          code: createdCreditAccount.accountCode,
          name: createdCreditAccount.accountName,
          type: createdCreditAccount.accountType,
        };
        resolvedAccounts.toAccount = {
          code: createdDebitAccount.accountCode,
          name: createdDebitAccount.accountName,
          type: createdDebitAccount.accountType,
        };

        this.logger.log("Created new accounts:", {
          debit: createdDebitAccount.accountName,
          credit: createdCreditAccount.accountName,
        });
      }

      // Continue workflow with created accounts
      if (context.builder) {
        // Update workflow state
        const workflowUpdate = {
          resolvedAccounts,
          accountsResolved: true,
          waitingFor: null,
          nextStep: "build_transaction",
        };

        // Call workflow continuation through builder
        this.logger.log("Continuing workflow with resolved accounts");
      }

      return {
        success: true,
        message: `✅ Accounts created and transaction ready for posting`,
        patch: {
          text: `New accounts created successfully!\n\n📈 **Debit:** ${debitAccount.accountCode} - ${debitAccount.accountName}\n📉 **Credit:** ${creditAccount.accountCode} - ${creditAccount.accountName}\n\n✅ Transaction will be posted automatically.`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error creating accounts for transaction", error);
      return {
        success: false,
        error: "Error creating accounts",
      };
    }
  }

  /**
   * Modify suggested account names
   */
  @Callback("modify-account-names")
  async handleModifyAccountNames(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing account name modifications", {
      userId: context.userId,
      threadId: context.params.threadId,
    });

    try {
      const { suggestions, threadId } = context.params;

      if (!suggestions) {
        return {
          success: false,
          error: "Account suggestions are required",
        };
      }

      // Create interactive form for editing names
      const message = `
📝 **Edit account names**

You can modify the suggested account names before creating them:

**📈 Debit account:**
Code: ${suggestions.debitAccount.newAccountSuggestion?.accountCode}
Current name: ${suggestions.debitAccount.newAccountSuggestion?.accountName}
Type: ${suggestions.debitAccount.newAccountSuggestion?.accountType}

**📉 Credit account:**
Code: ${suggestions.creditAccount.newAccountSuggestion?.accountCode}
Current name: ${suggestions.creditAccount.newAccountSuggestion?.accountName}
Type: ${suggestions.creditAccount.newAccountSuggestion?.accountType}

💡 Write new names or press "Keep as is" to continue.
      `;

      return {
        success: true,
        message: "🖊️ Account editing form",
        patch: {
          text: message,
          disableButtons: false,
        },
      };
    } catch (error) {
      this.logger.error("Error modifying account names", error);
      return {
        success: false,
        error: "Error changing account names",
      };
    }
  }

  /**
   * Show existing account selection
   */
  @Callback("show-account-selection")
  async handleShowAccountSelection(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Showing account selection options", {
      userId: context.userId,
      threadId: context.params.threadId,
    });

    try {
      const { threadId } = context.params;

      // Get user's existing accounts
      const accountService = this.getService(context, AccountService);
      const existingAccounts = await accountService.getUserAccounts(
        context.userId
      );

      if (existingAccounts.length === 0) {
        return {
          success: false,
          error: "You have no existing accounts to select from",
        };
      }

      const accountList = existingAccounts
        .map(
          acc =>
            `• ${acc.accountCode} - ${acc.accountName} (${acc.accountType})`
        )
        .join("\n");

      const message = `
📋 **Select existing accounts**

Available accounts:
${accountList}

💡 Use commands to select accounts or create new ones.
      `;

      return {
        success: true,
        message: "📋 List of available accounts",
        patch: {
          text: message,
          disableButtons: false,
        },
      };
    } catch (error) {
      this.logger.error("Error showing account selection", error);
      return {
        success: false,
        error: "Error showing account list",
      };
    }
  }

  /**
   * Cancel transaction
   * Changes JournalEntry status from DRAFT to REVERTED
   */
  @Callback("cancel-transaction")
  async handleCancelTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction cancellation", {
      userId: context.userId,
      threadId: context.params.threadId,
      journalEntryId: context.params.journalEntryId,
    });

    try {
      const { threadId, journalEntryId } = context.params;

      if (journalEntryId) {
        try {
          const journalEntryService = this.getService(
            context,
            JournalEntryService
          );

          // Get journal entry to check status
          const entry =
            await journalEntryService.getJournalEntry(journalEntryId);

          if (entry.status === "DRAFT") {
            // Revert draft transaction (mark as cancelled)
            await journalEntryService.reverseJournalEntry(
              journalEntryId,
              "Cancelled by user"
            );

            this.logger.log(
              `JournalEntry ${journalEntryId} cancelled (status changed to REVERTED)`
            );
          } else {
            this.logger.warn(
              `Cannot cancel JournalEntry ${journalEntryId} - status is ${entry.status}, not DRAFT`
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to cancel JournalEntry ${journalEntryId}:`,
            error
          );
          // Continue with cancellation message even if DB update fails
        }
      }

      return {
        success: true,
        message: "❌ Transaction cancelled",
        patch: {
          text: "Transaction was cancelled by user.\n\n💡 You can start a new transaction at any time.",
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error cancelling transaction", error);
      return {
        success: false,
        error: "Error cancelling transaction",
      };
    }
  }

  /**
   * Confirm transaction from card
   * Changes JournalEntry status from DRAFT to POSTED
   */
  @Callback("confirm-transaction")
  async handleConfirmTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction confirmation from card", {
      userId: context.userId,
      params: context.params,
    });

    try {
      const { journalEntryId } = context.params;

      if (!journalEntryId) {
        return {
          success: false,
          error: "Journal Entry ID is required",
        };
      }

      const journalEntryService = this.getService(context, JournalEntryService);
      const accountService = this.getService(context, AccountService);

      // Load DRAFT JournalEntry
      const journalEntry =
        await journalEntryService.getJournalEntry(journalEntryId);
      if (!journalEntry) {
        return {
          success: false,
          error: `Journal Entry ${journalEntryId} not found`,
        };
      }

      if (journalEntry.status !== JournalEntryStatus.DRAFT) {
        return {
          success: false,
          error: `Journal Entry ${journalEntryId} is not in DRAFT status (current: ${journalEntry.status})`,
        };
      }

      // Create pending accounts and update entries
      for (const entry of journalEntry.entries) {
        if (entry.pendingAccountData) {
          const accountCode = entry.pendingAccountData.code;
          this.logger.log(
            `Creating pending account ${accountCode}: ${entry.pendingAccountData.name}`
          );

          try {
            const createdAccount = await accountService.createAccount({
              userId: context.userId,
              accountCode: accountCode,
              accountName: entry.pendingAccountData.name,
              accountType: entry.pendingAccountData.type as AccountType,
              normalBalance:
                entry.debitAmount > 0
                  ? NormalBalance.DEBIT
                  : NormalBalance.CREDIT,
              parentAccount: entry.pendingAccountData.parentCode || null,
            });

            // Update entry with real accountId
            entry.accountId = createdAccount._id as any;
            delete (entry as any).pendingAccountData; // Remove pending data

            this.logger.log(`Account ${accountCode} created successfully`);
          } catch (error) {
            this.logger.error(
              `Failed to create account ${accountCode}:`,
              error
            );
            return {
              success: false,
              error: `Failed to create account ${accountCode}`,
            };
          }
        }
      }

      // Save updated entries if we created any accounts
      if (journalEntry.entries.some(e => !e.pendingAccountData)) {
        await journalEntry.save();
      }

      // Post the journal entry (DRAFT → POSTED)
      const postResult =
        await journalEntryService.postJournalEntry(journalEntryId);

      if (!postResult.success) {
        this.logger.error(
          `Failed to post JournalEntry ${journalEntryId}: ${postResult.error}`
        );
        return {
          success: false,
          error: `Failed to post transaction: ${postResult.error}`,
        };
      }

      this.logger.log(`JournalEntry ${journalEntryId} posted successfully`);

      // Reload journal entry with populated accounts
      const populatedEntry =
        await journalEntryService.getJournalEntry(journalEntryId);

      // Format response with actual data from journal entry
      const debitEntry = populatedEntry.entries.find(e => e.debitAmount > 0);
      const creditEntry = populatedEntry.entries.find(e => e.creditAmount > 0);

      // Get account names from populated accountId
      const debitAccountName =
        (debitEntry?.accountId as any)?.accountName || "Unknown";
      const creditAccountName =
        (creditEntry?.accountId as any)?.accountName || "Unknown";

      return {
        success: true,
        message: `✅ Transaction posted: ${journalEntryId}`,
        patch: {
          text: `✅ **Transaction successfully posted!**

💰 **Amount:** ${debitEntry?.debitAmount || 0}
📝 **Description:** ${populatedEntry.description}
📈 **Debit:** ${debitAccountName}
📉 **Credit:** ${creditAccountName}
📅 **Date:** ${new Date(populatedEntry.date).toLocaleDateString()}
🆔 **ID:** ${journalEntryId}

✅ Transaction recorded in ledger and posted.`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error confirming transaction", error);
      return {
        success: false,
        error: "Error confirming transaction",
      };
    }
  }

  /**
   * Confirm simple transaction (fallback)
   */
  @Callback("confirm-simple-transaction")
  async handleConfirmSimpleTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing simple transaction confirmation", {
      userId: context.userId,
      params: context.params,
    });

    try {
      const { description, fallback } = context.params;

      return {
        success: true,
        message: "✅ Simple transaction confirmed",
        patch: {
          text: `✅ **Transaction confirmed**

📝 **Description:** ${description}
⚡ **Type:** Simplified processing
📅 **Time:** ${new Date().toLocaleString()}

${fallback ? "⚠️ Processed without AI" : ""}

✅ Information saved.`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error confirming simple transaction", error);
      return {
        success: false,
        error: "Error confirming transaction",
      };
    }
  }

  /**
   * Confirm account creation plan and transaction
   * Creates accounts and posts transaction in one MongoDB transaction
   */
  @Callback("confirm-account-plan")
  async handleConfirmAccountPlan(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing account plan confirmation", {
      userId: context.userId,
      planId: context.params.planId,
    });

    try {
      const { planId } = context.params;

      if (!planId) {
        return {
          success: false,
          error: "Plan ID is required",
        };
      }

      const pendingAccountPlanService = this.getService(
        context,
        PendingAccountPlanService
      );

      // Load plan
      const plan = await pendingAccountPlanService.getPlanById(planId);
      if (!plan) {
        return {
          success: false,
          error: `Plan ${planId} not found`,
        };
      }

      // Confirm plan (creates accounts + transaction in MongoDB transaction)
      const journalEntryId =
        await pendingAccountPlanService.confirmPlan(planId);

      this.logger.log(
        `Account plan ${planId} confirmed, created JournalEntry ${journalEntryId}`
      );

      // Format account list
      const accountsList = plan.accountsToCreate
        .map(acc => `• ${acc.code} - ${acc.name}`)
        .join("\n");

      return {
        success: true,
        message: `✅ Accounts created and transaction posted`,
        patch: {
          text: `✅ **Transaction successfully posted!**

📊 **Created accounts:**
${accountsList}

💰 **Amount:** ${plan.transactionToCreate.entries[0]?.debitAmount || 0}
📝 **Description:** ${plan.transactionToCreate.description}
📅 **Date:** ${new Date(plan.transactionToCreate.date).toLocaleDateString()}
🆔 **ID:** ${journalEntryId}

✅ Transaction recorded in ledger and posted.`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error confirming account plan", error);
      return {
        success: false,
        error: `Error creating accounts: ${error.message}`,
      };
    }
  }

  /**
   * Cancel account creation plan
   */
  @Callback("cancel-account-plan")
  async handleCancelAccountPlan(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing account plan cancellation", {
      userId: context.userId,
      planId: context.params.planId,
    });

    try {
      const { planId } = context.params;

      if (!planId) {
        return {
          success: false,
          error: "Plan ID is required",
        };
      }

      const pendingAccountPlanService = this.getService(
        context,
        PendingAccountPlanService
      );

      // Reject plan
      await pendingAccountPlanService.rejectPlan(planId);

      this.logger.log(`Account plan ${planId} cancelled`);

      return {
        success: true,
        message: "❌ Plan cancelled",
        patch: {
          text: "Account creation plan was cancelled.\n\n💡 You can start a new transaction at any time.",
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error cancelling account plan", error);
      return {
        success: false,
        error: "Error cancelling plan",
      };
    }
  }

  /**
   * Revert (reverse) an already posted transaction
   * Changes JournalEntry status from POSTED to REVERTED
   */
  @Callback("revert-transaction")
  async handleRevertTransaction(
    context: ExtendedCallbackContext
  ): Promise<CallbackResult> {
    this.logger.log("Processing transaction revert", {
      userId: context.userId,
      journalEntryId: context.params.journalEntryId,
    });

    try {
      const { journalEntryId } = context.params;

      if (!journalEntryId) {
        return {
          success: false,
          error: "Journal Entry ID is required",
        };
      }

      const journalEntryService = this.getService(context, JournalEntryService);

      // Get journal entry
      const entry = await journalEntryService.getJournalEntry(journalEntryId);
      if (!entry) {
        return {
          success: false,
          error: `Transaction ${journalEntryId} not found`,
        };
      }

      if (entry.status !== JournalEntryStatus.POSTED) {
        return {
          success: false,
          error: `Cannot revert transaction ${journalEntryId} - status is ${entry.status}, not POSTED`,
        };
      }

      // Reverse the journal entry
      await journalEntryService.reverseJournalEntry(
        journalEntryId,
        "Reverted by user"
      );

      this.logger.log(`JournalEntry ${journalEntryId} reverted successfully`);

      return {
        success: true,
        message: `↩️ Transaction reverted: ${journalEntryId}`,
        patch: {
          text: `↩️ **Transaction reverted**

🆔 **ID:** ${journalEntryId}
📝 **Description:** ${entry.description}
💰 **Amount:** ${entry.entries[0]?.debitAmount || 0}

❌ Transaction was reverted and marked as REVERTED in the ledger.

💡 You can create a new transaction at any time.`,
          disableButtons: true,
        },
      };
    } catch (error) {
      this.logger.error("Error reverting transaction", error);
      return {
        success: false,
        error: `Error reverting transaction: ${error.message}`,
      };
    }
  }

  /**
   * Determine normal balance based on account type
   * Assets and Expenses have DEBIT balance
   * Liabilities, Equity, and Revenue have CREDIT balance
   */
  private determineNormalBalance(accountType: AccountType): NormalBalance {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return NormalBalance.DEBIT;
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return NormalBalance.CREDIT;
      default:
        return NormalBalance.DEBIT;
    }
  }
}
