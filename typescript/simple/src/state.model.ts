import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
// Removed UsageRecorder imports - now using context-based pattern

/**
 * State definition for Simple graph using LangGraph Annotation
 * Follows the reference implementation pattern with usage tracking
 */
export const SimpleState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (state: BaseMessage[], update: BaseMessage[]) => [
      ...state,
      ...update,
    ],
    default: () => [],
  }),
  generation: Annotation<AIMessage>({
    reducer: (state, update) => update || state,
  }),
  // usageRecorder moved to context - access via (config as any)?.configurable?.context?.usageRecorder
  output: Annotation<{
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
  }>({
    reducer: (state, update) => update || state,
    default: () => ({ text: "", attachments: [], metadata: {} }),
  }),
  metadata: Annotation<Record<string, any>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),
});
