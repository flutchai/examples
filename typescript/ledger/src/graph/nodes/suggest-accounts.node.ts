import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { WorkflowStateValues } from "../graph.state";
import { AccountService } from "../../service/account/account.service";
import {
  AccountIntelligenceService,
  AccountAnalysis,
} from "../services/account-intelligence.service";

@Injectable()
export class SuggestAccountsNode {
  private readonly logger = new Logger(SuggestAccountsNode.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly accountIntelligence: AccountIntelligenceService,
  ) {}

  async execute(
    state: WorkflowStateValues,
    config: LangGraphRunnableConfig<any>,
  ): Promise<Partial<WorkflowStateValues>> {
    this.logger.log("Suggesting accounts for transaction using LLM analysis");

    try {
      if (!state.parsedIntent) {
        throw new Error("Cannot suggest accounts without parsed intent");
      }

      const { description, amount, userId } = state.input;

      const suggestAccountsConfig =
        config.configurable?.graphSettings?.suggestAccounts;
      const modelSettings = suggestAccountsConfig?.llmConfig;

      // If explicitly disabled, skip account suggestion
      if (suggestAccountsConfig?.enabled === false) {
        this.logger.log("Account suggestion disabled, using default accounts");

        return {
          resolvedAccounts: {
            fromAccount: null,
            toAccount: null,
            defaultAccountsUsed: true,
          },
        };
      }

      if (!modelSettings) {
        throw new Error("LLM configuration not found for account suggestion");
      }

      // Get existing accounts
      const existingAccounts =
        await this.accountService.getUserAccounts(userId);

      // Analyze with LLM
      const currency =
        state.parsedIntent?.currency ||
        state.resolvedAccounts?.fromAccount?.currency ||
        state.resolvedAccounts?.toAccount?.currency ||
        "USD";

      const currentDate = new Date().toISOString().split("T")[0]; // Format: YYYY-MM-DD

      const analysis =
        await this.accountIntelligence.analyzeTransactionForAccounts(
          description,
          amount,
          currency,
          existingAccounts,
          modelSettings,
          (config as any)?.configurable?.context?.usageRecorder,
          currentDate,
        );

      this.logger.log(
        `Account analysis complete: ${analysis.recommendation.action}, confidence: ${analysis.recommendation.confidence}`,
      );

      // Handle analysis result
      return await this.handleAnalysisResult(state, analysis, existingAccounts);
    } catch (error) {
      this.logger.error("Account suggestion failed:", error);

      return {
        progress: {
          ...state.progress,
          hasErrors: true,
          errorMessages: [
            ...(state.progress?.errorMessages || []),
            error.message,
          ],
        },
      };
    }
  }

  private async handleAnalysisResult(
    state: WorkflowStateValues,
    analysis: AccountAnalysis,
    existingAccounts: any[],
  ): Promise<Partial<WorkflowStateValues>> {
    const txnCurrency =
      state.parsedIntent?.currency ||
      state.resolvedAccounts?.fromAccount?.currency ||
      state.resolvedAccounts?.toAccount?.currency ||
      "USD";

    // Case 1: Use existing accounts
    if (analysis.recommendation.action === "use_existing") {
      this.logger.log("Using existing accounts based on LLM recommendation");

      const debitAccount = existingAccounts.find(
        (acc) =>
          acc.accountCode ===
          analysis.suggestedAccounts.debitAccount.existingAccountCode,
      );
      const creditAccount = existingAccounts.find(
        (acc) =>
          acc.accountCode ===
          analysis.suggestedAccounts.creditAccount.existingAccountCode,
      );

      return {
        resolvedAccounts: {
          fromAccount: {
            code: creditAccount?.accountCode,
            name: creditAccount?.accountName,
            type: creditAccount?.accountType,
            currency: creditAccount?.currency || txnCurrency,
          },
          toAccount: {
            code: debitAccount?.accountCode,
            name: debitAccount?.accountName,
            type: debitAccount?.accountType,
            currency: debitAccount?.currency || txnCurrency,
          },
          defaultAccountsUsed: false,
        },
        parsedIntent: { ...state.parsedIntent, currency: txnCurrency },
        accountsResolved: true,
        llmAnalysis: analysis,
      };
    }

    // Case 2: Create new accounts
    if (analysis.recommendation.action === "create_new") {
      this.logger.log(
        "New accounts will be created - proceeding to build transaction",
      );

      const debitAccount =
        analysis.suggestedAccounts.debitAccount.newAccountSuggestion;
      const creditAccount =
        analysis.suggestedAccounts.creditAccount.newAccountSuggestion;

      return {
        resolvedAccounts: {
          fromAccount: {
            code: creditAccount?.accountCode,
            name: creditAccount?.accountName,
            type: creditAccount?.accountType,
            isNew: true,
            currency: txnCurrency,
          },
          toAccount: {
            code: debitAccount?.accountCode,
            name: debitAccount?.accountName,
            type: debitAccount?.accountType,
            isNew: true,
            currency: txnCurrency,
          },
          defaultAccountsUsed: false,
        },
        parsedIntent: { ...state.parsedIntent, currency: txnCurrency },
        accountsResolved: true,
        llmAnalysis: analysis,
      };
    }

    // Case 3: Mixed scenario (some existing, some new)
    this.logger.log("Mixed account scenario - using existing and new accounts");

    const hasExistingDebit =
      !!analysis.suggestedAccounts.debitAccount.existingAccountCode;
    const hasExistingCredit =
      !!analysis.suggestedAccounts.creditAccount.existingAccountCode;

    // Resolve debit account
    const existingDebitAccount = hasExistingDebit
      ? existingAccounts.find(
          (acc) =>
            acc.accountCode ===
            analysis.suggestedAccounts.debitAccount.existingAccountCode,
        )
      : null;

    const debitAccount =
      existingDebitAccount ||
      analysis.suggestedAccounts.debitAccount.newAccountSuggestion;

    // Resolve credit account
    const existingCreditAccount = hasExistingCredit
      ? existingAccounts.find(
          (acc) =>
            acc.accountCode ===
            analysis.suggestedAccounts.creditAccount.existingAccountCode,
        )
      : null;

    const creditAccount =
      existingCreditAccount ||
      analysis.suggestedAccounts.creditAccount.newAccountSuggestion;

    return {
      resolvedAccounts: {
        fromAccount: {
          code: creditAccount?.accountCode,
          name: creditAccount?.accountName,
          type: creditAccount?.accountType,
          isNew: !hasExistingCredit,
          currency: (creditAccount as any)?.currency || txnCurrency,
        },
        toAccount: {
          code: debitAccount?.accountCode,
          name: debitAccount?.accountName,
          type: debitAccount?.accountType,
          isNew: !hasExistingDebit,
          currency: (debitAccount as any)?.currency || txnCurrency,
        },
        defaultAccountsUsed: false,
      },
      parsedIntent: { ...state.parsedIntent, currency: txnCurrency },
      accountsResolved: true,
      llmAnalysis: analysis,
    };
  }
}
