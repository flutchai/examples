import { Injectable } from "@nestjs/common";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { ExecuteToolNode } from "./nodes/execute-tool.node";
import { FormatResponseNode } from "./nodes/format-response.node";
import { StreamChannel } from "@flutchai/flutch-sdk";

/**
 * Account Management Subgraph State
 *
 * Matches parent graph fields for automatic propagation:
 * - userId: propagated from parent WorkflowState
 * - messages: propagated from parent WorkflowState
 */
export const AccountManagementState = Annotation.Root({
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  output: Annotation<{
    text: string;
    attachments?: any[];
  }>({
    reducer: (_, next) => next,
    default: () => ({ text: "" }),
  }),
});

export type AccountManagementStateValues = typeof AccountManagementState.State;

/**
 * Account Management Subgraph
 *
 * Handles account operations using LLM with tool binding:
 * - execute_tool: Calls LLM with tools, executes selected tool
 * - format_response: Formats tool results into user-friendly response
 */
@Injectable()
export class AccountManagementSubgraph {
  constructor(
    private readonly executeToolNode: ExecuteToolNode,
    private readonly formatResponseNode: FormatResponseNode
  ) {}

  build() {
    const graph = new StateGraph(AccountManagementState)
      .addNode(
        "execute_tool",
        (state, config) => this.executeToolNode.execute(state, config),
        {
          metadata: {
            stream_channel: StreamChannel.PROCESSING,
          },
        }
      )
      .addNode(
        "format_response",
        (state, config) => this.formatResponseNode.execute(state, config),
        {
          metadata: {
            stream_channel: StreamChannel.TEXT,
          },
        }
      )
      .addEdge(START, "execute_tool")
      .addEdge("execute_tool", "format_response")
      .addEdge("format_response", END);

    return graph.compile();
  }
}
