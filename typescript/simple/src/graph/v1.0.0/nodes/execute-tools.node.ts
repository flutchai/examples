import { Injectable, Logger } from "@nestjs/common";
import { ToolMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { McpRuntimeHttpClient } from "@flutchai/flutch-sdk";
import { SimpleGraphStateValues, SimpleConfigValues } from "../../../simple.types";

/**
 * Execute Tools node for Simple graph
 * Handles execution of tool calls from LLM responses
 */
@Injectable()
export class ExecuteToolsNode {
  private readonly logger = new Logger(ExecuteToolsNode.name);

  constructor(private readonly mcpClient: McpRuntimeHttpClient) {}

  async execute(
    state: SimpleGraphStateValues,
    config?: LangGraphRunnableConfig<SimpleConfigValues>
  ): Promise<Partial<SimpleGraphStateValues>> {
    this.logger.debug("Executing MCP tools");

    try {
      const lastMessage = state.messages[state.messages.length - 1];
      const toolCalls = (lastMessage as any)?.tool_calls || [];

      if (toolCalls.length === 0) {
        this.logger.warn("No tool calls found in the last message");
        return {};
      }

      this.logger.log(`Executing ${toolCalls.length} tool calls`);

      // Extract tool configs from graph settings
      const graphSettings = (config?.configurable as any)?.graphSettings;
      const allowedTools = graphSettings?.availableTools || [];

      // Build tool config map
      const toolConfigMap: Record<string, any> = {};
      for (const tool of allowedTools) {
        if (typeof tool === "object" && tool.name && tool.config) {
          toolConfigMap[tool.name] = tool.config;
        }
      }

      const toolMessages: ToolMessage[] = [];

      for (const toolCall of toolCalls) {
        try {
          this.logger.debug(
            `Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`
          );

          // Build execution context with tool config
          const toolConfig = toolConfigMap[toolCall.name];
          const context = toolConfig ? { config: toolConfig } : undefined;

          // Call MCP runtime to execute the tool
          const result = await this.mcpClient.executeTool(
            toolCall.name,
            toolCall.args,
            context
          );

          // Create tool result message
          const toolMessage = new ToolMessage({
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: result.success
              ? JSON.stringify(result.result)
              : result.error || JSON.stringify(result),
          });

          toolMessages.push(toolMessage);
          this.logger.log(`Tool ${toolCall.name} executed successfully`);
        } catch (toolError) {
          this.logger.error(
            `Error executing tool ${toolCall.name}:`,
            toolError
          );

          // Create error result message
          const errorMessage = new ToolMessage({
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({
              error: toolError.message || "Tool execution failed",
              tool: toolCall.name,
            }),
          });

          toolMessages.push(errorMessage);
        }
      }

      return {
        messages: toolMessages,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in executeTools: ${errorMessage}`);
      throw error;
    }
  }
}
