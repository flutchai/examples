import { Injectable, Logger } from "@nestjs/common";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { StructuredTool } from "@langchain/core/tools";
import { ModelInitializer, McpToolFilter } from "@flutchai/flutch-sdk";

import {
  PendingToolCall,
  ReactGraphSettings,
  ReactGraphConfigValues,
  NextAction,
  ToolMetadata,
} from "../../react.types";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { McpRuntimeHttpClient } from "@flutchai/flutch-sdk";
import { ENV_CONFIG } from "../../config/environment.config";
import { LLMResult } from "@langchain/core/outputs";
import { StreamChannel } from "@flutchai/flutch-sdk";

/**
 * React node for ReAct graph
 * Handles reasoning and action planning using LLM with bound tools
 */
@Injectable()
export class PlanAndSelectToolNode {
  private readonly logger = new Logger(PlanAndSelectToolNode.name);
  private readonly mcpToolFilter = new McpToolFilter();
  private boundToolsByName = new Map<string, StructuredTool>();
  private readonly toolInputSchemasByName = new Map<
    string,
    ToolMetadata["inputSchema"]
  >();

  constructor(
    private readonly modelInitializer: ModelInitializer,
    private readonly mcpClient: McpRuntimeHttpClient,
  ) {}

  // Note: Old prompt services (PlannerPromptService, PlanMaterializationService)
  // are no longer needed in the new ReAct pattern

