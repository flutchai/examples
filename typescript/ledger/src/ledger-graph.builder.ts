/**
 * Type definitions for Ledger Graph StateGraph construction
 * Analogous to React graph builder types
 */

import type {
  BaseChannel,
  StateDefinition,
  StateType,
  CompiledStateGraph,
} from "@langchain/langgraph";
import { WorkflowState } from "./graph/graph.state";
import { IGraphConfigurable } from "@flutchai/flutch-sdk";

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
export type UnpackedLedgerGraphState = typeof WorkflowState.State;

/**
 * LLM Configuration Interface
 */
export interface LLMConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Node Configuration Interfaces
 */

export interface AnalyzeTransactionConfig {
  llmConfig: LLMConfig;
}

export interface BuildTransactionConfig {
  llmConfig: LLMConfig;
}

export interface ConfirmAccountsConfig {
  llmConfig?: LLMConfig;
}

export interface PresentResultConfig {
  llmConfig?: LLMConfig;
}

export interface RouteIntentConfig {
  llmConfig: LLMConfig;
}

export interface AccountManagementConfig {
  llmConfig: LLMConfig;
}

/**
 * Complete Graph Settings from config-schema.json
 */
export interface LedgerGraphSettings {
  analyzeTransaction?: AnalyzeTransactionConfig;
  buildTransaction?: BuildTransactionConfig;
  confirmAccounts?: ConfirmAccountsConfig;
  presentResult?: PresentResultConfig;
  routeIntent?: RouteIntentConfig;
  accountManagement?: AccountManagementConfig;
}

/**
 * Type definitions for StateGraph construction
 * These match the pattern used in React graph
 */
export type LedgerGraphDefinition = StateDefinition &
  MappedChannels<UnpackedLedgerGraphState>;

export type LedgerGraphConfigDefinition = StateDefinition &
  MappedChannels<IGraphConfigurable<LedgerGraphSettings>>;

export type LedgerGraphStateValues = StateType<LedgerGraphDefinition>;
export type LedgerGraphInputValues = UnpackedLedgerGraphState;
export type LedgerGraphConfigValues = StateType<LedgerGraphConfigDefinition>;

/**
 * Compiled graph type
 */
export type LedgerGraphCompiledGraph = CompiledStateGraph<
  LedgerGraphStateValues,
  Partial<LedgerGraphStateValues>,
  string
>;

// Re-export WorkflowState for convenience
export { WorkflowState as LedgerGraphState };
