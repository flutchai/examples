import { Annotation } from "@langchain/langgraph";
import {
  UsageRecorder,
  // createUsageRecorderAnnotation, // ❌ DOES NOT EXIST - commented out
} from "@flutchai/flutch-sdk";
import { BaseGraphState } from "@flutchai/flutch-sdk";
import { BaseMessage } from "@langchain/core/messages";
import { GraphExecutionTracer } from "../utils/graph-execution-tracing";

/** Workflow step tracking for support agents */
export type WorkflowStep =
  | "query_transformation"
  | "conversation_router"
  | "authoritative_agent"
  | "exploratory_agent"
  | "escalation_agent"
  | "response_orchestrator"
  | "stream_processor"
  | "finalized"
  | "error"
  | "completed";

/** Agent types in the system */
export type AgentType =
  | "authoritative"
  | "exploratory"
  | "escalation"
  | "unknown"
  | "finalization"
  | "fallback";

/** Query classification types */
export type QueryType =
  | "documentation_query"
  | "exploratory_query"
  | "unclear_query"
  | "critical_query";

/** User context for support workflow */
export interface UserContext {
  expertiseLevel?: "beginner" | "intermediate" | "expert";
  technicalBackground?: string[];
  communicationStyle?: "formal" | "balanced" | "informal";
  interests?: string[];
  previousQueries?: string[];
  learningGoals?: string[];
}

/** Input data for the support workflow */
export interface SupportWorkflowInput {
  userId: string;
  query: string;
  context?: string | UserContext;
  priority?: "low" | "medium" | "high" | "critical";
  language?: string;
  sessionId?: string;
  // Added for query transformation (TS requirement)
  normalizedQuery?: string;
  enhancedQuery?: string;
}

/** Workflow progress tracking */
export interface SupportWorkflowProgress {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  selectedAgent: AgentType | null;
  hasErrors: boolean;
  errorMessages: string[];
  startedAt: string;
  completedAt?: string;
  iterations: number;
  maxIterations: number;
}

/** Router decision output */
export interface RouterDecision {
  selectedAgent: AgentType;
  queryType: QueryType;
  confidence: number;
  reasoning: string;
  extractedIntent: string;
  keyTopics: string[];
  estimatedComplexity: "simple" | "medium" | "complex";
  requiresEscalation: boolean;
}

/** CoRAG retrieval results */
export interface CoRAGResults {
  iteration: number;
  query: string;
  retrievedDocs: Array<{
    content: string;
    source: string;
    score: number;
    metadata: Record<string, any>;
  }>;
  rerankedDocs?: Array<{
    content: string;
    source: string;
    score: number;
    rerankScore: number;
    metadata: Record<string, any>;
  }>;
  totalDocs: number;
  nextQuery?: string;
  isComplete: boolean;
}

/** Agent response with reflection */
export interface AgentResponse {
  content: string;
  confidence: number;
  sources: string[];
  reasoning: string;
  followUpQuestions?: string[];
  reflection?: {
    qualityScore: number;
    completeness: number;
    accuracy: number;
    improvements: string[];
  };
  metadata: Record<string, any>;
}

/** Research iteration state */
export interface ResearchIteration {
  iteration: number;
  query: string;
  results: CoRAGResults;
  synthesis: string;
  nextAction: "continue" | "complete" | "escalate";
  reasoning: string;
}

/** Additional interfaces for Technical Specification compliance */

/** FAQ search results */
export interface FAQResult {
  id: string;
  question: string;
  answer: string;
  score: number;
  category: string;
  metadata: Record<string, any>;
}

/** RAG search results */
export interface RAGResult {
  id: string;
  content: string;
  source: string;
  score: number;
  metadata: Record<string, any>;
}

/** CoRAG context from iterative search */
export interface CoRAGContext {
  iteration: number;
  query: string;
  documents: Array<{
    content: string;
    source: string;
    score: number;
    metadata: Record<string, any>;
  }>;
  adequacyScore: number;
  informationGaps: string[];
  nextQueryRationale: string;
}

