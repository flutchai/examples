import { Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { IStoredMessageContent } from "@flutchai/flutch-sdk";
import {
  PendingToolCall,
  ReactGraphAnswer,
  ReactGraphClarification,
  ReactGraphDiagnostics,
  StepNarrative,
  ActivityLogEntry,
  PlanAction,
  ReflectionDecision,
  ToolInvocationSummary,
  ToolMetadata,
} from "./react.types";
import { NextAction } from "./types/graph.constants";

export const ReactGraphState = Annotation.Root({
  query: Annotation<string>({
    reducer: (_state, update) => update ?? _state,
    default: () => "",
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => {
      if (!update) {
        return state ?? [];
      }
      const base = state ?? [];
      return [...base, ...update];
    },
    default: () => [],
  }),
  lastGeneration: Annotation<AIMessage | null>({
    reducer: (_state, update) => update ?? null,
    default: () => null,
  }),
  step: Annotation<number>({
    reducer: (state, update) =>
      typeof update === "number" ? update : (state ?? 0),
    default: () => 0,
  }),
  stepBudget: Annotation<number>({
    reducer: (state, update) =>
      typeof update === "number" ? update : (state ?? 6),
    default: () => 6,
  }),
  allowedTools: Annotation<string[]>({
    reducer: (state, update) => update ?? state ?? [],
    default: () => [],
  }),
  availableTools: Annotation<ToolMetadata[]>({
    reducer: (_state, update) => update ?? _state ?? [],
    default: () => [],
  }),
  pendingToolCalls: Annotation<PendingToolCall[]>({
    reducer: (state, update) => (update === undefined ? (state ?? []) : update),
    default: () => [],
  }),
  toolShortlist: Annotation<ToolMetadata[]>({
    reducer: (_state, update) => update ?? _state ?? [],
    default: () => [],
  }),
  plan: Annotation<PlanAction | null>({
    reducer: (_state, update) => (update === undefined ? null : update),
    default: () => null,
  }),
  reflection: Annotation<ReflectionDecision | null>({
    reducer: (_state, update) => (update === undefined ? null : update),
    default: () => null,
  }),
  nextAction: Annotation<NextAction>({
    reducer: (_state, update) => update ?? _state ?? NextAction.PLAN,
    default: () => NextAction.PLAN,
  }),
  workingMemory: Annotation<ToolInvocationSummary[]>({
    reducer: (state, update) => {
      if (!update) {
        return state ?? [];
      }
      const base = state ?? [];
      return [...base, ...update];
    },
    default: () => [],
  }),
  evidence: Annotation<string>({
    reducer: (_state, update) => update ?? _state ?? "",
    default: () => "",
  }),
  stepNarrative: Annotation<StepNarrative | null>({
    reducer: (_state, update) => update ?? _state ?? null,
    default: () => null,
  }),
  activityLog: Annotation<ActivityLogEntry[]>({
    reducer: (state, update) => {
      if (!update) return state ?? [];
      const base = state ?? [];
      return [...base, ...update];
    },
    default: () => [],
  }),
  answer: Annotation<IStoredMessageContent | null>({
    reducer: (_state, update) => update ?? null,
    default: () => null,
  }),
  clarification: Annotation<ReactGraphClarification | null>({
    reducer: (_state, update) => update ?? null,
    default: () => null,
  }),
  diagnostics: Annotation<ReactGraphDiagnostics>({
    reducer: (state, update) => ({
      ...(state ?? {}),
      ...(update ?? {}),
    }),
    default: () => ({}) as ReactGraphDiagnostics,
  }),
  invocationHashes: Annotation<string[]>({
    reducer: (state, update) => {
      const base = new Set(state ?? []);
      (update ?? []).forEach(hash => base.add(hash));
      return Array.from(base);
    },
    default: () => [],
  }),
  latestObservation: Annotation<ToolInvocationSummary | null>({
    reducer: (_state, update) => update ?? null,
    default: () => null,
  }),
  loopStatus: Annotation<"active" | "exhausted" | "completed">({
    reducer: (_state, update) => update ?? _state ?? "active",
    default: () => "active",
  }),
});

// ReactGraphStateValues is now exported from react-graph.builder.ts
// to maintain consistency with LangGraph type patterns
