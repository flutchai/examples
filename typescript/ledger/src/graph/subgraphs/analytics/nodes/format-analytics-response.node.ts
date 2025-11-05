import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { HumanMessage } from "@langchain/core/messages";
import { AnalyticsStateValues } from "../analytics.state";

/**
 * Format Analytics Response Node
 *
 * Takes the tool execution results and formats them into a user-friendly
 * analytical response using LLM.
 */
@Injectable()
export class FormatAnalyticsResponseNode {
  private readonly logger = new Logger(FormatAnalyticsResponseNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: AnalyticsStateValues,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<AnalyticsStateValues>> {
    this.logger.log(`[ANALYTICS] Formatting response for: ${state.query}`);

    try {
      // Get LLM model
      const model = await this.modelInitializer.initializeChatModel({
        modelId: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 1000,
      });

      if (!model) {
        throw new Error("Failed to initialize LLM model");
      }

      const formattingPrompt = `You are a financial analytics assistant. The user asked an analytical question, and we've gathered the data. Now format a clear, insightful response.

User's Original Question: "${state.query}"

Analytical Intent: "${state.analyticalIntent}"

Tool Results:
${JSON.stringify(state.toolResults, null, 2)}

Please provide:
1. A direct answer to the user's question
2. Key insights from the data
3. Any relevant trends or patterns
4. Actionable recommendations if appropriate

Format your response in a clear, professional manner suitable for a financial report.`;

      const response = await model.invoke(
        [new HumanMessage(formattingPrompt)],
        config,
      );

      const analyticsResult = response.content.toString();
      this.logger.log(`[ANALYTICS] Response formatted successfully`);

      return {
        analyticsResult,
        messages: [...state.messages, response],
      };
    } catch (error) {
      this.logger.error(`[ANALYTICS] Error formatting response:`, error);
      return {
        error: `Failed to format analytics response: ${error.message}`,
        analyticsResult: `I apologize, but I encountered an error while formatting the analytical response. The raw data is: ${JSON.stringify(state.toolResults)}`,
      };
    }
  }
}
