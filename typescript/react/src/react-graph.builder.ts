/**
 * Type definitions for React Graph StateGraph construction
 * Analogous to RAG graph builder types
 */

import type {
  BaseChannel,
  StateDefinition,
  StateType,
} from "@langchain/langgraph";
import { ReactGraphState } from "./state.model";

/**
 * Helper type to map state properties to BaseChannel
 */
type MappedChannels<T> = {
  [K in keyof T]: BaseChannel<T[K], T[K]>;
};

/**
 * UnpackedState - the actual state structure that flows through the graph
 * This is what nodes receive and return
 */
export type UnpackedReactGraphState = typeof ReactGraphState.State;

/**
 * Input structure for graph.invoke()
 */
export interface ReactGraphInput {
  query: string;
  stepBudget?: number;
  allowedTools?: string[];
}

/**
 * Config structure for RunnableConfig.configurable
 */
export interface ReactGraphConfig {
  checkpoint_ns?: string;
  checkpoint_id?: string;
  graphSettings?: any;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  agentId?: string;
  userId?: string;
}

/**
 * Type definitions for StateGraph construction
 * These match the pattern used in RAG graph
 */
export type ReactGraphDefinition = StateDefinition &
  MappedChannels<UnpackedReactGraphState>;
export type ReactGraphInputDefinition = StateDefinition &
  MappedChannels<ReactGraphInput>;
export type ReactGraphConfigDefinition = StateDefinition &
  MappedChannels<ReactGraphConfig>;

export type ReactGraphStateValues = StateType<ReactGraphDefinition>;
export type ReactGraphInputValues = StateType<ReactGraphInputDefinition>;
export type ReactGraphConfigValues = StateType<ReactGraphConfigDefinition>;

// Re-export ReactGraphState for convenience
export { ReactGraphState };