/** Document results from official sources */
export interface DocResult {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
  lastUpdated: string;
  score: number;
  metadata: Record<string, any>;
}

/** Reranked search results */
export interface RerankedResult {
  document: {
    content: string;
    source: string;
    metadata: Record<string, any>;
  };
  originalScore: number;
  semanticScore: number;
  contextualScore: number;
  freshnessScore: number;
  finalScore: number;
  rankingRationale: string;
}

/** Intent analysis results */
export interface IntentAnalysis {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  complexity: "simple" | "medium" | "complex";
  queryType: QueryType;
}

/** Synthesis results for complex queries */
export interface SynthesisResult {
  synthesizedContent: string;
  sourceDocuments: string[];
  synthesisStrategy: "hierarchical" | "flat";
  confidence: number;
  keyPoints: string[];
  reasoning: string;
}

/** Validation issue details */
export interface ValidationIssue {
  type: "error" | "warning" | "info" | "suggestion";
  category: string;
  message: string;
  severity: "high" | "medium" | "low" | "critical";
  suggestedFix?: string;
}

/** Validation results for quality checking */
export interface ValidationResult {
  passed: boolean;
  isValid?: boolean;
  qualityScore: number;
  completenessScore: number;
  accuracyScore: number;
  issues: (ValidationIssue | string)[];
  improvements: string[];
  reasoning: string;
  validationSummary?: string;
  qualityMetrics?: {
    completeness: number;
    accuracy: number;
    relevance: number;
    clarity: number;
    tone: number;
    security?: number;
    overall?: number;
  };
}

/** Response metadata */
export interface ResponseMetadata {
  sources: string[];
  confidence: number;
  agentUsed: string;
  processingTime: number;
  citationRequired: boolean;
  relatedDocuments: string[];
}

/** Suggested actions for users */
export interface SuggestedAction {
  type: "link" | "search" | "contact" | "documentation";
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
  category?: string;
  url?: string;
}

/** Related topics for further exploration */
export interface RelatedTopic {
  title: string;
  description: string;
  searchQuery: string;
  category: string;
  relevanceScore?: number;
  topic?: string;
  url?: string;
}

/** Stream chunks for streaming responses */
export interface StreamChunk {
  content: string;
  index: number;
  isLast: boolean;
  timestamp: number;
  metadata?: {
    chunkType?: "text" | "code" | "list" | "heading";
    enhancement?: string;
    delay?: number;
  };
}

/** Enhancement data for progressive enhancement */
export interface EnhancementData {
  originalChunks: StreamChunk[];
  enhancedChunks: StreamChunk[];
  enhancementApplied: boolean;
  enhancementType: "formatting" | "examples" | "links" | "clarification";
}

/** Streaming progress tracking */
export interface StreamProgress {
  totalChunks: number;
  currentChunk: number;
  bytesStreamed: number;
  totalBytes: number;
  startTime: number;
  estimatedTimeRemaining?: number;
  speed: "slow" | "medium" | "fast";
}

/** Decomposed query for complex queries */
export interface DecomposedQuery {
  id: string;
  originalQuery: string;
  subQuery: string;
  intent: string;
  dependencies: string[];
  complexity: number;
  order: number;
  strategy: "simple" | "parallel" | "sequential" | "hybrid";
  priority?: number;
  searchHints?: string[];
  expectedResultType?:
    | "direct_answer"
    | "documentation"
    | "code_example"
    | "tutorial"
    | "troubleshooting"
    | "comparison";
}

/** Complete support workflow state according to Technical Specification */
export interface SupportWorkflowState extends BaseGraphState {
  // === MAIN DATA ===
  input: SupportWorkflowInput;
  progress: SupportWorkflowProgress;

