/**
 * Configuration types for Agentic Support Graph 2025
 * These types define the runtime structure of configuration data
 * that matches the manifest schema but provides TypeScript typing
 */

/** LLM Model configuration (runtime) */
export interface LLMConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

/** Query Decomposer Settings */
export interface QueryDecomposerSettings {
  maxSubQueries?: number;
  complexityThreshold?: number;
  enableDependencyAnalysis?: boolean;
  minSubQueryLength?: number;
}

/** CoRAG Retrieval Settings */
export interface CoRAGRetrievalSettings {
  maxIterations?: number;
  adequacyThreshold?: number;
  diversityWeight?: number;
  rerankingEnabled?: boolean;
  topK?: number;
}

/** Knowledge Reranker Settings */
export interface KnowledgeRerankerSettings {
  model?: string; // This will be resolved from modelSelect
  semanticWeight?: number;
  contextualWeight?: number;
  freshnessWeight?: number;
  topK?: number;
}

/** Reflection Validator Settings */
export interface ReflectionValidatorSettings {
  enableFactChecking?: boolean;
  enableToneAnalysis?: boolean;
  enableSecurityCheck?: boolean;
  enableCompletenessCheck?: boolean;
  minQualityScore?: number;
  strictMode?: boolean;
}

// Manifest-stage configs (as defined in graph.manifest.json)
export interface RouterConfigManifest {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface BaseAgentConfigManifest {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AuthoritativeAgentConfigManifest
  extends BaseAgentConfigManifest {
  coragRetrieval?: CoRAGRetrievalSettings;
  knowledgeReranker?: KnowledgeRerankerSettings;
}

export interface ResearchAgentConfigManifest extends BaseAgentConfigManifest {
  reflectionTemperature?: number;
  reflectionPrompt?: string;
  queryDecomposer?: QueryDecomposerSettings;
  coragRetrieval?: CoRAGRetrievalSettings;
  knowledgeReranker?: KnowledgeRerankerSettings;
  reflectionValidator?: ReflectionValidatorSettings;
}

export interface EscalationAgentConfigManifest extends BaseAgentConfigManifest {
  empathyTemperature?: number;
  analysisPrompt?: string;
  clarificationPrompt?: string;
  criticalIssuePrompt?: string;
  empathyPrompt?: string;
  technicalFailurePrompt?: string;
  complexCasePrompt?: string;
}

export interface ResponseOrchestratorConfigManifest {
  chunkSize?: number;
}

export interface OutputStreamProcessorConfigManifest {
  chunkSize?: number;
  delay?: number;
  speed?: "slow" | "medium" | "fast";
  enableEnhancement?: boolean;
}

export interface QueryTransformationConfigManifest
  extends BaseAgentConfigManifest {
  contextExpansion?: {
    enabled?: boolean;
    maxHistoryMessages?: number;
    includeUserContext?: boolean;
  };
  entityExtraction?: {
    enabled?: boolean;
    minConfidence?: number;
  };
}

/** Main configuration interface (manifest) grouped by process/stage */
export interface AgenticSupportConfig {
  queryTransformation?: QueryTransformationConfigManifest;
  conversationRouter?: RouterConfigManifest;
  authoritativeAgent?: AuthoritativeAgentConfigManifest;
  researchAgent?: ResearchAgentConfigManifest;
  escalationAgent?: EscalationAgentConfigManifest;
  responseOrchestrator?: ResponseOrchestratorConfigManifest;
  outputStreamProcessor?: OutputStreamProcessorConfigManifest;
  outputAgentResponse?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  clarifyEscalate?: {
    llm?: {
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
    };
    max_clarification_attempts?: number;
    clarificationPrompt?: string;
    escalationPrompt?: string;
  };
}

/** Runtime configuration with resolved model IDs - supports both legacy and new formats */
export interface AgenticSupportRuntimeConfig {
  // Agent LLM configs with resolved model IDs
  queryTransformation?: {
    llm?: LLMConfig;
    // New JSON schema format support
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    contextExpansion?: {
      enabled?: boolean;
      maxHistoryMessages?: number;
      includeUserContext?: boolean;
    };
    entityExtraction?: {
      enabled?: boolean;
      minConfidence?: number;
    };
  };
  conversationRouter: {
    llmConfig?: LLMConfig; // Legacy format
    // New JSON schema format support
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  authoritativeAgent: {
    llmConfig?: LLMConfig; // Legacy format
    // New JSON schema format support
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    coragRetrieval?: CoRAGRetrievalSettings;
    knowledgeReranker?: KnowledgeRerankerSettings;
  };
  researchAgent: {
    llmConfig?: LLMConfig; // Legacy format
    reflectionLlmConfig?: LLMConfig;
    // New JSON schema format support
    model?: string;
    temperature?: number;
    maxTokens?: number;
    reflectionTemperature?: number;
    systemPrompt?: string;
    reflectionPrompt?: string;
    queryDecomposer?: QueryDecomposerSettings;
    coragRetrieval?: CoRAGRetrievalSettings;
    knowledgeReranker?: KnowledgeRerankerSettings;
    reflectionValidator?: ReflectionValidatorSettings;
  };
  escalationAgent: {
    llmConfig?: LLMConfig; // Legacy format
    empathyLlmConfig?: LLMConfig;
    // New JSON schema format support
    model?: string;
    temperature?: number;
    maxTokens?: number;
    empathyTemperature?: number;
    analysisPrompt?: string;
    clarificationPrompt?: string;
    criticalIssuePrompt?: string;
    empathyPrompt?: string;
    technicalFailurePrompt?: string;
    complexCasePrompt?: string;
  };
  responseOrchestrator?: {
    chunkSize?: number;
  };
  outputStreamProcessor?: {
    chunkSize?: number;
    delay?: number;
    speed?: "slow" | "medium" | "fast";
    enableEnhancement?: boolean;
  };
  outputAgentResponse?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  clarifyEscalate?: {
    llm?: {
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
    };
    max_clarification_attempts?: number;
    clarificationPrompt?: string;
    escalationPrompt?: string;
  };
  // General settings
  // Streaming is always enabled
}

/** Type for the configurable field in LangGraph config */
export interface SupportWorkflowConfigValues {
  graphSettings?: AgenticSupportRuntimeConfig;
  // Legacy compatibility
  userId?: string;
  sessionId?: string;
    channel?: string;
}
