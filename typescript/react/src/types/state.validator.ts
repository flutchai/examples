import { NextAction, GraphNodeId } from "./graph.constants";
import { ReactGraphStateValues } from "../react-graph.builder";

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * State transition rules
 */
export interface StateTransitionRule {
  from: NextAction[];
  to: NextAction;
  condition: (state: ReactGraphStateValues) => boolean;
  message?: string;
}

/**
 * Predefined validation rules for React Graph
 */
export const STATE_TRANSITION_RULES: StateTransitionRule[] = [
  // Budget validation
  {
    from: [NextAction.PLAN, NextAction.EXECUTE, NextAction.REFLECT],
    to: NextAction.ANSWER,
    condition: (state) => (state.step ?? 0) >= (state.stepBudget ?? 6),
    message: "Step budget exhausted - should transition to answer mode",
  },

  // Tool availability validation
  {
    from: [NextAction.PLAN],
    to: NextAction.ANSWER,
    condition: (state) => (state.allowedTools?.length ?? 0) === 0,
    message: "No tools available - should generate answer directly",
  },

  // Evidence validation
  {
    from: [NextAction.REFLECT],
    to: NextAction.ANSWER,
    condition: (state) => (state.evidence?.length ?? 0) > 100,
    message: "Sufficient evidence gathered - ready for answer",
  },

  // Prevent infinite loops - force answer generation
  {
    from: [NextAction.PLAN],
    to: NextAction.ANSWER,
    condition: (state) => (state.step ?? 0) > 3 && !state.evidence,
    message:
      "Multiple planning steps without progress - should generate answer",
  },

  // Detect tool repetition cycles - but allow more attempts if we have partial success
  {
    from: [NextAction.EXECUTE],
    to: NextAction.ANSWER,
    condition: (state) => {
      const recentEntries = state.workingMemory?.slice(-4) ?? [];
      if (recentEntries.length >= 3) {
        const tools = recentEntries.map((entry) => entry.tool);
        const uniqueTools = new Set(tools);
        const allFailed = recentEntries.every(
          (entry) => !entry.observation.success,
        );
        const hasAnySuccess =
          state.workingMemory?.some((entry) => entry.observation.success) ||
          false;
        // Only force answer if same tool failing repeatedly AND we have some successful data
        return uniqueTools.size === 1 && allFailed && hasAnySuccess;
      }
      return false;
    },
    message:
      "Same tool failing repeatedly but we have useful information - should generate answer",
  },

  // Emergency brake for excessive failures - but only if no useful information gathered
  {
    from: [NextAction.PLAN, NextAction.EXECUTE, NextAction.REFLECT],
    to: NextAction.ANSWER,
    condition: (state) => {
      const failedAttempts =
        state.workingMemory?.filter((entry) => !entry.observation.success)
          .length ?? 0;
      const hasUsefulInfo =
        (state.evidence?.length ?? 0) > 50 ||
        state.workingMemory?.some((entry) => entry.observation.success) ||
        false;
      // Only force answer if too many failures AND we have some useful information to work with
      return failedAttempts >= 4 && hasUsefulInfo;
    },
    message:
      "Too many tool failures but we have useful information - should generate answer",
  },
];

/**
 * State validator class
 */
export class ReactGraphStateValidator {
  private rules: StateTransitionRule[];

  constructor(rules: StateTransitionRule[] = STATE_TRANSITION_RULES) {
    this.rules = rules;
  }

  /**
   * Validates the current state
   */
  validateState(state: ReactGraphStateValues): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic state integrity checks
    this.validateBasicIntegrity(state, errors);

    // Budget checks
    this.validateBudget(state, warnings);

