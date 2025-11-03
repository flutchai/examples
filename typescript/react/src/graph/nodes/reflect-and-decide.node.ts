import { Injectable, Logger } from "@nestjs/common";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { z } from "zod";

import {
  ReactGraphSettings,
  ReactGraphConfigValues,
  ReflectionDecision,
  AnswerPlanAction,
  ClarifyPlanAction,
  ReflectAndDecideConfig,
  NextAction,
} from "../../react.types";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { ENV_CONFIG } from "../../config/environment.config";

const ReflectionDecisionSchema = z.object({
  decision: z.enum(["continue", NextAction.ANSWER, NextAction.CLARIFY]),
  updatedEvidence: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  rationale: z.string().optional(),
  question: z.string().optional(),
  answerOutline: z.string().optional(),
});

@Injectable()
export class ReflectAndDecideNode {
  private readonly logger = new Logger(ReflectAndDecideNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<ReactGraphConfigValues>
  ): Promise<Partial<ReactGraphStateValues>> {
    const graphSettings: ReactGraphSettings =
      (config?.configurable?.graphSettings as ReactGraphSettings) || {};

    // Use node-specific config from graphSettings (new format)
    const reflectAndDecideConfig = graphSettings.reflectAndDecide || {};
    const reflectorModelId =
      reflectAndDecideConfig.model || ENV_CONFIG.llm.defaultModelId;
    const reflectorTemperature = reflectAndDecideConfig.temperature ?? 0.4;
    const reflectorMaxTokens = reflectAndDecideConfig.maxTokens;

    const reflectorModel = await this.modelInitializer.initializeChatModel({
      modelId: reflectorModelId,
      temperature: reflectorTemperature,
      maxTokens: reflectorMaxTokens,
    });

    const structuredReflector = reflectorModel.withStructuredOutput(
      ReflectionDecisionSchema,
      {
        name: "react_reflect_decision",
        includeRaw: true,
      }
    );

    const prompt = this.buildReflectionPrompt(state, reflectAndDecideConfig);
    let decision: ReflectionDecision | null = null;

    try {
      const structuredDecision = (await structuredReflector.invoke(
        [new SystemMessage(prompt.system), new HumanMessage(prompt.human)],
        config
      )) as { parsed?: z.infer<typeof ReflectionDecisionSchema> };

      const parsed = structuredDecision?.parsed;

      if (parsed) {
        const previousEvidence = state.evidence ?? "";
        const candidateEvidence = (parsed.updatedEvidence ?? "").trim();
        const mergedEvidence =
          candidateEvidence.length > 0 ? candidateEvidence : previousEvidence;

        decision = {
          decision: parsed.decision,
          updatedEvidence: mergedEvidence,
          confidence: parsed.confidence ?? 0.5,
          rationale: parsed.rationale,
          question: parsed.question,
          answerOutline: parsed.answerOutline,
        };
      }
    } catch (error) {
      this.logger.error("Reflection LLM call failed:", error);
      decision = null;
    }

    if (!decision) {
      decision = {
        decision: NextAction.ANSWER,
        updatedEvidence: state.evidence || "",
        confidence: 0.4,
        rationale: "Fallback because reflection failed",
        answerOutline:
          "Summarise the gathered evidence and note any missing context for the user.",
      };
    }

    const updates: Partial<ReactGraphStateValues> = {
      reflection: decision,
      evidence: decision.updatedEvidence ?? state.evidence ?? "",
      diagnostics: {
        loop: {
          ...(state.diagnostics?.loop ?? {}),
          iterations: state.diagnostics?.loop?.iterations ?? state.step ?? 0,
        },
      },
    };

    switch (decision.decision) {
      case "continue": {
        updates.plan = null;
        updates.nextAction = NextAction.PLAN;
        updates.loopStatus = "active";
        updates.stepNarrative = {
          doing: "Synthesized evidence and decided to continue",
          next: "Plan next tool call(s)",
        };
        updates.activityLog = [
          {
            phase: "reflect",
            summary: "Decision: continue",
            timestamp: new Date().toISOString(),
            details: {
              confidence: decision.confidence,
              rationale: decision.rationale,
              evidence: decision.updatedEvidence,
            },
          },
        ];
        break;
      }
      case NextAction.CLARIFY: {
        const plan: ClarifyPlanAction = {
          type: NextAction.CLARIFY,
          question:
            decision.question ||
            "What specific detail should I clarify before continuing?",
          rationale:
            decision.rationale ||
            "Reflection determined user input is required before continuing.",
        };
        updates.plan = plan;
        updates.nextAction = NextAction.CLARIFY;
        updates.loopStatus = "completed";
        updates.stepNarrative = {
          doing: "Reflection identified ambiguity requiring user input",
          next: "Ask a clarification question",
        };
        updates.activityLog = [
          {
            phase: "reflect",
            summary: "Decision: clarify",
            timestamp: new Date().toISOString(),
            details: {
              confidence: decision.confidence,
              rationale: decision.rationale,
              question: plan.question,
              evidence: decision.updatedEvidence,
            },
          },
        ];
        break;
      }
      case NextAction.ANSWER:
      default: {
        const plan: AnswerPlanAction = {
          type: NextAction.ANSWER,
          answer:
            decision.answerOutline ||
            "Provide a structured answer with citations from gathered evidence.",
          confidence: decision.confidence ?? 0.5,
          rationale:
            decision.rationale ||
            "Reflection determined evidence suffices for a final answer.",
        };
        updates.plan = plan;
        updates.nextAction = NextAction.ANSWER;
        updates.loopStatus = "completed";
        updates.stepNarrative = {
          doing: "Reflection: evidence sufficient for final answer",
          next: "Generate final answer",
        };
        updates.activityLog = [
          {
            phase: "reflect",
            summary: "Decision: answer",
            timestamp: new Date().toISOString(),
            details: {
              confidence: plan.confidence,
              rationale: decision.rationale,
              evidence: decision.updatedEvidence,
              outline: plan.answer,
            },
          },
        ];
        break;
      }
    }

    return updates;
  }

