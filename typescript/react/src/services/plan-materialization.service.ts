import { Injectable } from "@nestjs/common";
import {
  PlanAction,
  ToolPlanAction,
  AnswerPlanAction,
  ClarifyPlanAction,
  ToolMetadata,
} from "../react.types";

/**
 * Raw response from planner LLM (before materialization)
 */
export interface PlannerResponse {
  type: "tool" | "answer" | "clarify";
  tool?: string;
  args?: Record<string, any>;
  answer?: string;
  confidence?: number;
  question?: string;
  rationale?: string;
}

/**
 * Configuration for plan materialization
 */
export interface PlanMaterializationConfig {
  fallbackConfidence: number;
  enableDuplicateDetection: boolean;
  enableToolValidation: boolean;
}

/**
 * Default materialization configuration
 */
export const DEFAULT_MATERIALIZATION_CONFIG: PlanMaterializationConfig = {
  fallbackConfidence: 0.35,
  enableDuplicateDetection: true,
  enableToolValidation: true,
};

/**
 * Service for materializing planner responses into executable plans
 */
@Injectable()
export class PlanMaterializationService {
  private readonly config: PlanMaterializationConfig;

  constructor() {
    this.config = DEFAULT_MATERIALIZATION_CONFIG;
  }

  /**
   * Materializes a planner response into an executable plan
   */
  materializePlan(
    plannerResponse: PlannerResponse | null,
    shortlist: ToolMetadata[],
    filteredTools: ToolMetadata[],
    invocationHashes: Set<string>
  ): PlanAction {
    // Handle null/empty response
    if (!plannerResponse) {
      return this.createFallbackAnswerPlan("Planner failed to respond");
    }

    // Route to specific materialization strategy
    switch (plannerResponse.type) {
      case "tool":
        return this.materializeToolPlan(
          plannerResponse,
          shortlist,
          filteredTools,
          invocationHashes
        );
      case "answer":
        return this.materializeAnswerPlan(plannerResponse);
      case "clarify":
        return this.materializeClarifyPlan(plannerResponse);
      default:
        return this.createFallbackAnswerPlan(
          `Unknown planner response type: ${(plannerResponse as any).type}`
        );
    }
  }

  /**
   * Materializes a tool plan with validation
   */
  private materializeToolPlan(
    plannerResponse: PlannerResponse,
    shortlist: ToolMetadata[],
    filteredTools: ToolMetadata[],
    invocationHashes: Set<string>
  ): PlanAction {
    // Validate tool name provided
    if (!plannerResponse.tool) {
      return this.createFallbackAnswerPlan(
        "Planner did not specify a tool name"
      );
    }

    // Find tool metadata
    const toolMeta = this.findToolMetadata(
      plannerResponse.tool,
      shortlist,
      filteredTools
    );

    if (!toolMeta) {
      return this.createFallbackAnswerPlan(
        `Planner suggested unavailable tool: ${plannerResponse.tool}`
      );
    }

    // Check for duplicate invocations
    if (this.config.enableDuplicateDetection) {
      const args = plannerResponse.args ?? {};
      const invocationHash = this.computeInvocationHash(toolMeta.name, args);

      if (invocationHashes.has(invocationHash)) {
        return this.createFallbackAnswerPlan(
          "Duplicate tool invocation prevented"
        );
      }
    }

    // Create successful tool plan
    return {
      type: "tool",
      tool: toolMeta.name,
      args: plannerResponse.args ?? {},
      rationale:
        plannerResponse.rationale ||
        "Execute tool to gather additional evidence",
      metadata: {
        shortlistScore: toolMeta.shortlistScore,
        tags: toolMeta.tags,
      },
    } as ToolPlanAction;
  }

  /**
   * Materializes an answer plan
   */
  private materializeAnswerPlan(plannerResponse: PlannerResponse): PlanAction {
    const confidence =
      plannerResponse.confidence ?? this.config.fallbackConfidence;

    return {
      type: "answer",
      answer:
        plannerResponse.answer ||
        "Provide a concise answer using gathered evidence",
      confidence,
      rationale:
        plannerResponse.rationale ||
        "Planner determined evidence is sufficient for response",
    } as AnswerPlanAction;
  }

  /**
   * Materializes a clarification plan
   */
  private materializeClarifyPlan(plannerResponse: PlannerResponse): PlanAction {
    return {
      type: "clarify",
      question:
        plannerResponse.question ||
        "Could you clarify the specific detail you need?",
      rationale:
        plannerResponse.rationale ||
        "Planner determined more user input is required",
    } as ClarifyPlanAction;
  }

  /**
   * Creates a fallback answer plan for error cases
   */
  private createFallbackAnswerPlan(reason: string): AnswerPlanAction {
    return {
      type: "answer",
      answer: `Unable to proceed: ${reason}. Provide best-effort answer from current evidence.`,
      confidence: this.config.fallbackConfidence,
      rationale: `Materialization failed: ${reason}`,
    };
  }

  /**
   * Finds tool metadata in shortlist or filtered tools
   */
  private findToolMetadata(
    toolName: string,
    shortlist: ToolMetadata[],
    filteredTools: ToolMetadata[]
  ): ToolMetadata | null {
    // Check shortlist first (higher priority)
    const shortlistTool = shortlist.find(tool => tool.name === toolName);
    if (shortlistTool) {
      return shortlistTool;
    }

    // Fall back to filtered tools
    return filteredTools.find(tool => tool.name === toolName) || null;
  }

  /**
   * Computes invocation hash for deduplication
   */
  private computeInvocationHash(
    tool: string,
    args: Record<string, any>
  ): string {
    return `${tool}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  /**
   * Validates a materialized plan
   */
  validatePlan(plan: PlanAction): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    switch (plan.type) {
      case "tool":
        const toolPlan = plan as ToolPlanAction;
        if (!toolPlan.tool) {
          issues.push("Tool plan missing tool name");
        }
        if (!toolPlan.args) {
          issues.push("Tool plan missing arguments");
        }
        break;

      case "answer":
        const answerPlan = plan as AnswerPlanAction;
        if (!answerPlan.answer || answerPlan.answer.trim().length === 0) {
          issues.push("Answer plan has empty answer");
        }
        if (answerPlan.confidence < 0 || answerPlan.confidence > 1) {
          issues.push("Answer confidence must be between 0 and 1");
        }
        break;

      case "clarify":
        const clarifyPlan = plan as ClarifyPlanAction;
        if (!clarifyPlan.question || clarifyPlan.question.trim().length === 0) {
          issues.push("Clarify plan has empty question");
        }
        break;

      default:
        issues.push(`Unknown plan type: ${(plan as any).type}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Formats plan for debugging/logging
   */
  formatPlanForLogging(plan: PlanAction): string {
    switch (plan.type) {
      case "tool":
        const toolPlan = plan as ToolPlanAction;
        return `Tool: ${toolPlan.tool} with args: ${JSON.stringify(toolPlan.args)}`;

      case "answer":
        const answerPlan = plan as AnswerPlanAction;
        return `Answer: ${answerPlan.answer.slice(0, 100)}... (confidence: ${answerPlan.confidence})`;

      case "clarify":
        const clarifyPlan = plan as ClarifyPlanAction;
        return `Clarify: ${clarifyPlan.question}`;

      default:
        return `Unknown plan type: ${JSON.stringify(plan)}`;
    }
  }
}
