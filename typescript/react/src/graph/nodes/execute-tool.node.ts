import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import {
  PendingToolCall,
  ToolObservation,
  ToolInvocationSummary,
  ToolMetadata,
  NextAction,
  ReactGraphConfigValues,
  ReactGraphSettings,
} from "../../react.types";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { McpRuntimeHttpClient } from "@flutchai/flutch-sdk";

type ToolMetadataInputSchema = ToolMetadata["inputSchema"];

@Injectable()
export class ExecuteToolNode {
  private readonly logger = new Logger(ExecuteToolNode.name);

  constructor(private readonly mcpClient: McpRuntimeHttpClient) {}

  async execute(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<ReactGraphConfigValues>,
  ): Promise<Partial<ReactGraphStateValues>> {
    const pendingCalls: PendingToolCall[] = state.pendingToolCalls ?? [];

    if (pendingCalls.length === 0) {
      return {
        pendingToolCalls: [],
        nextAction: NextAction.REFLECT,
        stepNarrative: {
          doing: "No tools to execute",
          next: "Reflect and decide",
        },
        activityLog: [
          {
            phase: "execute",
            summary: "No pending tool calls",
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const stepBudget = state.stepBudget ?? 6;
    const currentStep = state.step ?? 0;
    const remainingBudget = Math.max(stepBudget - currentStep, 0);

    const configurable = config?.configurable as
      | ReactGraphConfigValues
      | undefined;
    const allowedToolConfigMap = this.buildToolConfigMap(
      configurable?.graphSettings?.allowedTools,
    );

    const metadataCache = new Map<string, ToolMetadata>(
      (state.availableTools ?? []).map((tool) => [tool.name, tool]),
    );

    let runtimeMetadataMap: Map<string, ToolMetadata> | null = null;
    const loadRuntimeMetadata = async (): Promise<
      Map<string, ToolMetadata>
    > => {
      if (runtimeMetadataMap) {
        return runtimeMetadataMap;
      }

      try {
        const runtimeTools = await this.mcpClient.getTools();
        runtimeMetadataMap = new Map(
          runtimeTools.map((tool) => [tool.name, this.toToolMetadata(tool)]),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to fetch tool metadata from MCP runtime: ${message}`,
        );
        runtimeMetadataMap = new Map();
      }

      return runtimeMetadataMap;
    };

    const resolveToolMetadata = async (
      toolName: string,
    ): Promise<ToolMetadata | null> => {
      const cached = metadataCache.get(toolName);
      if (cached) {
        return cached;
      }

      const runtimeMap = await loadRuntimeMetadata();
      const runtimeMetadata = runtimeMap.get(toolName) ?? null;
      if (runtimeMetadata) {
        metadataCache.set(toolName, runtimeMetadata);
      }
      return runtimeMetadata;
    };

    const summaries: ToolInvocationSummary[] = [];
    const toolMessages: ToolMessage[] = [];
    const newInvocationHashes: string[] = [];
    const knownHashes = new Set(state.invocationHashes ?? []);
    let duplicateSuppressed = 0;
    let lastError: string | undefined;

    for (const call of pendingCalls) {
      const toolMeta = await resolveToolMetadata(call.name);

      if (!toolMeta) {
        this.logger.warn(`Tool ${call.name} unavailable; skipping execution`);
        const observation: ToolObservation = {
          success: false,
          error: `Tool ${call.name} unavailable`,
        };
        const summary: ToolInvocationSummary = {
          tool: call.name,
          args: call.args,
          observation,
          error: observation.error,
        };

        summaries.push(summary);
        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({ error: observation.error }),
          }),
        );
        lastError = observation.error;
        continue;
      }

      const toolConfig = allowedToolConfigMap.get(call.name) ?? {};
      const mergedArgs = this.mergeToolArgs(call.name, call.args, toolConfig);

      const { sanitizedArgs, issues } = this.sanitizeArgs(
        toolMeta.inputSchema,
        mergedArgs,
      );

      if (remainingBudget <= 1 && typeof sanitizedArgs.topK === "number") {
        sanitizedArgs.topK = Math.min(sanitizedArgs.topK, 5);
      }

      if (issues.length) {
        this.logger.error(
          `🚨 [ExecuteToolNode] Tool ${call.name} argument validation failed: ${issues.join("; ")}`,
        );
        const observation: ToolObservation = {
          success: false,
          error: `Invalid tool arguments: ${issues.join("; ")}`,
        };
        const summary: ToolInvocationSummary = {
          tool: call.name,
          args: sanitizedArgs,
          observation,
          error: observation.error,
        };

        summaries.push(summary);
        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({ error: observation.error }),
          }),
        );
        lastError = observation.error;
        continue;
      }

      const invocationHash = this.computeInvocationHash(
        call.name,
        sanitizedArgs,
      );
      if (
        knownHashes.has(invocationHash) ||
        newInvocationHashes.includes(invocationHash)
      ) {
        duplicateSuppressed += 1;
        this.logger.warn(
          `Duplicate invocation prevented for ${call.name} (${invocationHash})`,
        );
        const observation: ToolObservation = {
          success: false,
          error: "Duplicate invocation suppressed",
        };
        const summary: ToolInvocationSummary = {
          tool: call.name,
          args: sanitizedArgs,
          observation,
          error: observation.error,
        };

        summaries.push(summary);
        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({ error: observation.error }),
          }),
        );
        lastError = observation.error;
        continue;
      }

      const context = this.buildExecutionContext(
        call.name,
        toolConfig,
        configurable,
      );

      const startedAt = Date.now();
      this.logger.log(
        `🔧 Executing tool ${call.name} with args: ${JSON.stringify(sanitizedArgs)}`,
      );

      const result = await this.mcpClient.executeTool(
        call.name,
        sanitizedArgs,
        context,
      );
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `🔧 Tool ${call.name} execution result: success=${result.success}, error=${result.error}`,
      );

      const observation: ToolObservation = {
        success: result.success,
        payload: result.success ? result.result : undefined,
        error: result.success ? undefined : result.error || "Unknown error",
        summary: result.success
          ? this.buildObservationSummary(result.result)
          : result.error || "Tool execution failed",
      };

      const summary: ToolInvocationSummary = {
        tool: call.name,
        args: sanitizedArgs,
        observation,
        durationMs,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        error: observation.error,
      };

      summaries.push(summary);
      toolMessages.push(
        new ToolMessage({
          tool_call_id: call.id,
          name: call.name,
          content: this.formatToolMessageContent(result.result, observation),
        }),
      );

      if (result.success) {
        knownHashes.add(invocationHash);
        newInvocationHashes.push(invocationHash);
      } else {
        lastError = observation.error;
      }
    }

    const latestObservation =
      summaries[summaries.length - 1] ?? state.latestObservation ?? null;

    const loopDiagnostics = {
      ...(state.diagnostics?.loop ?? {}),
      iterations: (state.diagnostics?.loop?.iterations ?? currentStep) + 1,
    } as Record<string, unknown>;

    if (duplicateSuppressed > 0) {
      loopDiagnostics.duplicateCalls =
        (state.diagnostics?.loop?.duplicateCalls ?? 0) + duplicateSuppressed;
    }

    const diagnostics = {
      ...(state.diagnostics ?? {}),
      loop: loopDiagnostics,
    } as Record<string, unknown>;

    if (lastError) {
      diagnostics.toolInsights = {
        ...(state.diagnostics?.toolInsights ?? {}),
        lastError,
      };
    }

    const successCount = summaries.filter((s) => s.observation.success).length;
    const failureCount = summaries.length - successCount;
    const doing = `Executed ${summaries.length} tool call(s)`;
    const next = "Reflect and decide next step";

    const updates: Partial<ReactGraphStateValues> = {
      messages: toolMessages,
      workingMemory: summaries,
      latestObservation,
      invocationHashes: newInvocationHashes,
      pendingToolCalls: [],
      plan: null,
      reflection: null,
      nextAction: NextAction.REFLECT,
      diagnostics,
      stepNarrative: { doing, next },
      activityLog: [
        {
          phase: "execute",
          summary: `${doing}: ${successCount} success, ${failureCount} failure`,
          timestamp: new Date().toISOString(),
          details: { successCount, failureCount },
        },
      ],
    };

    return updates;
  }

  private buildToolConfigMap(
    allowedTools: ReactGraphSettings["allowedTools"] | undefined,
  ): Map<string, Record<string, any>> {
    const map = new Map<string, Record<string, any>>();

    if (!Array.isArray(allowedTools)) {
      return map;
    }

    for (const tool of allowedTools) {
      if (typeof tool === "string") {
        map.set(tool, {});
        continue;
      }

      if (tool && tool.name) {
        map.set(tool.name, tool.config ?? {});
      }
    }

    return map;
  }

  private mergeToolArgs(
    toolName: string,
    rawArgs: Record<string, unknown>,
    toolConfig: Record<string, unknown>,
  ): Record<string, any> {
    const normalizedArgs = { ...(rawArgs ?? {}) } as Record<string, any>;

    // Merge tool config with normalized args
    return {
      ...toolConfig,
      ...normalizedArgs,
    };
  }

  private buildExecutionContext(
    toolName: string,
    toolConfig: Record<string, unknown>,
    configurable?: ReactGraphConfigValues,
  ): Record<string, any> {
    const context: Record<string, any> = {
      // Include all tool-specific config (kbIds, telegramBotToken, etc.)
      ...toolConfig,
    };

    // Add system context (agentId, userId)
    if (configurable?.agentId) {
      context.agentId = configurable.agentId;
    }

    if (configurable?.userId) {
      context.userId = configurable.userId;
    }

    return context;
  }

  private formatToolMessageContent(
    result: unknown,
    observation: ToolObservation,
  ): string {
    if (observation.success) {
      if (typeof result === "string") {
        return result;
      }

      try {
        return JSON.stringify(result ?? {});
      } catch (error) {
        return String(result);
      }
    }

    const errorPayload = observation.error ?? "Tool execution failed";
    return JSON.stringify({ error: errorPayload });
  }

  private toToolMetadata(tool: {
    name: string;
    description: string;
    inputSchema: {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    tags?: string[];
  }): ToolMetadata {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: tool.inputSchema?.type ?? "object",
        properties: tool.inputSchema?.properties ?? {},
        required: tool.inputSchema?.required ?? [],
        additionalProperties: tool.inputSchema?.additionalProperties ?? true,
      },
      tags: tool.tags,
    };
  }

  private sanitizeArgs(
    schema: ToolMetadataInputSchema,
    rawArgs: Record<string, any>,
  ): { sanitizedArgs: Record<string, any>; issues: string[] } {
    const issues: string[] = [];
    const sanitized: Record<string, any> = {};

    const schemaObj = schema || { type: "object", properties: {} };
    const properties = schemaObj.properties || {};
    const allowAdditional = schemaObj.additionalProperties === true;
    const required: string[] = schemaObj.required || [];

    Object.entries(rawArgs || {}).forEach(([key, value]) => {
      if (properties[key] || allowAdditional) {
        sanitized[key] = value;
      } else {
        issues.push(`Unexpected field: ${key}`);
      }
    });

    required.forEach((field) => {
      if (sanitized[field] === undefined || sanitized[field] === null) {
        issues.push(`Missing required field: ${field}`);
      }
    });

    return { sanitizedArgs: sanitized, issues };
  }

  private computeInvocationHash(
    tool: string,
    args: Record<string, any>,
  ): string {
    return `${tool}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  private buildObservationSummary(result: any): string {
    if (result == null) {
      return "(empty result)";
    }

    if (Array.isArray(result?.chunks) && result.chunks.length > 0) {
      const total = result.chunks.length;
      const preview = result.chunks
        .slice(0, 3)
        .map((chunk: any, index: number) => {
          const title = chunk?.metadata?.title || `Chunk ${index + 1}`;
          const lines = chunk?.metadata?.loc?.lines;
          const lineInfo = lines ? ` (lines ${lines.from}-${lines.to})` : "";
          const content = this.snippetFromUnknown(chunk?.pageContent);
          return `${index + 1}. ${title}${lineInfo}: ${content}`;
        })
        .join("\n");

      return `kb_search returned ${total} chunk(s):\n${preview}`;
    }

    if (Array.isArray(result?.results) && result.results.length > 0) {
      const total = result.results.length;
      const preview = result.results
        .slice(0, 3)
        .map((item: any, index: number) => {
          const title = item?.title || `Result ${index + 1}`;
          const url = item?.url ? ` (${item.url})` : "";
          const content = this.snippetFromUnknown(
            item?.content ?? item?.rawContent,
          );
          return `${index + 1}. ${title}${url}: ${content}`;
        })
        .join("\n");

      return `web_search returned ${total} result(s):\n${preview}`;
    }

    if (typeof result === "string") {
      return this.safeTruncate(result, 500);
    }

    try {
      return this.safeTruncate(JSON.stringify(result, null, 2), 500);
    } catch (error) {
      return "(non-serializable result)";
    }
  }

  private snippetFromUnknown(value: unknown, maxLength = 220): string {
    if (!value) {
      return "(no content)";
    }

    if (typeof value === "string") {
      const clean = value.replace(/\s+/g, " ").trim();
      return this.safeTruncate(clean, maxLength);
    }

    try {
      const serialized = JSON.stringify(value);
      return this.safeTruncate(serialized, maxLength);
    } catch {
      return this.safeTruncate(String(value), maxLength);
    }
  }

  private safeTruncate(value: string, maxLength = 400): string {
    if (!value) return "";
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }
}