  // === SEARCH RESULTS ===
  faqResults?: FAQResult[];
  ragResults?: RAGResult[];
  coragResults?: CoRAGResults[];
  coragContext?: CoRAGContext[];
  officialDocResults?: DocResult[];
  rerankedResults?: RerankedResult[];

  // === AGENT INFORMATION ===
  routerDecision?: RouterDecision;
  agentResponse?: AgentResponse;
  intentAnalysis?: IntentAnalysis;

  // === QUERY DECOMPOSITION (for ExploratoryAgent) ===
  decomposedQueries?: DecomposedQuery[];
  synthesisResult?: SynthesisResult;

  // === QUALITY AND VALIDATION ===
  qualityScore?: number;
  validationResult?: ValidationResult;

  // === ESCALATION ===
  escalationReason?: string;
  clarifyingQuestions?: string[];
  alternativeSuggestions?: string[];
  humanEscalationFlag?: boolean;

  // === ENRICHMENT (from ResponseOrchestrator) ===
  enhancedResponse?: string;
  responseMetadata?: ResponseMetadata;
  suggestedActions?: SuggestedAction[];
  relatedTopics?: RelatedTopic[];

  // === STREAMING (from StreamProcessor) ===
  streamChunks?: StreamChunk[];
  enhancementData?: EnhancementData;
  streamingProgress?: StreamProgress;

  // === FINAL RESPONSE ===
  finalResponse?: {
    content: string;
    sources: string[];
    confidence: number;
    agentUsed: AgentType;
    processingTime: number;
    metadata: Record<string, any>;
  };
  output?: {
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
    streaming?: boolean;
  };
  metadata: Record<string, any>;
  usageRecorder: UsageRecorder;
  executionTracer: GraphExecutionTracer;
}

/** Utility functions for workflow state management */
export class SupportWorkflowStateUtils {
  static createInitialState(input: SupportWorkflowInput): SupportWorkflowState {
    return {
      input: {
        ...input,
        priority: input.priority || "medium",
        language: input.language || "en",
        sessionId: input.sessionId || `session-${Date.now()}`,
      },
      progress: {
        currentStep: "conversation_router",
        completedSteps: [],
        selectedAgent: null,
        hasErrors: false,
        errorMessages: [],
        startedAt: new Date().toISOString(),
        iterations: 0,
        maxIterations: 5,
      },
      metadata: {},
      usageRecorder: new UsageRecorder(),
      executionTracer: new GraphExecutionTracer(),
    };
  }

  static advanceStep(
    state: SupportWorkflowState,
    nextStep: WorkflowStep
  ): Partial<SupportWorkflowState> {
    const completed = state.progress.completedSteps.includes(
      state.progress.currentStep
    )
      ? state.progress.completedSteps
      : [...state.progress.completedSteps, state.progress.currentStep];

    return {
      progress: {
        ...state.progress,
        currentStep: nextStep,
        completedSteps: completed,
      },
    };
  }

  static addError(
    state: SupportWorkflowState,
    error: string
  ): Partial<SupportWorkflowState> {
    return {
      progress: {
        ...state.progress,
        hasErrors: true,
        errorMessages: [...state.progress.errorMessages, error],
      },
    };
  }

  static markCompleted(
    state: SupportWorkflowState
  ): Partial<SupportWorkflowState> {
    return {
      progress: {
        ...state.progress,
        currentStep: "completed",
        completedAt: new Date().toISOString(),
      },
    };
  }

  static updateMetadata(
    state: SupportWorkflowState,
    updates: Record<string, any>
  ): Partial<SupportWorkflowState> {
    return {
      metadata: { ...state.metadata, ...updates },
    };
  }

  static incrementIteration(
    state: SupportWorkflowState
  ): Partial<SupportWorkflowState> {
    return {
      progress: {
        ...state.progress,
        iterations: state.progress.iterations + 1,
      },
    };
  }
}

/**
 * LangGraph Annotation state definition for support workflow coordination (Updated for TS)
 */