  async execute(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<ReactGraphConfigValues>,
  ): Promise<Partial<ReactGraphStateValues>> {
    // Extract usageRecorder from context

    try {
      // Get model settings from config
      const graphSettings: ReactGraphSettings =
        (config?.configurable?.graphSettings as ReactGraphSettings) || {};

      // Get configuration from reactNode
      const reactNodeConfig = graphSettings?.reactNode || {};

      const modelId = reactNodeConfig.modelId || ENV_CONFIG.llm.defaultModelId;
      const temperature = reactNodeConfig.temperature ?? 0.7;
      const maxTokens = reactNodeConfig.maxTokens ?? 2000;

      // Build system prompt for ReAct
      const systemPrompt = this.buildReActSystemPrompt(state, graphSettings);

      // Get filtered tools using McpToolFilter (like simple graph)
      let tools: StructuredTool[] = [];
      let availableToolMetadata: ToolMetadata[] = [];

      try {
        const enabledTools = graphSettings?.allowedTools || [];

        const toolConfigs = enabledTools
          .filter((tool) =>
            typeof tool === "object" ? tool.enabled !== false : true,
          )
          .map((tool) => (typeof tool === "string" ? { name: tool } : tool));

        if (toolConfigs.length > 0) {
          const toolNames = toolConfigs.map((tool) => tool.name);

          // Use McpToolFilter directly like in main Simple graph
          tools = await this.mcpToolFilter.getFilteredTools(toolNames);
          this.boundToolsByName = new Map(
            tools.map((tool) => [tool.name, tool]),
          );

          availableToolMetadata =
            await this.buildAvailableToolMetadata(toolNames);

          // Log tool configs for debugging
          toolConfigs.forEach((toolConfig) => {
            // Tool configuration is passed to McpToolFilter
          });

          this.logger.log(
            `Configured ${tools.length} tools from MCP runtime: ${toolNames.join(", ")}`,
          );
        } else {
          this.boundToolsByName.clear();
          this.toolInputSchemasByName.clear();
          this.logger.log("No tools enabled for this agent");
        }
      } catch (error) {
        this.logger.warn(
          "Failed to load tools, continuing without tools:",
          error.message,
        );
        this.boundToolsByName.clear();
        this.toolInputSchemasByName.clear();
      }

      // Initialize the Chat LLM
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      // Bind tools to model if available
      const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;

      // Prepare messages - build from state
      const messages = this.buildMessagesFromState(state, systemPrompt);

      const plannerStep = state.step ?? 0;
      const configuredBudget =
        graphSettings.stepBudget ?? state.stepBudget ?? 6;
      const remainingBudget = Math.max(configuredBudget - plannerStep, 0);

      // Call the model
      const result = await modelWithTools.invoke(messages, config);

      // Type guard to ensure result is AIMessage
      if (!result || typeof result !== "object" || !("content" in result)) {
        throw new Error("Invalid response from model");
      }

      const aiMessage = result as AIMessage;

      // Update step counter
      const currentStep = plannerStep + 1;

      // Determine next action based on tool calls
      const pendingToolCalls = this.extractPendingToolCalls(aiMessage);
      const nextAction =
        pendingToolCalls.length > 0 ? NextAction.EXECUTE : NextAction.ANSWER;

      const doing =
        pendingToolCalls.length > 0
          ? `Planned ${pendingToolCalls.length} tool call(s)`
          : `Prepared to answer without tools`;
      const next =
        pendingToolCalls.length > 0 ? "Execute tools" : "Generate final answer";

      const activity = {
        phase: "plan" as const,
        summary: doing,
        timestamp: new Date().toISOString(),
        details: {
          modelId,
          toolCount: pendingToolCalls.length,
          allowedTools: (graphSettings?.allowedTools || []).map((t) =>
            typeof t === "string" ? t : t.name,
          ),
        },
      };

      const updates: Partial<ReactGraphStateValues> = {
        messages: [aiMessage],
        step: currentStep,
        lastGeneration: aiMessage,
        nextAction,
        pendingToolCalls,
        stepNarrative: { doing, next },
        activityLog: [activity],
      };

      if (availableToolMetadata.length > 0) {
        updates.availableTools = availableToolMetadata;
      }

      return updates;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in React node: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Build ReAct system prompt using professional templates
   */
  private buildReActSystemPrompt(
    state: ReactGraphStateValues,
    settings: ReactGraphSettings,
  ): string {
    // Get configuration from reactNode
    const reactNodeConfig = settings?.reactNode || {};

    // Start with the base system prompt from config
    let systemPrompt = reactNodeConfig.systemPrompt || "";

    // Add tool context if enabled
    if (reactNodeConfig.includeToolContext) {
      const availableTools = this.extractAvailableToolNames(settings);
      if (availableTools.length > 0) {
        systemPrompt += `\n\n## Available Tools\n\nYou have access to these tools:\n- ${availableTools.join("\n- ")}`;
      }
    }

    // Add conversation history if enabled
    if (reactNodeConfig.includeConversationHistory) {
      const maxSteps = reactNodeConfig.maxStepsInPrompt ?? 3;
      const conversationHistory = this.formatConversationHistory(
        state,
        maxSteps,
      );
      if (conversationHistory !== "This is the start of the conversation.") {
        systemPrompt += `\n\n## Conversation Context\n\n${conversationHistory}`;
      }
    }

    // Add current situation
    const stepBudget = settings.stepBudget ?? 6;
    const currentStep = state.step ?? 0;
    systemPrompt += `\n\n## Current Situation\n\nUser Query: ${state.query}\nStep: ${currentStep + 1}/${stepBudget}`;

    return systemPrompt;
  }

  /**
   * Build messages array from current state
   */
  private buildMessagesFromState(
    state: ReactGraphStateValues,
    systemPrompt: string,
  ): any[] {
    const messages: any[] = [new SystemMessage(systemPrompt)];

    // Add user's original query if no messages exist yet
    if (!state.messages || state.messages.length === 0) {
      messages.push(new HumanMessage(state.query));
    } else {
      // Add existing messages from conversation
      messages.push(...state.messages);
    }

    return messages;
  }

  private extractMessageText(message: AIMessage): string {
    if (!message) {
      return "";
    }

    const content = (message as any)?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object" && "text" in part) {
            return String(part.text ?? "");
          }
          return "";
        })
        .join(" ");
    }

    if (typeof content === "object" && content !== null) {
      if ("text" in content) {
        return String((content as any).text ?? "");
      }

      try {
        return JSON.stringify(content);
      } catch {
        return String(content);
      }
    }

    return String(content ?? "");
  }

  private extractPendingToolCalls(message: AIMessage): PendingToolCall[] {
    const rawToolCalls = (message as any)?.tool_calls || [];
    if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) {
      return [];
    }

    return rawToolCalls
      .map((toolCall: any): PendingToolCall | null => {
        if (!toolCall || !toolCall.name) {
          return null;
        }

        const normalizedArgs = this.normalizeToolArgs(
          toolCall.args,
          toolCall.name,
        );

        return {
          id: toolCall.id || `${toolCall.name}-${Date.now()}`,
          name: toolCall.name,
          args: normalizedArgs,
        };
      })
      .filter((call): call is PendingToolCall => call !== null);
  }

  private normalizeToolArgs(
    args: unknown,
    toolName?: string,
  ): Record<string, unknown> {
    let normalized: Record<string, unknown>;

    if (!args) {
      normalized = {};
    } else if (typeof args === "object") {
      normalized = { ...(args as Record<string, unknown>) };
    } else if (typeof args === "string") {
      try {
        normalized = JSON.parse(args);
      } catch (error) {
        this.logger.warn(`Failed to parse tool args string: ${args}`);
        normalized = { input: args };
      }
    } else {
      normalized = { value: args } as Record<string, unknown>;
    }

    if (!toolName) {
      return normalized;
    }

    return this.alignArgsWithSchema(toolName, normalized);
  }

  private alignArgsWithSchema(
    toolName: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema = this.toolInputSchemasByName.get(toolName);
    const tool = this.boundToolsByName.get(toolName) as
      | (StructuredTool & { schema?: any })
      | undefined;

    if (!schema && !tool?.schema) {
      return args;
    }

    let workingArgs = { ...args };

    if (schema) {
      workingArgs = this.ensureRequiredFields(schema, workingArgs, toolName);
    }

    if (tool?.schema) {
      try {
        const parsed = tool.schema.parse(workingArgs);
        return parsed;
      } catch (error) {
        const corrected = this.tryCoerceWithSchema(
          schema,
          workingArgs,
          toolName,
        );
        if (corrected) {
          try {
            return tool.schema.parse(corrected);
          } catch (parseError) {
            this.logger.warn(
              `Tool ${toolName} arguments still invalid after correction: ${(parseError as Error).message}`,
            );
          }
        }

        this.logger.warn(
          `Tool ${toolName} arguments failed schema validation: ${(error as Error).message}`,
        );
      }
    }

    return workingArgs;
  }

  private ensureRequiredFields(
    schema: ToolMetadata["inputSchema"],
    args: Record<string, unknown>,
    toolName: string,
  ): Record<string, unknown> {
    const requiredFields = Array.isArray(schema.required)
      ? schema.required
      : [];
    if (requiredFields.length === 0) {
      return args;
    }

    const workingArgs = { ...args };

    requiredFields.forEach((requiredKey) => {
      if (this.hasNonEmptyValue(workingArgs[requiredKey])) {
        return;
      }

      const aliasKey = this.findAliasForRequiredField(requiredKey, workingArgs);
      if (aliasKey) {
        workingArgs[requiredKey] = workingArgs[aliasKey];
        delete workingArgs[aliasKey];
      }
    });

    return workingArgs;
  }

  private tryCoerceWithSchema(
    schema: ToolMetadata["inputSchema"] | undefined,
    args: Record<string, unknown>,
    toolName: string,
  ): Record<string, unknown> | null {
    if (!schema) {
      return null;
    }

    const requiredFields = Array.isArray(schema.required)
      ? schema.required
      : [];
    if (requiredFields.length !== 1) {
      return null;
    }

    const requiredKey = requiredFields[0];
    if (this.hasNonEmptyValue(args[requiredKey])) {
      return null;
    }

    const aliasKey = this.findAliasForRequiredField(requiredKey, args);
    if (!aliasKey) {
      return null;
    }

    const corrected = { ...args };
    corrected[requiredKey] = corrected[aliasKey];
    delete corrected[aliasKey];
    return corrected;
  }

  private findAliasForRequiredField(
    requiredKey: string,
    args: Record<string, unknown>,
  ): string | null {
    const aliasCandidates = [
      requiredKey,
      "query",
      "input",
      "prompt",
      "question",
      "text",
      "value",
    ];
    for (const alias of aliasCandidates) {
      if (alias === requiredKey) {
        continue;
      }
      if (this.hasNonEmptyValue(args[alias])) {
        return alias;
      }
    }
    return null;
  }

  private hasNonEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }

    return true;
  }

  private async buildAvailableToolMetadata(
    toolNames: string[],
  ): Promise<ToolMetadata[]> {
    if (toolNames.length === 0) {
      this.toolInputSchemasByName.clear();
      return [];
    }

    try {
      const runtimeTools = await this.mcpClient.getTools();
      const toolCatalog = new Map(
        runtimeTools.map((tool) => [tool.name, tool]),
      );

      this.toolInputSchemasByName.clear();

      return toolNames
        .map((name) => {
          const tool = toolCatalog.get(name);
          if (!tool) {
            return null;
          }

          const rawSchema = tool.inputSchema as
            | ToolMetadata["inputSchema"]
            | (ToolMetadata["inputSchema"] & { additionalProperties?: boolean })
            | undefined;

          const normalizedSchema: ToolMetadata["inputSchema"] = {
            type: rawSchema?.type ?? "object",
            properties: rawSchema?.properties ?? {},
            required: rawSchema?.required ?? [],
            additionalProperties:
              typeof rawSchema?.additionalProperties === "boolean"
                ? rawSchema.additionalProperties
                : false,
          };

          this.toolInputSchemasByName.set(name, normalizedSchema);

          const metadataSchema: ToolMetadata["inputSchema"] = {
            ...normalizedSchema,
            additionalProperties: true,
          };

          return {
            name: tool.name,
            description: tool.description,
            inputSchema: metadataSchema,
          } as ToolMetadata;
        })
        .filter((tool): tool is ToolMetadata => tool !== null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to build tool metadata from MCP runtime: ${message}`,
      );
      this.toolInputSchemasByName.clear();
      return [];
    }
  }

  /**
   * Extract available tool names from settings
   */
  private extractAvailableToolNames(settings: ReactGraphSettings): string[] {
    if (!settings.allowedTools?.length) {
      return [];
    }

    return settings.allowedTools
      .filter((tool) =>
        typeof tool === "object" ? tool.enabled !== false : true,
      )
      .map((tool) => (typeof tool === "string" ? tool : tool.name));
  }

  /**
   * Format conversation history for prompt context
   */
  private formatConversationHistory(
    state: ReactGraphStateValues,
    maxSteps: number = 3,
  ): string {
    if (!state.messages || state.messages.length === 0) {
      return "This is the start of the conversation.";
    }

    const formatted = state.messages
      .slice(-maxSteps * 2)
      .map((msg) => {
        // Handle both LangChain Message objects and plain objects
        const messageType =
          typeof msg.getType === "function" ? msg.getType() : (msg as any).type;

        if (messageType === "human") {
          return `User: ${msg.content}`;
        } else if (messageType === "ai") {
          let content = `Assistant: ${msg.content}`;

          // Add tool calls if present
          if ((msg as any).tool_calls?.length > 0) {
            const toolCalls = (msg as any).tool_calls;
            content += `\n[Used tools: ${toolCalls.map((tc: any) => tc.name).join(", ")}]`;
          }

          return content;
        } else if (messageType === "tool") {
          // Truncate long tool results
          const content =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
          const truncated =
            content.length > 200 ? content.slice(0, 200) + "..." : content;
          return `Tool Result: ${truncated}`;
        }
        return `${messageType}: ${msg.content}`;
      })
      .join("\n");

    return formatted;
  }

  /**
   * Format previous messages for context (legacy method - kept for compatibility)
   */
  private formatPreviousMessages(state: ReactGraphStateValues): string {
    return this.formatConversationHistory(state, 3);
  }

  /**
   * Execute MCP tools based on tool calls in the last message
   * This method is used by the tools node in the graph
   */
  async executeTools(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<any>,
  ): Promise<Partial<ReactGraphStateValues>> {
    try {
      const lastMessage = state.messages?.[state.messages.length - 1];
      const toolCalls = (lastMessage as any)?.tool_calls || [];

      if (toolCalls.length === 0) {
        this.logger.warn("No tool calls found in the last message");
        return {};
      }

      this.logger.log(`🔧 Executing ${toolCalls.length} tool calls`);

      // Execute all tool calls
      const toolMessages = [];
      for (const toolCall of toolCalls) {
        try {
          this.logger.debug(
            `🔧 Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`,
          );

          // Call MCP runtime to execute the tool
          const result = await this.mcpClient.executeTool(
            toolCall.name,
            toolCall.args,
          );

          this.logger.log(
            `🔧 Tool ${toolCall.name} execution result: success=${result.success}, error=${result.error}`,
          );

          // Create tool result message
          const toolMessage = {
            type: "tool",
            tool_call_id: toolCall.id,
            content: result.success
              ? JSON.stringify(result.result)
              : result.error || JSON.stringify(result),
            name: toolCall.name,
          };

          toolMessages.push(toolMessage);
          this.logger.log(`🔧 Tool ${toolCall.name} executed successfully`);
        } catch (toolError) {
          this.logger.error(
            `🔧 Error executing tool ${toolCall.name}:`,
            toolError,
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
      this.logger.error(`🔧 Error in executeTools: ${errorMessage}`);
      throw error;
    }
  }
}
