/**
 * Graph node identifiers - strongly typed node names
 */
export enum GraphNodeId {
  PLAN_AND_SELECT_TOOL = "plan_and_select_tool",
  EXECUTE_TOOL = "execute_tool",
  REFLECT_AND_DECIDE = "reflect_and_decide",
  GENERATE_ANSWER = "generate_answer",
  CLARIFY = "clarify",
}

/**
 * Next action types for state transitions
 */
export enum NextAction {
  PLAN = "plan",
  EXECUTE = "execute",
  REFLECT = "reflect",
  ANSWER = "answer",
  CLARIFY = "clarify",
  STOP = "stop",
}

/**
 * Special graph markers
 */
export const GRAPH_MARKERS = {
  END: "__end__",
} as const;

/**
 * Mapping between NextAction and target nodes
 */
export const ACTION_TO_NODE_MAP: Record<
  NextAction,
  GraphNodeId | typeof GRAPH_MARKERS.END
> = {
  [NextAction.PLAN]: GraphNodeId.PLAN_AND_SELECT_TOOL,
  [NextAction.EXECUTE]: GraphNodeId.EXECUTE_TOOL,
  [NextAction.REFLECT]: GraphNodeId.REFLECT_AND_DECIDE,
  [NextAction.ANSWER]: GraphNodeId.GENERATE_ANSWER,
  [NextAction.CLARIFY]: GraphNodeId.CLARIFY,
  [NextAction.STOP]: GRAPH_MARKERS.END,
};
