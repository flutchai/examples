import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  TransactionStateValues,
  ParsedTransaction,
} from "../transaction.state";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { SystemPrompts } from "../../../../prompts/system-prompts";
import { z } from "zod";
import { LedgerGraphConfigValues } from "../../../../ledger-graph.builder";

// Schema for single transaction
const TransactionSchema = z.object({
  description: z.string().describe("Transaction description"),
  amount: z.number().positive().describe("Transaction amount"),
  date: z
    .string()
    .nullable()
    .optional()
    .describe("Transaction date (ISO format or null for today)"),
  currency: z
    .string()
    .nullable()
    .optional()
    .describe("Currency code (e.g., USD, EUR, RUB)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags or categories for the transaction"),
});

// Schema for analyzing transactions (single or batch)
const TransactionAnalysisSchema = z.object({
  transactions: z
    .array(TransactionSchema)
    .describe("Array of parsed transactions (1+ items)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in parsing accuracy"),
  reasoning: z
    .string()
    .describe("Brief explanation of how transactions were parsed"),
});

type TransactionAnalysis = z.infer<typeof TransactionAnalysisSchema>;

/**
 * Analyze Transaction Node
 *
 * Parses user's message to extract transaction details.
 * Handles both single transactions and batches.
 * Uses i18n prompts based on detected locale.
 */
@Injectable()
export class AnalyzeTransactionNode {
  private readonly logger = new Logger(AnalyzeTransactionNode.name);

  constructor(private readonly llmInitializer: ModelInitializer) {}

  async execute(
    state: TransactionStateValues,
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<Partial<TransactionStateValues>> {
    this.logger.log("Analyzing transaction(s) from user message");

    try {
      // Parse transactions
      const analysis = await this.analyzeTransactions(
        state.description,
        state.messages || [],
        config,
      );

      const isBatch = analysis.transactions.length > 1;
      this.logger.log(
        `Parsed ${analysis.transactions.length} transaction(s), ` +
          `batch: ${isBatch}, confidence: ${analysis.confidence}`,
      );

      // Convert to ParsedTransaction format
      const parsedTransactions: ParsedTransaction[] = analysis.transactions.map(
        (tx) => ({
          description: tx.description,
          amount: tx.amount,
          date: tx.date || undefined,
          currency: tx.currency || "USD",
          tags: tx.tags || [],
        }),
      );

      return {
        parsedTransactions,
        isBatch,
        metadata: {
          analysisConfidence: analysis.confidence,
          analysisReasoning: analysis.reasoning,
        },
      };
    } catch (error) {
      this.logger.error("Transaction analysis failed:", error);
      return {
        hasErrors: true,
        errorMessages: [error.message || "Failed to analyze transaction"],
      };
    }
  }

  private async analyzeTransactions(
    description: string,
    messages: any[],
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<TransactionAnalysis> {
    // Get LLM config
    const analyzeConfig =
      config.configurable?.graphSettings?.analyzeTransaction;
    const modelSettings = analyzeConfig?.llmConfig;

    if (!modelSettings) {
      throw new Error("LLM configuration not found for transaction analysis");
    }

    const modelId = modelSettings.modelId;
    const temperature = modelSettings.temperature || 0.3;
    const maxTokens = modelSettings.maxTokens || 4000;

    // Initialize model
    const baseModel = await this.llmInitializer.initializeChatModel({
      modelId,
      temperature,
      maxTokens,
    });

    const model = baseModel.withStructuredOutput(TransactionAnalysisSchema, {
      name: "analyze_transactions",
      includeRaw: true,
    });

    // Determine if likely batch based on line breaks and multiple amounts
    const hasMultipleLines = description.split("\n").length > 2;
    const amountMatches = description.match(/\d+[.,]?\d*/g) || [];
    const likelyBatch = hasMultipleLines && amountMatches.length > 1;

    // Get appropriate prompt
    const systemPrompt = likelyBatch
      ? SystemPrompts.getBatchTransactionAnalysisPrompt()
      : SystemPrompts.getTransactionAnalysisPrompt();

    this.logger.debug(
      `Using ${likelyBatch ? "batch" : "single"} analysis prompt`,
    );

    // Invoke LLM
    const result = await model.invoke(
      [new SystemMessage(systemPrompt), ...messages],
      config,
    );

    if (!result || !result.parsed) {
      this.logger.error("LLM returned empty or invalid result");

      // Fallback: try to extract basic info
      const fallbackAmount = this.extractAmount(description);
      if (fallbackAmount > 0) {
        return {
          transactions: [
            {
              description: description.substring(0, 100),
              amount: fallbackAmount,
              date: null,
              currency: this.extractCurrency(description),
              tags: [],
            },
          ],
          confidence: 0.3,
          reasoning: "Fallback parsing due to LLM error",
        };
      }

      throw new Error(
        "Failed to parse transactions and fallback extraction failed",
      );
    }

    return result.parsed as TransactionAnalysis;
  }

  /**
   * Fallback: Extract amount from text using regex
   */
  private extractAmount(text: string): number {
    const amountPattern = /(\d+[.,]?\d*)\s*(?:\$|₽|€|USD|RUB|EUR)?/i;
    const match = text.match(amountPattern);
    if (match && match[1]) {
      return parseFloat(match[1].replace(",", "."));
    }
    return 0;
  }

  /**
   * Fallback: Extract currency from text
   */
  private extractCurrency(text: string): string {
    if (/\$|USD/i.test(text)) return "USD";
    if (/₽|RUB|rub/i.test(text)) return "RUB";
    if (/€|EUR|euro/i.test(text)) return "EUR";
    return "USD";
  }
}