    // Loop detection
    this.validateForLoops(state, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates a state transition
   */
  validateTransition(
    currentState: ReactGraphStateValues,
    nextAction: NextAction,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Apply transition rules
    for (const rule of this.rules) {
      if (
        rule.from.includes(currentState.nextAction) &&
        rule.to === nextAction &&
        rule.condition(currentState)
      ) {
        if (rule.message) {
          warnings.push(rule.message);
        }
      }
    }

    // Validate specific transitions
    this.validateSpecificTransitions(
      currentState,
      nextAction,
      errors,
      warnings,
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Suggests the best next action based on current state
   */
  suggestNextAction(state: ReactGraphStateValues): NextAction {
    const currentStep = state.step ?? 0;
    const stepBudget = state.stepBudget ?? 6;

    // Emergency brake: if we're at step budget limit, force answer
    if (currentStep >= stepBudget) {
      return NextAction.ANSWER;
    }

    // Emergency brake: if we're close to step budget and have no progress, force answer
    if (currentStep >= Math.max(2, stepBudget - 1)) {
      const hasEvidence = (state.evidence?.length ?? 0) > 0;
      const hasWorkingMemory = (state.workingMemory?.length ?? 0) > 0;

      if (!hasEvidence && !hasWorkingMemory) {
        // No progress made and almost at budget limit
        return NextAction.ANSWER;
      }
    }

    // Pending tool calls take priority for execution
    if ((state.pendingToolCalls?.length ?? 0) > 0) {
      return NextAction.EXECUTE;
    }

    // No tools available
    if ((state.allowedTools?.length ?? 0) === 0) {
      return NextAction.ANSWER;
    }

    // Check for infinite loops - CRITICAL for preventing cycles
    const recentEntries = state.workingMemory?.slice(-5) ?? [];
    if (recentEntries.length >= 3) {
      // Check if we're repeating the same tool calls
      const lastThreeTools = recentEntries.slice(-3).map((entry) => entry.tool);
      const uniqueTools = new Set(lastThreeTools);

      if (
        uniqueTools.size === 1 &&
        recentEntries.slice(-3).every((entry) => !entry.observation.success)
      ) {
        // Same tool failing repeatedly - force answer generation
        return NextAction.ANSWER;
      }

      // Check for alternating failures
      const failureCount = recentEntries.filter(
        (entry) => !entry.observation.success,
      ).length;
      if (failureCount >= 3) {
        return NextAction.ANSWER;
      }
    }

    // Multiple failed attempts
    const failedAttempts =
      state.workingMemory?.filter((entry) => !entry.observation.success)
        .length ?? 0;

    if (failedAttempts > 2) {
      return NextAction.ANSWER; // Changed from CLARIFY to ANSWER to prevent more loops
    }

    // Sufficient evidence for answer
    if ((state.evidence?.length ?? 0) > 200 && currentStep > 2) {
      return NextAction.ANSWER;
    }

    // Honor explicit plans produced by upstream nodes
    if (state.plan) {
      switch (state.plan.type) {
        case "tool":
          return NextAction.EXECUTE;
        case "answer":
          return NextAction.ANSWER;
        case "clarify":
          return NextAction.CLARIFY;
        default:
          break;
      }
    }

    // Default: create a new plan
    return NextAction.PLAN;
  }

  private validateBasicIntegrity(
    state: ReactGraphStateValues,
    errors: string[],
  ): void {
    if (!state.query || state.query.trim().length === 0) {
      errors.push("Query is required and cannot be empty");
    }

    if ((state.step ?? 0) < 0) {
      errors.push("Step count cannot be negative");
    }

    if ((state.stepBudget ?? 0) <= 0) {
      errors.push("Step budget must be positive");
    }
  }

  private validateBudget(
    state: ReactGraphStateValues,
    warnings: string[],
  ): void {
    const currentStep = state.step ?? 0;
    const budget = state.stepBudget ?? 6;

    if (currentStep >= budget * 0.8) {
      warnings.push("Approaching step budget limit");
    }

    if (currentStep >= budget) {
      warnings.push("Step budget exceeded");
    }
  }

  private validateForLoops(
    state: ReactGraphStateValues,
    warnings: string[],
  ): void {
    const recentActions = state.workingMemory?.slice(-5) ?? [];

    // Check for repeated failed attempts - be less aggressive
    const repeatedFailures = recentActions.filter(
      (entry) => !entry.observation.success,
    );

    // Only warn if we have many failures AND no successful results at all
    const hasAnySuccess =
      state.workingMemory?.some((entry) => entry.observation.success) || false;
    const hasEvidence = (state.evidence?.length ?? 0) > 50;

    if (repeatedFailures.length >= 3 && !hasAnySuccess && !hasEvidence) {
      warnings.push("Multiple consecutive failures detected with no progress");
    } else if (repeatedFailures.length >= 2 && hasAnySuccess) {
      warnings.push(
        "Some tools failing but partial information available - consider generating answer",
      );
    }

    // Check for duplicate tool calls - also be less aggressive
    const toolCalls = recentActions.map((entry) => entry.tool);
    const uniqueTools = new Set(toolCalls);
    if (toolCalls.length >= 3 && uniqueTools.size === 1 && !hasAnySuccess) {
      warnings.push("Same tool failing repeatedly with no progress");
    }
  }

  private validateSpecificTransitions(
    currentState: ReactGraphStateValues,
    nextAction: NextAction,
    errors: string[],
    warnings: string[],
  ): void {
    // Validate EXECUTE transition
    if (nextAction === NextAction.EXECUTE) {
      if (!currentState.plan || currentState.plan.type !== "tool") {
        errors.push("Cannot execute without a valid tool plan");
      }
    }

    // Validate ANSWER transition
    if (nextAction === NextAction.ANSWER) {
      if (!currentState.evidence && (currentState.step ?? 0) < 2) {
        warnings.push("Generating answer without sufficient evidence or steps");
      }
    }

    // Validate CLARIFY transition
    if (nextAction === NextAction.CLARIFY) {
      if ((currentState.step ?? 0) === 0) {
        warnings.push("Requesting clarification before attempting any actions");
      }
    }
  }
}
