import { BaseMessage, AIMessage } from "@langchain/core/messages";

/**
 * Type definitions for Simple graph
 * Graph-specific types that don't need to conform to a base interface
 */

export interface SimpleStateValues {
  messages: BaseMessage[];
  generation?: AIMessage;
  output?: {
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
  };
  metadata?: Record<string, any>;
}

export interface SimpleInputValues {
  messages: BaseMessage[];
}

export interface SimpleConfigValues {
  thread_id: string;
  checkpoint_ns?: string;
  checkpoint_id?: string;
  metadata?: Record<string, any>;
  graphSettings?: {
    temperature?: number;
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
    enableReflection?: boolean;
    reflectionDepth?: number;
    [key: string]: any;
  };
}

export interface SimpleOutputValues {
  messages: BaseMessage[];
  metadata?: Record<string, any>;
}

/**
 * Graph settings from manifest
 */
export interface SimpleGraphSettings {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Type for compiled Simple graph
 */
export type SimpleCompiledGraph = any; // Using any for compatibility with LangGraph's complex types

/**
 * Interface for Simple graph builders
 */
export interface ISimpleGraphBuilder {
  readonly version: string;
  buildGraph(payload?: any): Promise<SimpleCompiledGraph>;
  prepareConfig(payload: any): Promise<{
    input: SimpleInputValues;
    configurable: SimpleConfigValues;
  }>;
}
