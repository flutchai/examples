import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  TransactionStateValues,
  AccountMapping,
  NewAccountSpec,
} from "../transaction.state";
import { AccountIntelligenceService } from "../../../services/account-intelligence.service";
import { AccountService } from "../../../../service/account/account.service";
import { AccountType, NormalBalance } from "../../../../common/types";
import { LedgerGraphConfigValues } from "../../../../ledger-graph.builder";

/**
 * Build Transaction Node
 *
 * Uses Account Intelligence to determine debit/credit accounts for transactions.
 * Handles both single and batch transactions.
 * Identifies which accounts exist and which need to be created.
 */
@Injectable()
export class BuildTransactionNode {
  private readonly logger = new Logger(BuildTransactionNode.name);

  constructor(
    private readonly accountIntelligence: AccountIntelligenceService,
    private readonly accountService: AccountService
  ) {}

  async execute(
    state: TransactionStateValues,
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>
  ): Promise<Partial<TransactionStateValues>> {
    this.logger.log(
      `Building ${state.parsedTransactions.length} transaction(s)`
    );

    try {
      const userId = state.userId;

      // Get existing accounts
      const existingAccounts =
        await this.accountService.getUserAccounts(userId);
      this.logger.log(`Found ${existingAccounts.length} existing accounts`);

      // Analyze accounts for all transactions
      this.logger.debug(`About to analyze ${state.isBatch ? 'BATCH' : 'SINGLE'} transactions`);

      const analysis = state.isBatch
        ? await this.analyzeBatchTransactions(state, existingAccounts, config)
        : await this.analyzeSingleTransaction(state, existingAccounts, config);

      this.logger.debug(`Analysis returned: ${JSON.stringify(analysis ? 'HAS_ANALYSIS' : 'NO_ANALYSIS')}`);

      const needsConfirmation = analysis.newAccountsNeeded.length > 0;

      this.logger.log(
        `Account analysis complete. New accounts needed: ${analysis.newAccountsNeeded.length}, ` +
          `needs confirmation: ${needsConfirmation}`
      );

      return {
        accountMappings: analysis.accountMappings,
        newAccountsNeeded: analysis.newAccountsNeeded,
        needsConfirmation,
        metadata: {
          ...state.metadata,
          accountAnalysisComplete: true,
        },
      };
    } catch (error) {
      this.logger.error("Transaction building failed:", error);
      return {
        hasErrors: true,
        errorMessages: [error.message || "Failed to build transaction"],
      };
    }
  }

  /**
   * Analyze accounts for a single transaction
   */
  private async analyzeSingleTransaction(
    state: TransactionStateValues,
    existingAccounts: any[],
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>
  ) {
    const transaction = state.parsedTransactions[0];

    this.logger.log(
      `Analyzing accounts for single transaction: ${transaction.description}`
    );

    const accountAnalysisConfig =
      config.configurable?.graphSettings?.buildTransaction;
    const modelSettings = accountAnalysisConfig?.llmConfig;

    if (!modelSettings) {
      throw new Error("LLM configuration not found for account analysis");
    }

    // Get usage recorder from context
    const usageRecorder = (config as any)?.configurable?.context?.usageRecorder;

    // Use account intelligence service
    const result = await this.accountIntelligence.analyzeTransactionForAccounts(
      transaction.description,
      transaction.amount,
      transaction.currency || "USD",
      existingAccounts,
      modelSettings,
      usageRecorder,
      new Date().toISOString().split("T")[0]
    );

    // Log result for debugging
    this.logger.debug(`Account intelligence result: ${JSON.stringify(result, null, 2)}`);

    // Validate result structure
    if (!result || !result.suggestedAccounts) {
      throw new Error(`Invalid result from account intelligence: ${JSON.stringify(result)}`);
    }

    // Validate nested structure
    if (!result.suggestedAccounts.debitAccount) {
      throw new Error(`Missing debitAccount in result: ${JSON.stringify(result.suggestedAccounts)}`);
    }
    if (!result.suggestedAccounts.creditAccount) {
      throw new Error(`Missing creditAccount in result: ${JSON.stringify(result.suggestedAccounts)}`);
    }

    // Convert to our format
    const accountMapping: AccountMapping = {
      debitAccount: {
        code:
          result.suggestedAccounts.debitAccount.existingAccountCode ||
          result.suggestedAccounts.debitAccount.newAccountSuggestion
            ?.accountCode ||
          "",
        name: result.suggestedAccounts.debitAccount.existingAccountCode
          ? existingAccounts.find(
              a =>
                a.accountCode ===
                result.suggestedAccounts.debitAccount.existingAccountCode
            )?.accountName || ""
          : result.suggestedAccounts.debitAccount.newAccountSuggestion
              ?.accountName || "",
        type:
          result.suggestedAccounts.debitAccount.newAccountSuggestion
            ?.accountType || AccountType.EXPENSE,
        exists: !!result.suggestedAccounts.debitAccount.existingAccountCode,
      },
      creditAccount: {
        code:
          result.suggestedAccounts.creditAccount.existingAccountCode ||
          result.suggestedAccounts.creditAccount.newAccountSuggestion
            ?.accountCode ||
          "",
        name: result.suggestedAccounts.creditAccount.existingAccountCode
          ? existingAccounts.find(
              a =>
                a.accountCode ===
                result.suggestedAccounts.creditAccount.existingAccountCode
            )?.accountName || ""
          : result.suggestedAccounts.creditAccount.newAccountSuggestion
              ?.accountName || "",
        type:
          result.suggestedAccounts.creditAccount.newAccountSuggestion
            ?.accountType || AccountType.ASSET,
        exists: !!result.suggestedAccounts.creditAccount.existingAccountCode,
      },
      reasoning: result.recommendation?.explanation || "",
    };

    // Collect new accounts needed
    const newAccountsNeeded: NewAccountSpec[] = [];

    if (
      !accountMapping.debitAccount.exists &&
      result.suggestedAccounts.debitAccount.newAccountSuggestion
    ) {
      const suggestion =
        result.suggestedAccounts.debitAccount.newAccountSuggestion;
      newAccountsNeeded.push({
        code: suggestion.accountCode || "",
        name: suggestion.accountName || "",
        type: suggestion.accountType || AccountType.EXPENSE,
        normalBalance: this.determineNormalBalance(
          suggestion.accountType || AccountType.EXPENSE
        ),
        currency: transaction.currency || "USD",
      });
    }

    if (
      !accountMapping.creditAccount.exists &&
      result.suggestedAccounts.creditAccount.newAccountSuggestion
    ) {
      const suggestion =
        result.suggestedAccounts.creditAccount.newAccountSuggestion;
      newAccountsNeeded.push({
        code: suggestion.accountCode || "",
        name: suggestion.accountName || "",
        type: suggestion.accountType || AccountType.ASSET,
        normalBalance: this.determineNormalBalance(
          suggestion.accountType || AccountType.ASSET
        ),
        currency: transaction.currency || "USD",
      });
    }

    return {
      accountMappings: [accountMapping],
      newAccountsNeeded,
    };
  }

