import { Injectable } from "@nestjs/common";
import { ToolMetadata, PlanAndSelectToolConfig } from "../react.types";
import { ReactGraphStateValues } from "../react-graph.builder";

/**
 * Prompt templates for the planner
 */
export interface PlannerPromptTemplates {
  systemPrompt: string;
  humanPromptTemplate: string;
  toolDescriptionTemplate: string;
  workingMemoryTemplate: string;
}

/**
 * Default prompt templates
 */
export const DEFAULT_PLANNER_TEMPLATES: PlannerPromptTemplates = {
  systemPrompt: `You are a specialized AI tool orchestrator in a ReAct workflow. Your sole responsibility is analyzing user queries and current evidence to select the most relevant tool for gathering missing information.

# Core Competencies
- **Tool Analysis**: Evaluate available tools against query requirements
- **Context Synthesis**: Understand what information is already available vs. missing
- **Strategic Planning**: Choose tools that maximize information gain
- **Deduplication**: Avoid repeating identical tool calls

# Decision Framework
1. **TOOL**: Select when specific information is missing and an available tool can provide it
2. **ANSWER**: Choose when current evidence is sufficient for a comprehensive response
3. **CLARIFY**: Only when critical user input is required and no tool can resolve the ambiguity

# Quality Standards
- Be precise in tool argument specification
- Provide clear rationale for each decision
- Optimize for information gathering efficiency
- Maintain awareness of step budget constraints

Output only valid JSON matching the specified schema.`,

  humanPromptTemplate: `# Current Context
**User Query**: "{{query}}"
**Evidence Summary**: {{evidence}}
**Step Budget**: {{remaining}} remaining of {{stepBudget}} total
**Previous Executions**: {{previousHashes}}

# Recent Working Memory
{{workingMemory}}

# Available Tools
{{toolsText}}

# Response Format
Respond with exactly one of these JSON structures:

**Select Tool**:
{"type": "tool", "tool": "tool_name", "args": {"param": "value"}, "rationale": "Why this tool adds necessary information"}

**Provide Answer**:
{"type": "answer", "answer": "Direct response to user", "confidence": 0.85, "rationale": "Why current evidence is sufficient"}

**Request Clarification**:
{"type": "clarify", "question": "What specific aspect needs clarification?", "rationale": "Why user input is essential"}

# Decision Guidelines
{{guidancePrompt}}

Focus on tools that add NEW information not already in evidence and are directly related to answering the user's query.`,

  toolDescriptionTemplate: `- {{name}}
  Description: {{description}}
  Required: {{required}}
  Tags: {{tags}}`,

  workingMemoryTemplate: `{{tool}} ({{status}}): {{summary}}`,
};

/**
 * Context variables for prompt templating
 */
export interface PlannerPromptContext {
  query: string;
  evidence: string;
  stepBudget: number;
  remaining: number;
  previousHashes: string[];
  workingMemory: string;
  toolsText: string;
  maxShortlist: number;
  guidancePrompt: string;
}

/**
 * Service for building planner prompts from templates
 */
@Injectable()
export class PlannerPromptService {
  private readonly templates: PlannerPromptTemplates;

  constructor() {
    this.templates = DEFAULT_PLANNER_TEMPLATES;
  }

  /**
   * Builds complete planner prompt for LLM
   */
  buildPlannerPrompt(
    state: ReactGraphStateValues,
    tools: ToolMetadata[],
    stepBudget: number,
    remaining: number,
    config: PlanAndSelectToolConfig = {}
  ): { system: string; human: string } {
    // Build context from current state
    const context = this.buildPromptContext(
      state,
      tools,
      stepBudget,
      remaining,
      config
    );

    // Use custom system prompt if provided, otherwise use default
    const systemPrompt = config.systemPrompt || this.templates.systemPrompt;

    // Render human prompt from template
    const humanPrompt = this.renderTemplate(
      this.templates.humanPromptTemplate,
      context
    );

    return {
      system: systemPrompt,
      human: humanPrompt,
    };
  }

  /**
   * Builds context object for template rendering
   */
  private buildPromptContext(
    state: ReactGraphStateValues,
    tools: ToolMetadata[],
    stepBudget: number,
    remaining: number,
    config: PlanAndSelectToolConfig = {}
  ): PlannerPromptContext {
    const defaultGuidance =
      "Focus on tools that:\n- Add NEW information not already in evidence\n- Are most directly related to the user's query\n- Can be executed with available arguments\n- Provide structured, actionable results";

    return {
      query: state.query || "",
      evidence: state.evidence || "(none yet)",
      stepBudget,
      remaining,
      previousHashes: this.formatPreviousHashes(state),
      workingMemory: this.formatWorkingMemory(state),
      toolsText: this.formatToolList(tools),
      maxShortlist: tools.length,
      guidancePrompt: config.guidancePrompt || defaultGuidance,
    };
  }

  /**
   * Formats tool list for prompt (no scoring, just all available tools)
   */
  private formatToolList(tools: ToolMetadata[]): string {
    return tools
      .map(tool => {
        const required = tool.inputSchema?.required || [];
        const context = {
          name: tool.name,
          description: tool.description || "No description",
          required: required.join(", ") || "none",
          tags: (tool.tags || []).join(", ") || "n/a",
        };

        return this.renderTemplate(
          this.templates.toolDescriptionTemplate,
          context
        );
      })
      .join("\n\n");
  }

  /**
   * Formats working memory for prompt
   */
  private formatWorkingMemory(state: ReactGraphStateValues): string {
    if (!state.workingMemory?.length) {
      return "(no prior tool executions)";
    }

    return state.workingMemory
      .slice(-3) // Last 3 entries
      .map(entry => {
        const status = entry.observation.success ? "success" : "failure";
        const summary =
          entry.observation.summary ||
          this.safeTruncate(
            typeof entry.observation.payload === "string"
              ? entry.observation.payload
              : JSON.stringify(entry.observation.payload ?? {}, null, 2),
            300
          );

        const context = {
          tool: entry.tool,
          status,
          summary,
        };

        return this.renderTemplate(
          this.templates.workingMemoryTemplate,
          context
        );
      })
      .join("\n");
  }

  /**
   * Formats previous tool invocation hashes
   */
  private formatPreviousHashes(state: ReactGraphStateValues): string[] {
    return (state.workingMemory || []).map(entry =>
      this.computeInvocationHash(entry.tool, entry.args)
    );
  }

  /**
   * Simple template rendering with {{variable}} syntax
   */
  private renderTemplate(
    template: string,
    context: Record<string, any>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{{${key}}}`;
      const replacement = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");

      result = result.replace(new RegExp(placeholder, "g"), replacement);
    }

    return result;
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
   * Safely truncates text to maximum length
   */
  private safeTruncate(value: string, maxLength: number = 400): string {
    if (!value) return "";
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  /**
   * Customizes prompt templates
   */
  setTemplates(templates: Partial<PlannerPromptTemplates>): void {
    Object.assign(this.templates, templates);
  }
}
