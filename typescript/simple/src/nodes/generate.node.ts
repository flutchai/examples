import { Injectable, Logger } from "@nestjs/common";
import {
  McpConverter,
  ModelType,
  ModelInitializer,
} from "@flutchai/flutch-sdk";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { SimpleStateValues } from "../simple.types";
import { ENV_CONFIG } from "../config/environment.config";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { McpRuntimeClient } from "../clients/mcp-runtime.client";
import { ToolCatalogClient } from "../services/tool-catalog.client";
import { StructuredTool } from "@langchain/core/tools";

/**
 * Generate node for Simple graph
 * Handles message generation using LLM
 */
@Injectable()
export class GenerateNode {
  private readonly logger = new Logger(GenerateNode.name);
  private readonly mcpConverter = new McpConverter();

  constructor(
    private readonly modelInitializer: ModelInitializer,
    private readonly mcpClient: McpRuntimeClient,
    private readonly toolCatalogClient: ToolCatalogClient
  ) {}

  async execute(
    state: SimpleStateValues,
    config?: LangGraphRunnableConfig<any>
  ): Promise<Partial<SimpleStateValues>> {
    // Extract usageRecorder from context
    const usageRecorder = (config as any)?.configurable?.context?.usageRecorder;

    this.logger.debug("Executing generate node");

    try {
      // Get model settings from config
      const graphSettings = config?.configurable?.graphSettings;
      const modelSettings = graphSettings?.modelSettings;
      const modelId = modelSettings?.modelId || ENV_CONFIG.llm.defaultModelId;
      const temperature = modelSettings?.temperature;
      const systemPrompt = graphSettings?.systemPrompt || "";

      this.logger.debug(`Using model: ${modelId}, temperature: ${temperature}`);

      // Get filtered tools based on configuration and catalog validation
      let tools: StructuredTool[] = [];
      let toolsMetadata = { count: 0, names: [], descriptions: {} };

      try {
        const enabledTools = graphSettings?.availableTools || [];
        this.logger.debug(`Agent enabled tools: ${enabledTools.join(", ")}`);

        if (enabledTools.length > 0) {
          // First, validate tools against catalog
          const toolValidation =
            await this.toolCatalogClient.validateTools(enabledTools);

          // Log validation results
          if (toolValidation.invalidTools.length > 0) {
            this.logger.warn(
              `Tools not found in catalog: ${toolValidation.invalidTools.join(", ")}`
            );
          }
          if (toolValidation.inactiveTools.length > 0) {
            this.logger.warn(
              `Inactive tools in catalog: ${toolValidation.inactiveTools.join(", ")}`
            );
          }

          // Only use tools that are valid and active in catalog
          const validToolNames = toolValidation.validTools;
          this.logger.debug(
            `Valid tools from catalog: ${validToolNames.join(", ")}`
          );

          if (validToolNames.length > 0) {
            // Get all available tools from MCP runtime
            const allMcpTools = await this.mcpClient.getTools();
            this.logger.debug(
              `Retrieved ${allMcpTools.length} total MCP tools`
            );

            // Filter only the tools that are both valid in catalog AND available in MCP
            const allowedTools = allMcpTools.filter(tool =>
              validToolNames.includes(tool.name)
            );

            // Log which tools were found/missing in MCP runtime
            const foundToolNames = allowedTools.map(t => t.name);
            const missingInMcp = validToolNames.filter(
              name => !foundToolNames.includes(name)
            );

            if (missingInMcp.length > 0) {
              this.logger.warn(
                `Valid catalog tools not found in MCP runtime: ${missingInMcp.join(", ")}`
              );
            }

            // Convert filtered MCP tools to LangChain tools
            tools = await this.mcpConverter.convertTools(allowedTools);
            toolsMetadata = {
              count: allowedTools.length,
              names: allowedTools.map(t => t.name),
              descriptions: allowedTools.reduce(
                (acc, tool) => {
                  acc[tool.name] = tool.description;
                  return acc;
                },
                {} as Record<string, string>
              ),
            };

            this.logger.log(
              `Configured ${tools.length} validated tools: ${toolsMetadata.names.join(", ")}`
            );
          } else {
            this.logger.log("No valid tools available from catalog");
          }
        } else {
          this.logger.log("No tools enabled for this agent");
        }
      } catch (error) {
        this.logger.warn(
          "Failed to load tools (catalog or MCP error), continuing without tools:",
          error.message
        );
      }

      // Initialize the Chat LLM
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
      });

      // Bind tools to model if available
      const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;

      // Prepare messages with system prompt
      const messages = [new SystemMessage(systemPrompt), ...state.messages];
      this.logger.debug(
        `Processing ${messages.length} messages with ${tools.length} tools`
      );

      // Call the model
      const result = await modelWithTools.invoke(messages, config);

      // Type guard to ensure result is AIMessage
      if (!result || typeof result !== "object" || !("content" in result)) {
        throw new Error("Invalid response from model");
      }

      const aiMessage = result as AIMessage;
      this.logger.debug(`Generated response: ${aiMessage.content}`);

      return {
        messages: [aiMessage],
        generation: aiMessage,
        output: {
          text: aiMessage.content as string,
          attachments: [],
          metadata: {
            modelId: modelId,
            timestamp: new Date().toISOString(),
            toolsAvailable: toolsMetadata.count,
            toolsUsed: (aiMessage as any).tool_calls?.length || 0,
            toolNames: toolsMetadata.names,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in generate node: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Execute MCP tools based on tool calls in the last message
   */
  async executeTools(
    state: SimpleStateValues,
    config?: LangGraphRunnableConfig<any>
  ): Promise<Partial<SimpleStateValues>> {
    this.logger.debug("Executing MCP tools");

    try {
      const lastMessage = state.messages[state.messages.length - 1];
      const toolCalls = (lastMessage as any)?.tool_calls || [];

      if (toolCalls.length === 0) {
        this.logger.warn("No tool calls found in the last message");
        return {};
      }

      this.logger.log(`Executing ${toolCalls.length} tool calls`);

      // Execute all tool calls
      const toolMessages = [];
      for (const toolCall of toolCalls) {
        try {
          this.logger.debug(
            `Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`
          );

          // Call MCP runtime to execute the tool
          const result = await this.mcpClient.executeTool(
            toolCall.name,
            toolCall.args
          );

          // Create tool result message
          const toolMessage = {
            type: "tool",
            tool_call_id: toolCall.id,
            content: result.success
              ? JSON.stringify(result)
              : result.error || JSON.stringify(result),
            name: toolCall.name,
          };

          toolMessages.push(toolMessage);
          this.logger.log(`Tool ${toolCall.name} executed successfully`);
        } catch (toolError) {
          this.logger.error(
            `Error executing tool ${toolCall.name}:`,
            toolError
          );

          // Create error result message
          const errorMessage = {
            type: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: toolError.message || "Tool execution failed",
              tool: toolCall.name,
            }),
            name: toolCall.name,
          };

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
