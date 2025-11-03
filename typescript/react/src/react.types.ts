import { CompiledStateGraph } from "@langchain/langgraph";
import { IGraphRequestPayload } from "@flutchai/flutch-sdk";
import type { ReactGraphStateValues } from "./react-graph.builder";

export { NextAction, GraphNodeId } from "./types/graph.constants";

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  tags?: string[];
  shortlistScore?: number;
}

export interface ToolInvocationSummary {
  tool: string;
  args: Record<string, unknown>;
  observation: ToolObservation;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  cost?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  error?: string;
}

export interface ToolObservation {
  success: boolean;
  payload?: unknown;
  error?: string;
  summary?: string;
  diagnostics?: Record<string, unknown>;
}

export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolPlanAction {
  type: "tool";
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
  metadata?: Partial<ToolMetadata>;
}

export interface AnswerPlanAction {
  type: "answer";
  answer: string;
  confidence: number;
  rationale?: string;
}

export interface ClarifyPlanAction {
  type: "clarify";
  question: string;
  rationale?: string;
}

export type PlanAction = ToolPlanAction | AnswerPlanAction | ClarifyPlanAction;

export interface ReflectionDecision {
  decision: "continue" | "answer" | "clarify";
  updatedEvidence: string;
  confidence: number;
  rationale?: string;
  question?: string;
  answerOutline?: string;
}

export interface AnswerCitation {
  sourceId: string;
  sourceType?: string;
  snippet?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface ReactGraphAnswer {
  text: string;
}

export interface ReactGraphClarification {
  question: string;
  rationale?: string;
}

export interface ReactGraphDiagnostics {
  loop?: {
    iterations: number;
    exhaustedBudget?: boolean;
    duplicateCalls?: number;
    timeouts?: number;
  };
  lastError?: string;
  toolInsights?: Record<string, unknown>;
}

export type ReactPhase = "plan" | "execute" | "reflect" | "answer" | "clarify";

export interface StepNarrative {
  doing: string;
  next: string;
}

export interface ActivityLogEntry {
  phase: ReactPhase;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ToolConfiguration {
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface ReactGraphSettings {
  stepBudget?: number;
  allowedTools?: ToolConfiguration[];

  // ReAct Node Configuration
  reactNode?: {
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    includeToolContext?: boolean;
    includeConversationHistory?: boolean;
    maxStepsInPrompt?: number;
  };

  // Answer Node Configuration
  answerNode?: {
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };

  // Reflection node settings (used for model selection/temperature)
  reflectAndDecide?: ReflectAndDecideConfig;

  // Clarify Node Configuration
  clarifyNode?: {
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
}

export interface ReactGraphInputValues {
  query: string;
  stepBudget?: number;
  allowedTools?: string[];
}

// Node configuration interfaces
export interface ModelConfig {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PlanAndSelectToolConfig {
  model?: string; // Model ID from UI
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  guidancePrompt?: string;
  maxSteps?: number;
  availableTools?: ToolConfiguration[];
}

export interface ExecuteToolConfig {
  model?: string; // Model ID from UI
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  maxRetries?: number;
  timeoutSeconds?: number;
}

export interface ReflectAndDecideConfig {
  model?: string; // Model ID from UI
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  reflectionPrompt?: string;
  completionThreshold?: number;
  maxReflectionSteps?: number;
}

export interface GenerateAnswerConfig {
  model?: string; // Model ID from UI
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  answerPrompt?: string;
  includeExecutionDetails?: boolean;
  formatType?: "conversational" | "structured" | "technical";
}

export interface ClarifyConfig {
  model?: string; // Model ID from UI
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  clarificationPrompt?: string;
  maxClarificationAttempts?: number;
}

export interface ReactGraphConfigValues {
  checkpoint_ns?: string;
  checkpoint_id?: string;
  graphSettings?: ReactGraphSettings;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  agentId?: string;
  userId?: string;
}

export type ReactGraphCompiledGraph = CompiledStateGraph<
  ReactGraphStateValues,
  Partial<ReactGraphStateValues>,
  string
>;

export interface IReactGraphBuilder {
  buildGraph(payload?: IGraphRequestPayload): Promise<ReactGraphCompiledGraph>;
}
