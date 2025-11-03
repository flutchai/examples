import { PROMPTS_EN } from "./locales/en";

export interface PromptConfig {
  currentDate?: string;
  userName?: string;
  existingAccounts?: string;
  transactionDescription?: string;
  amount?: number;
  currency?: string;
  transactionCount?: number;
  transactionsList?: string;
  suggestedAccounts?: string;
  currentAccounts?: string;
  userText?: string;
}

/**
 * System prompts for Ledger graph
 */
export class SystemPrompts {
  private static getPrompts() {
    return PROMPTS_EN;
  }

  private static replacePlaceholders(
    template: string,
    config: PromptConfig
  ): string {
    let result = template;

    // Replace all placeholders
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), String(value));
      }
    });

    // Remove any remaining placeholders with empty string
    result = result.replace(/{{[^}]+}}/g, "");

    return result;
  }

  /**
   * Get prompt for analyzing a single transaction
   */
  static getTransactionAnalysisPrompt(config: PromptConfig = {}): string {
    const prompts = this.getPrompts();
    const defaults = {
      currentDate: new Date().toISOString().split("T")[0],
      ...config,
    };
    return this.replacePlaceholders(prompts.transactionAnalysis, defaults);
  }

  /**
   * Get prompt for analyzing batch transactions
   */
  static getBatchTransactionAnalysisPrompt(config: PromptConfig = {}): string {
    const prompts = this.getPrompts();
    const defaults = {
      currentDate: new Date().toISOString().split("T")[0],
      ...config,
    };
    return this.replacePlaceholders(prompts.batchTransactionAnalysis, defaults);
  }

  /**
   * Get prompt for account intelligence (single transaction)
   */
  static getAccountIntelligencePrompt(config: PromptConfig): string {
    const prompts = this.getPrompts();
    return this.replacePlaceholders(prompts.accountIntelligence, config);
  }

  /**
   * Get prompt for batch account intelligence
   */
  static getBatchAccountIntelligencePrompt(config: PromptConfig): string {
    const prompts = this.getPrompts();
    return this.replacePlaceholders(prompts.batchAccountIntelligence, config);
  }

  /**
   * Get prompt for account confirmation
   */
  static getAccountConfirmationPrompt(config: PromptConfig): string {
    const prompts = this.getPrompts();
    return this.replacePlaceholders(prompts.accountConfirmation, config);
  }

  /**
   * Get prompt for parsing account edit requests
   */
  static getAccountEditPrompt(config: PromptConfig): string {
    const prompts = this.getPrompts();
    return this.replacePlaceholders(prompts.accountEdit, config);
  }

  /**
   * Format existing accounts for prompts
   */
  static formatExistingAccounts(
    accounts: Array<{
      accountCode: string;
      accountName: string;
      accountType: string;
      balance?: number;
      currency?: string;
    }>
  ): string {
    if (!accounts || accounts.length === 0) {
      return "No existing accounts";
    }

    return accounts
      .map(acc => {
        const balance =
          acc.balance !== undefined
            ? ` (Balance: ${acc.balance} ${acc.currency || "USD"})`
            : "";
        return `- ${acc.accountCode}: ${acc.accountName} [${acc.accountType}]${balance}`;
      })
      .join("\n");
  }

  /**
   * Format transactions list for prompts
   */
  static formatTransactionsList(
    transactions: Array<{
      description: string;
      amount: number;
      currency?: string;
      date?: string;
    }>
  ): string {
    return transactions
      .map((tx, idx) => {
        const date = tx.date ? ` on ${tx.date}` : "";
        return `${idx + 1}. ${tx.description} - ${tx.amount} ${tx.currency || "USD"}${date}`;
      })
      .join("\n");
  }

  /**
   * Format suggested accounts for prompts
   */
  static formatSuggestedAccounts(
    accounts: Array<{
      code: string;
      name: string;
      type: string;
    }>
  ): string {
    return accounts
      .map(acc => `- ${acc.code}: ${acc.name} [${acc.type}]`)
      .join("\n");
  }
}