export const SupportWorkflowStateAnnotation = Annotation.Root({
  input: Annotation<SupportWorkflowInput>({
    reducer: (_, next) => next,
    default: () => ({
      userId: "",
      query: "",
      priority: "medium",
      language: "en",
    }),
  }),

  progress: Annotation<SupportWorkflowProgress>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({
      currentStep: "conversation_router",
      completedSteps: [],
      selectedAgent: null,
      hasErrors: false,
      errorMessages: [],
      startedAt: new Date().toISOString(),
      iterations: 0,
      maxIterations: 5,
    }),
  }),

  routerDecision: Annotation<RouterDecision>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  coragResults: Annotation<CoRAGResults[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  researchIterations: Annotation<ResearchIteration[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  agentResponse: Annotation<AgentResponse>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  finalResponse: Annotation<{
    content: string;
    sources: string[];
    confidence: number;
    agentUsed: AgentType;
    processingTime: number;
    metadata: Record<string, any>;
  }>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  output: Annotation<{
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
    streaming?: boolean;
  }>({
    reducer: (state, update) => update || state,
    default: () => ({ text: "", attachments: [], metadata: {} }),
  }),

  // Generation field for service mesh streaming support
  generation: Annotation<{
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
  }>({
    reducer: (state, update) => update || state,
    default: () => undefined,
  }),

  // ResponseOrchestrator routing decision
  orchestratorDecision: Annotation<"response" | "clarify" | "escalate">({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Clarification attempts counter
  clarificationAttempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  metadata: Annotation<Record<string, any>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),

  // ❌ createUsageRecorderAnnotation does not exist - using standard Annotation
  usageRecorder: Annotation<UsageRecorder>({
    reducer: (prev, next) => next ?? prev,
    default: () => new UsageRecorder(),
  }),

  executionTracer: Annotation<GraphExecutionTracer>({
    reducer: (prev, next) => next ?? prev,
    default: () => new GraphExecutionTracer(),
  }),

  // Message history for context-aware conversations
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  // Current streaming state
  isStreaming: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Agent thinking/processing indicators
  currentThought: Annotation<string>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // === NEW FIELDS FROM TECHNICAL SPECIFICATION ===

  // FAQ and RAG results
  faqResults: Annotation<FAQResult[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  ragResults: Annotation<RAGResult[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  coragContext: Annotation<CoRAGContext[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  officialDocResults: Annotation<DocResult[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  rerankedResults: Annotation<RerankedResult[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  // Intent analysis
  intentAnalysis: Annotation<IntentAnalysis>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Exploratory agent fields
  decomposedQueries: Annotation<DecomposedQuery[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  synthesisResult: Annotation<SynthesisResult>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Quality and validation
  qualityScore: Annotation<number>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  validationResult: Annotation<ValidationResult>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Escalation fields
  escalationReason: Annotation<string>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  clarifyingQuestions: Annotation<string[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  alternativeSuggestions: Annotation<string[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  humanEscalationFlag: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // ResponseOrchestrator fields
  enhancedResponse: Annotation<string>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  responseMetadata: Annotation<ResponseMetadata>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  suggestedActions: Annotation<SuggestedAction[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  relatedTopics: Annotation<RelatedTopic[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  // StreamProcessor fields
  streamChunks: Annotation<StreamChunk[]>({
    reducer: (state, update) => update || state,
    default: () => [],
  }),

  enhancementData: Annotation<EnhancementData>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  streamingProgress: Annotation<StreamProgress>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Query transformation fields (per TS requirement)
  normalizedQuestion: Annotation<string>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  enhancedQuery: Annotation<string>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type SupportWorkflowStateValues =
  typeof SupportWorkflowStateAnnotation.State;

/** Configuration values for the Support Workflow */
export {
  SupportWorkflowConfigValues,
  AgenticSupportConfig,
  AgenticSupportRuntimeConfig,
  LLMConfig,
} from "./graph.config";
