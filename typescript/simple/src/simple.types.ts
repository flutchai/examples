import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import type {
  BaseChannel,
  StateDefinition,
  StateType,
} from "@langchain/langgraph";

/**
 * Type definitions for Simple graph following the backend pattern
 */

// Helper type for mapped channels
type MappedChannels<T> = {
  [K in keyof T]: BaseChannel<T[K], T[K]>;
};

// ============================================================================
// State Definition
// ============================================================================

export interface SimpleGraphState {
  messages: BaseMessage[];
  generation: AIMessage;
}

export type SimpleGraphStateDefinition = StateDefinition &
  MappedChannels<SimpleGraphState>;

export type SimpleGraphStateValues = StateType<SimpleGraphStateDefinition>;

export const SimpleState = Annotation.Root<SimpleGraphStateDefinition>({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  generation: Annotation<AIMessage>(),
});

// ============================================================================
// Input Definition
// ============================================================================

export interface SimpleGraphInput {
  messages: BaseMessage[];
}

export type SimpleGraphInputDefinition = StateDefinition &
  MappedChannels<SimpleGraphInput>;

export type SimpleInputValues = StateType<SimpleGraphInputDefinition>;

export const SimpleGraphInvokeInput =
  Annotation.Root<SimpleGraphInputDefinition>({
    messages: Annotation<BaseMessage[]>({
      reducer: (state: BaseMessage[], update: BaseMessage[]) => [
        ...state,
        ...update,
      ],
      default: () => [],
    }),
  });

// ============================================================================
// Config Definition
// ============================================================================

export interface SimpleGraphParams {
  graphType: "flutch.simple::1.0.3";
  systemPrompt: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  tokenId?: string;
  availableTools?: string[];
  recursionLimit?: number;
}

export type SimpleGraphConfigDefinition = StateDefinition &
  MappedChannels<SimpleGraphParams>;

export type SimpleConfigValues = StateType<SimpleGraphConfigDefinition>;

export const SimpleGraphConfig = Annotation.Root<SimpleGraphConfigDefinition>({
  graphType: Annotation<"flutch.simple::1.0.3">(),
  systemPrompt: Annotation<string>(),
  modelId: Annotation<string>(),
  temperature: Annotation<number>(),
  maxTokens: Annotation<number>(),
  tokenId: Annotation<string>(),
  availableTools: Annotation<string[]>(),
  recursionLimit: Annotation<number>(),
});

// ============================================================================
// Output Definition
// ============================================================================

export interface SimpleOutputValues {
  messages: BaseMessage[];
}

// ============================================================================
// Compiled Graph Type
// ============================================================================

export type SimpleCompiledGraph = any; // Using any for compatibility with LangGraph's complex types

// ============================================================================
// Graph Builder Interface
// ============================================================================

export interface ISimpleGraphBuilder {
  readonly version: string;
  buildGraph(payload?: any): Promise<SimpleCompiledGraph>;
  prepareConfig(payload: any): Promise<{
    input: SimpleInputValues;
    configurable: SimpleConfigValues;
  }>;
}
