import {
  NextAction,
  GraphNodeId,
  GRAPH_MARKERS,
} from "../../types/graph.constants";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { ReactGraphStateValidator } from "../../types/state.validator";

/**
 * Routing strategy for plan-and-select-tool node with validation
 */
// Keep track of consecutive PLAN routing decisions to prevent infinite loops
let consecutivePlanRoutes = 0;

export function routeFromPlanAndSelectTool(
  state: ReactGraphStateValues
): string {
  // Create validator instance for routing decisions
  const validator = new ReactGraphStateValidator();

  // Emergency brake: use stepBudget as the limit for consecutive plans
  const currentStep = state.step ?? 0;
  const stepBudget =
    typeof state.stepBudget === "string"
      ? parseInt(state.stepBudget)
      : (state.stepBudget ?? 6);

  if (currentStep >= stepBudget || consecutivePlanRoutes >= stepBudget) {
    console.warn(
      `Emergency brake: step=${currentStep}, budget=${stepBudget}, consecutivePlans=${consecutivePlanRoutes} - forcing answer`
    );
    consecutivePlanRoutes = 0; // Reset counter
    return GraphNodeId.GENERATE_ANSWER;
  }

  // Validate current state
  const stateValidation = validator.validateState(state);
  if (!stateValidation.valid) {
    console.warn("State validation failed:", stateValidation.errors);
    consecutivePlanRoutes = 0; // Reset counter
    // Force to answer generation if state is invalid
    return GraphNodeId.GENERATE_ANSWER;
  }

  // Log warnings and check for critical loop conditions
  if (stateValidation.warnings.length > 0) {
    console.warn("State warnings:", stateValidation.warnings);

    // Check for loop detection warnings
    const hasLoopWarnings = stateValidation.warnings.some(
      warning =>
        warning.includes("consecutive failures") ||
        warning.includes("repetition detected") ||
        warning.includes("Multiple consecutive failures") ||
        warning.includes("Potential tool call repetition")
    );

    if (hasLoopWarnings) {
      console.warn("Loop detected - forcing answer generation");
      consecutivePlanRoutes = 0; // Reset counter
      return GraphNodeId.GENERATE_ANSWER;
    }
  }

  // Use validator to suggest next action based on current state
  const suggestedAction = validator.suggestNextAction(state);

  // If validator suggests different action than current, follow validator
  if (suggestedAction !== state.nextAction) {
    console.warn(
      `Validator suggests ${suggestedAction} instead of ${state.nextAction} - following validator`
    );
  }

  // Route based on validator suggestion (prioritize over state.nextAction)
  switch (suggestedAction) {
    case NextAction.EXECUTE:
      consecutivePlanRoutes = 0; // Reset counter
      return GraphNodeId.EXECUTE_TOOL;
    case NextAction.ANSWER:
      consecutivePlanRoutes = 0; // Reset counter
      return GraphNodeId.GENERATE_ANSWER;
    case NextAction.CLARIFY:
      consecutivePlanRoutes = 0; // Reset counter
      return GraphNodeId.CLARIFY;
    case NextAction.STOP:
      consecutivePlanRoutes = 0; // Reset counter
      return GRAPH_MARKERS.END;
    case NextAction.PLAN:
    default:
      consecutivePlanRoutes++; // Increment counter
      if (consecutivePlanRoutes >= stepBudget) {
        console.warn(
          `Too many consecutive PLAN routes (${consecutivePlanRoutes}/${stepBudget}) - forcing answer`
        );
        consecutivePlanRoutes = 0; // Reset counter
        return GraphNodeId.GENERATE_ANSWER;
      }
      return GraphNodeId.PLAN_AND_SELECT_TOOL;
  }
}

/**
 * Routing strategy for reflect-and-decide node with validation
 */
