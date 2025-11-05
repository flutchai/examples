import { Injectable, Logger } from "@nestjs/common";
import { StateGraph, START, END } from "@langchain/langgraph";
import { AnalyticsState, AnalyticsStateValues } from "./analytics.state";
import { AnalyzeQueryNode } from "./nodes/analyze-query.node";
import { ExecuteAnalyticsToolNode } from "./nodes/execute-analytics-tool.node";
import { FormatAnalyticsResponseNode } from "./nodes/format-analytics-response.node";

/**
 * Analytics Subgraph
 *
 * Handles analytical queries about accounts and transactions.
 *
 * Flow:
 * 1. Analyze Query - LLM determines what user wants and which tools needed
 * 2. Execute Tools - Retrieve and process data using analytical tools
 * 3. Format Response - LLM formats results into user-friendly insights
 */
@Injectable()
export class AnalyticsSubgraph {
  private readonly logger = new Logger(AnalyticsSubgraph.name);

  constructor(
    private readonly analyzeQueryNode: AnalyzeQueryNode,
    private readonly executeToolNode: ExecuteAnalyticsToolNode,
    private readonly formatResponseNode: FormatAnalyticsResponseNode,
  ) {}

  /**
   * Build the analytics subgraph
   */
  build() {
    this.logger.log("Building Analytics Subgraph");

    const graph = new StateGraph(AnalyticsState)
      .addNode("analyze_query", (state, config) =>
        this.analyzeQueryNode.execute(state, config),
      )
      .addNode("execute_tools", (state, config) =>
        this.executeToolNode.execute(state, config),
      )
      .addNode("format_response", (state, config) =>
        this.formatResponseNode.execute(state, config),
      )
      .addEdge(START, "analyze_query")
      .addEdge("analyze_query", "execute_tools")
      .addEdge("execute_tools", "format_response")
      .addEdge("format_response", END);

    this.logger.log("Analytics Subgraph built successfully");

    return graph.compile();
  }
}
