/** Priority levels for support queries */
export enum QueryPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/** Supported languages */
export enum SupportedLanguage {
  RUSSIAN = "ru",
  ENGLISH = "en",
}

/** Knowledge base categories */
export enum KnowledgeCategory {
  API_DOCUMENTATION = "api_docs",
  USER_GUIDES = "user_guides",
  FAQ = "faq",
  TROUBLESHOOTING = "troubleshooting",
  INTEGRATIONS = "integrations",
  BILLING = "billing",
  SECURITY = "security",
  TECHNICAL_SPECS = "technical_specs",
}

/** Document source types */
export enum DocumentSource {
  DOCUMENTATION = "documentation",
  FAQ_DATABASE = "faq_database",
  KNOWLEDGE_BASE = "knowledge_base",
  API_REFERENCE = "api_reference",
  USER_MANUAL = "user_manual",
  CHANGELOG = "changelog",
  COMMUNITY_FORUM = "community_forum",
}

/** Agent confidence levels */
export enum ConfidenceLevel {
  VERY_LOW = 0.0,
  LOW = 0.25,
  MEDIUM = 0.5,
  HIGH = 0.75,
  VERY_HIGH = 1.0,
}

/** CoRAG iteration strategies */
export enum CoRAGStrategy {
  BREADTH_FIRST = "breadth_first",
  DEPTH_FIRST = "depth_first",
  ADAPTIVE = "adaptive",
  FOCUSED = "focused",
}

/** Reranking model types */
export enum RerankingModel {
  COHERE_RERANK = "cohere_rerank",
  CROSS_ENCODER = "cross_encoder",
  SEMANTIC_SIMILARITY = "semantic_similarity",
}

/** Quality metrics for responses */
export interface QualityMetrics {
  completeness: number; // 0-1 scale
  accuracy: number; // 0-1 scale
  relevance: number; // 0-1 scale
  clarity: number; // 0-1 scale
  timeliness: number; // processing time factor
}

/** Streaming response chunk */
export interface StreamingChunk {
  type: "text" | "thought" | "source" | "metadata";
  content: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

/** Vector search configuration */
export interface VectorSearchConfig {
  topK: number;
  threshold: number;
  hybridSearch?: boolean;
  filters?: Record<string, any>;
  enableCoRAG?: boolean;
  enableReranking?: boolean;
}

/** CoRAG configuration */
export interface CoRAGConfig {
  maxIterations: number;
  strategy: CoRAGStrategy;
  convergenceThreshold: number;
  enableReranking: boolean;
  rerankingModel?: RerankingModel;
  contextWindowSize: number;
}

/** Agent configuration */
export interface AgentConfig {
  temperature: number;
  maxTokens: number;
  streamingEnabled: boolean;
  enableReflection: boolean;
  reflectionPrompt?: string;
  systemPrompt: string;
}

/** Error types for the support system */
export enum SupportErrorType {
  QUERY_PARSING_ERROR = "query_parsing_error",
  RETRIEVAL_ERROR = "retrieval_error",
  GENERATION_ERROR = "generation_error",
  RERANKING_ERROR = "reranking_error",
  REFLECTION_ERROR = "reflection_error",
  STREAMING_ERROR = "streaming_error",
  TIMEOUT_ERROR = "timeout_error",
  RATE_LIMIT_ERROR = "rate_limit_error",
}

/** Support system error with context */
export interface SupportError {
  type: SupportErrorType;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  recovery?: string; // recovery suggestion
}

/** Context for support queries */
export interface QueryContext {
  userId: string;
  sessionId: string;
  previousQueries: string[];
  userProfile?: {
    experience: "beginner" | "intermediate" | "expert";
    preferences: Record<string, any>;
    language: SupportedLanguage;
  };
  productContext?: {
    version: string;
    features: string[];
    subscription: string;
  };
}

/** Performance metrics */
export interface PerformanceMetrics {
  totalProcessingTime: number;
  retrievalTime: number;
  generationTime: number;
  rerankingTime?: number;
  reflectionTime?: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  qualityScore: number;
  userSatisfaction?: number;
}
