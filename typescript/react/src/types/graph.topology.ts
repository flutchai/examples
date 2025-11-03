import { GraphNodeId, NextAction } from "./graph.constants";

/**
 * Node configuration for the graph
 */
export interface GraphNodeConfig {
  id: GraphNodeId;
  handler: string; // Method name to bind
}

/**
 * Edge configuration for the graph
 */
export interface GraphEdgeConfig {
  from: GraphNodeId | "START";
  to: GraphNodeId | "END";
}

/**
 * Conditional edge configuration
 */
export interface ConditionalEdgeConfig {
  from: GraphNodeId;
  router: string; // Function name for routing logic
  mappings: Record<string, GraphNodeId | "END">;
}

/**
 * Complete graph topology definition
 */
export interface GraphTopology {
  nodes: GraphNodeConfig[];
  edges: GraphEdgeConfig[];
  conditionalEdges: ConditionalEdgeConfig[];
}

/**
 * Predefined topology for React Graph v1.0.0 - ReAct Pattern
 * Based on Simple graph pattern with react node + tools node
 */
export const REACT_GRAPH_V1_TOPOLOGY: GraphTopology = {
  nodes: [
    { id: GraphNodeId.PLAN_AND_SELECT_TOOL, handler: "reactNode.execute" }, // Main ReAct node
    { id: GraphNodeId.EXECUTE_TOOL, handler: "reactNode.executeTools" }, // Tools execution node
    { id: GraphNodeId.GENERATE_ANSWER, handler: "answerNode.execute" }, // Final answer when needed
  ],
  edges: [
    { from: "START", to: GraphNodeId.PLAN_AND_SELECT_TOOL },
    { from: GraphNodeId.EXECUTE_TOOL, to: GraphNodeId.PLAN_AND_SELECT_TOOL }, // After tools, back to react
    { from: GraphNodeId.GENERATE_ANSWER, to: "END" },
  ],
  conditionalEdges: [
    {
      from: GraphNodeId.PLAN_AND_SELECT_TOOL,
      router: "routeFromReactNode", // New router function
      mappings: {
        [GraphNodeId.EXECUTE_TOOL]: GraphNodeId.EXECUTE_TOOL, // If tool_calls present
        [GraphNodeId.GENERATE_ANSWER]: GraphNodeId.GENERATE_ANSWER, // If step budget exceeded
        __end__: "END", // If complete answer ready
      },
    },
  ],
};
