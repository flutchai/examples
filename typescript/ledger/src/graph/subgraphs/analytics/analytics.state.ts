import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Analytics Subgraph State
 *
 * State structure for the analytics subgraph that handles analytical queries
 * about accounts and transactions.
 */
export const AnalyticsState = Annotation.Root({
  /**
   * Original user query about analytics
   */
  query: Annotation<string>,

  /**
   * Parsed analytical intent (what user wants to analyze)
   */
  analyticalIntent: Annotation<string | undefined>,

  /**
   * Tools to be executed for analytics
   */
  toolsToExecute: Annotation<string[]>,

  /**
   * Tool execution results
   */
  toolResults: Annotation<Record<string, any>>,

  /**
   * Final analytical response
   */
  analyticsResult: Annotation<string | undefined>,

  /**
   * Messages for LLM interactions
   */
  messages: Annotation<BaseMessage[]>,

  /**
   * User ID (inherited from parent state)
   */
  userId: Annotation<string>,

  /**
   * Error message if any
   */
  error: Annotation<string | undefined>,
});

export type AnalyticsStateValues = typeof AnalyticsState.State;