  /**
   * Analyze accounts for batch transactions
   */
  private async analyzeBatchTransactions(
    state: TransactionStateValues,
    existingAccounts: any[],
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>
  ) {
    const transactions = state.parsedTransactions;

    this.logger.log(
      `Analyzing accounts for ${transactions.length} transactions`
    );

    const accountAnalysisConfig =
      config.configurable?.graphSettings?.buildTransaction;
    const modelSettings = accountAnalysisConfig?.llmConfig;

    if (!modelSettings) {
      throw new Error("LLM configuration not found for account analysis");
    }

    // Get usage recorder from context
    const usageRecorder = (config as any)?.configurable?.context?.usageRecorder;

    // Use batch account intelligence
    const result = await this.accountIntelligence.analyzeBatchTransactions(
      transactions.map(tx => ({
        userInput: tx.description,
        amount: tx.amount,
        currency: tx.currency || "USD",
        date: tx.date,
        tags: tx.tags,
      })),
      existingAccounts,
      modelSettings,
      usageRecorder,
      new Date().toISOString().split("T")[0]
    );

    this.logger.debug(`Batch analysis result: ${JSON.stringify(result, null, 2)}`);

    // Validate result
    if (!result || !result.accountMappings || result.accountMappings.length === 0) {
      this.logger.error("Batch analysis returned no account mappings", { result });
      throw new Error("Batch account analysis failed: no account mappings returned");
    }

    if (result.accountMappings.length !== transactions.length) {
      this.logger.error(`Mismatch: ${transactions.length} transactions but ${result.accountMappings.length} mappings`, { result });
      throw new Error(`Account mapping count mismatch: expected ${transactions.length}, got ${result.accountMappings.length}`);
    }

    // Convert to our format
    const accountMappings: AccountMapping[] = result.accountMappings.map(
      mapping => ({
        debitAccount: {
          code: mapping.toAccount.code,
          name: mapping.toAccount.name,
          type: mapping.toAccount.type,
          exists: mapping.toAccount.exists,
        },
        creditAccount: {
          code: mapping.fromAccount.code,
          name: mapping.fromAccount.name,
          type: mapping.fromAccount.type,
          exists: mapping.fromAccount.exists,
        },
        reasoning: mapping.reasoning,
      })
    );

    // Convert new accounts
    const newAccountsNeeded: NewAccountSpec[] = result.newAccountsNeeded.map(
      acc => ({
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: this.determineNormalBalance(acc.type),
        currency: transactions[0]?.currency || "USD",
      })
    );

    return {
      accountMappings,
      newAccountsNeeded,
    };
  }

  /**
   * Determine normal balance based on account type
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