export function routeFromReflectAndDecide(
  state: ReactGraphStateValues
): string {
  // Create validator instance for routing decisions
  const validator = new ReactGraphStateValidator();

  // Validate current state
  const stateValidation = validator.validateState(state);
  if (!stateValidation.valid) {
    console.warn("State validation failed:", stateValidation.errors);
    // Force to answer generation if state is invalid
    return GraphNodeId.GENERATE_ANSWER;
  }

  // Log warnings and check for critical loop conditions
  if (stateValidation.warnings.length > 0) {
    console.warn("State warnings:", stateValidation.warnings);

    // Check for loop detection warnings
    const hasLoopWarnings = stateValidation.warnings.some(
      warning =>
        warning.includes("consecutive failures") ||
        warning.includes("repetition detected") ||
        warning.includes("Multiple consecutive failures") ||
        warning.includes("Potential tool call repetition")
    );

    if (hasLoopWarnings) {
      console.warn("Loop detected - forcing answer generation");
      return GraphNodeId.GENERATE_ANSWER;
    }
  }

  // Use validator to suggest next action based on current state
  const suggestedAction = validator.suggestNextAction(state);

  // If validator suggests different action than current, follow validator
  if (suggestedAction !== state.nextAction) {
    console.warn(
      `Validator suggests ${suggestedAction} instead of ${state.nextAction} - following validator`
    );
  }

  // Route based on validator suggestion (prioritize over state.nextAction)
  switch (suggestedAction) {
    case NextAction.PLAN:
      return GraphNodeId.PLAN_AND_SELECT_TOOL;
    case NextAction.ANSWER:
      return GraphNodeId.GENERATE_ANSWER;
    case NextAction.CLARIFY:
      return GraphNodeId.CLARIFY;
    case NextAction.STOP:
      return GRAPH_MARKERS.END;
    default:
      return GraphNodeId.PLAN_AND_SELECT_TOOL;
  }
}

/**
 * Routing strategy for React node - similar to Simple graph
 * Routes based on presence of tool_calls in the last message
 */
export function routeFromReactNode(state: ReactGraphStateValues): string {
  const stepBudget =
    typeof state.stepBudget === "string"
      ? parseInt(state.stepBudget)
      : (state.stepBudget ?? 6);
  const currentStep = state.step ?? 0;

  // Emergency brake: if budget exceeded, force answer
  if (currentStep >= stepBudget) {
    console.warn(
      `React node: step budget exhausted (${currentStep}/${stepBudget}) - forcing answer`
    );
    return GraphNodeId.GENERATE_ANSWER;
  }

  // Check if the last message has tool calls
  const lastMessage = state.messages?.[state.messages.length - 1];
  const hasToolCalls = (lastMessage as any)?.tool_calls?.length > 0;

  if (hasToolCalls) {
    console.debug(
      `React node: found ${(lastMessage as any).tool_calls.length} tool calls - routing to tools`
    );
    return GraphNodeId.EXECUTE_TOOL;
  }

  // No tool calls - the model wants to provide a final answer
  // Let the answer node generate the structured response
  console.debug(
    `React node: no tool calls detected - routing to answer generation`
  );
  return GraphNodeId.GENERATE_ANSWER;
}

/**
 * Route mapping for conditional edges
 */
export const ROUTE_MAPPINGS = {
  fromPlanAndSelectTool: {
    [GraphNodeId.EXECUTE_TOOL]: GraphNodeId.EXECUTE_TOOL,
    [GraphNodeId.GENERATE_ANSWER]: GraphNodeId.GENERATE_ANSWER,
    [GraphNodeId.CLARIFY]: GraphNodeId.CLARIFY,
    [GraphNodeId.PLAN_AND_SELECT_TOOL]: GraphNodeId.PLAN_AND_SELECT_TOOL,
    [GRAPH_MARKERS.END]: "__end__" as const,
  },
  fromReflectAndDecide: {
    [GraphNodeId.PLAN_AND_SELECT_TOOL]: GraphNodeId.PLAN_AND_SELECT_TOOL,
    [GraphNodeId.GENERATE_ANSWER]: GraphNodeId.GENERATE_ANSWER,
    [GraphNodeId.CLARIFY]: GraphNodeId.CLARIFY,
    [GRAPH_MARKERS.END]: "__end__" as const,
  },
  fromReactNode: {
    [GraphNodeId.EXECUTE_TOOL]: GraphNodeId.EXECUTE_TOOL,
    [GraphNodeId.GENERATE_ANSWER]: GraphNodeId.GENERATE_ANSWER,
    [GRAPH_MARKERS.END]: "__end__" as const,
  },
} as const;
