import { Injectable } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { SystemMessage } from "@langchain/core/messages";
import { CHART_OF_ACCOUNTS_SYSTEM_PROMPT } from "../../../../common/account-code-rules";

/**
 * Simplified state for account management subgraph
 */
interface AccountManagementState {
  userId: string;
  messages: any[];
  output?: {
    text: string;
    attachments?: any[];
  };
}

/**
 * Format Response Node - formats tool results into user-friendly response
 */
@Injectable()
export class FormatResponseNode {
  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: AccountManagementState,
    config: LangGraphRunnableConfig<any>
  ): Promise<Partial<AccountManagementState>> {
    const messages = state.messages || [];

    // Get LLM config from graphSettings
    const accountMgmtConfig =
      config.configurable?.graphSettings?.accountManagement;
    const modelSettings = accountMgmtConfig?.llmConfig;

    if (!modelSettings) {
      throw new Error("Account management LLM configuration not found");
    }

    // Initialize LLM with config
    const model = await this.modelInitializer.initializeChatModel({
      modelId: modelSettings.modelId,
      temperature: modelSettings.temperature || 0.1,
      maxTokens: modelSettings.maxTokens || 2000,
    });

    // Create system prompt for formatting
    const systemPrompt = new SystemMessage(
      `You are a helpful financial assistant. Format the tool execution results into a clear, user-friendly response.

${CHART_OF_ACCOUNTS_SYSTEM_PROMPT}

Guidelines:
- Use the same language as the user's original request
- Present data in a readable format (tables, lists, etc.)
- Be concise but informative
- If there's an error, explain it clearly and suggest what to do next
- When showing accounts, organize them by type and show the hierarchy (parent-child relationships)`
    );

    // Call LLM to format the response
    const response = await model.invoke([systemPrompt, ...messages], config);

    console.log(
      `[FORMAT_RESPONSE] Formatted response: ${response.content.toString().substring(0, 100)}...`
    );

    return {
      messages: [response],
      output: {
        text: response.content as string,
      },
    };
  }
}
