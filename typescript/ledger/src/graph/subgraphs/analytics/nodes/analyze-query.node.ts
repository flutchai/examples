import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { HumanMessage } from "@langchain/core/messages";
import { AnalyticsStateValues } from "../analytics.state";

/**
 * Analyze Query Node
 *
 * Uses LLM to analyze user's analytical query and determine:
 * - What the user wants to know
 * - Which tools/data sources are needed
 * - How to structure the analysis
 */
@Injectable()
export class AnalyzeQueryNode {
  private readonly logger = new Logger(AnalyzeQueryNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: AnalyticsStateValues,
    config: LangGraphRunnableConfig
  ): Promise<Partial<AnalyticsStateValues>> {
    this.logger.log(`[ANALYTICS] Analyzing query: ${state.query}`);

    try {
      // Get LLM model
      const model = await this.modelInitializer.initializeChatModel({
        modelId: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 500,
      });

      if (!model) {
        throw new Error("Failed to initialize LLM model");
      }

      const analysisPrompt = `You are a financial analytics assistant. Analyze the user's query and determine what analytical tools and data are needed.

User Query: "${state.query}"

Available analytical capabilities:
1. **get_account_balances** - Get current balances for all or specific accounts
2. **get_transaction_history** - Get transaction history with filters (date range, account, type)
3. **calculate_period_comparison** - Compare financial metrics between periods
4. **analyze_spending_patterns** - Analyze spending by category or account
5. **generate_financial_summary** - Generate summary reports (P&L, Balance Sheet, etc.)
6. **generate_chart** - Create visual chart from data (use when user asks to "show", "visualize", "chart", "graph", "plot")

IMPORTANT: If the user wants to SEE or VISUALIZE data (words like "show me", "display", "chart", "graph", "visualize"), always include "generate_chart" as the LAST tool in the list.

Respond in JSON format:
{
  "intent": "Brief description of what user wants to know",
  "tools": ["tool1", "tool2", "generate_chart"],
  "parameters": {
    "dateRange": "optional date range if mentioned",
    "accounts": "optional specific accounts if mentioned",
    "period": "optional period like 'last month', 'this year'",
    "chartType": "optional chart type if specified: line, bar, pie, area"
  }
}`;

      const response = await model.invoke(
        [new HumanMessage(analysisPrompt)],
        config
      );

      const content = response.content.toString();
      this.logger.debug(`[ANALYTICS] LLM response: ${content}`);

      // Parse JSON response
      let analysis;
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        analysis = JSON.parse(jsonStr);
      } catch (parseError) {
        this.logger.warn(
          `[ANALYTICS] Failed to parse LLM response as JSON, using defaults`
        );
        analysis = {
          intent: state.query,
          tools: ["get_account_balances"],
          parameters: {},
        };
      }

      this.logger.log(
        `[ANALYTICS] Analysis complete - Intent: ${analysis.intent}, Tools: ${analysis.tools.join(", ")}`
      );

      return {
        analyticalIntent: analysis.intent,
        toolsToExecute: analysis.tools || [],
        messages: [...state.messages, response],
      };
    } catch (error) {
      this.logger.error(`[ANALYTICS] Error analyzing query:`, error);
      return {
        error: `Failed to analyze query: ${error.message}`,
      };
    }
  }
}