  private buildReflectionPrompt(
    state: ReactGraphStateValues,
    config: ReflectAndDecideConfig = {}
  ) {
    const latest = state.latestObservation;
    const workingSummary = this.formatWorkingMemory(state);
    const latestSummary = latest
      ? `${latest.tool} => ${
          latest.observation.summary ||
          latest.observation.error ||
          "(no summary)"
        }`
      : "No tool executed in this iteration.";

    const system =
      config.systemPrompt ||
      "You are a reflection node in a ReAct system. Analyze evidence and decide next actions.";

    const human = `# Analysis Context
**User Query**: "${state.query}"
**Current Evidence**: ${state.evidence || "(none accumulated yet)"}
**Latest Tool Result**: ${latestSummary}
**Step Budget**: ${(state.stepBudget ?? 6) - (state.step ?? 0)} remaining

# Working Memory Summary
${workingSummary}

# Your Task
Analyze the current state and decide the next action. Consider:
1. Is the evidence sufficient to provide a comprehensive answer?
2. Are there critical information gaps that available tools could fill?
3. Does the user need to clarify their request?

# Required Response Format
Respond with valid JSON only:

\`\`\`json
{
  "decision": "continue|answer|clarify",
  "updatedEvidence": "Synthesized evidence summary with latest findings",
  "confidence": 0.85,
  "rationale": "Clear explanation for your decision",
  "answerOutline": "Brief outline if choosing answer",
  "question": "Specific question if choosing clarify"
}
\`\`\`

# Decision Criteria
- **continue**: Choose when more tool execution would significantly improve answer quality
- **answer**: Choose when current evidence provides sufficient basis for comprehensive response
- **clarify**: Choose only when user input is essential to proceed (rare)`;

    return { system, human };
  }

  private formatWorkingMemory(state: ReactGraphStateValues): string {
    if (!state.workingMemory?.length) {
      return "(empty)";
    }
    return state.workingMemory
      .slice(-3)
      .map(entry => {
        const status = entry.observation.success ? "success" : "failure";
        const detail =
          entry.observation.summary || entry.observation.error || "";
        return `${entry.tool} (${status}) -> ${detail}`;
      })
      .join("\n");
  }
}
