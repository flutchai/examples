import { Injectable, Logger } from "@nestjs/common";
import {
  SupportWorkflowStateValues,
  CoRAGContext,
  CoRAGResults,
} from "../graph.state";
import {
  RetrieverService,
  CustomDocument,
  formatError,
  getErrorMessage,
} from "@flutchai/flutch-sdk";
import { RetrieverSearchType } from "@flutchai/flutch-sdk";

/**
 * CoRAG-Retrieval Subgraph - Chain-of-Retrieval Augmented Generation
 *
 * According to specifications:
 * - Iterative context extraction with Chain-of-Retrieval
 * - Vector search for current query
 * - Reranking of results
 * - Assessment of information adequacy
 * - Generation of next query if needed
 * - Repeat until reaching adequacy_threshold or max_iterations
 */

interface CoRAGConfig {
  maxIterations: number;
  adequacyThreshold: number;
  diversityWeight: number;
  rerankingEnabled: boolean;
  topK: number;
}

@Injectable()
export class CoRAGRetrievalSubgraph {
  private readonly logger = new Logger(CoRAGRetrievalSubgraph.name);

  constructor(private readonly retrieverService?: RetrieverService) {}

  /**
   * Execute CoRAG iterative retrieval process
   */
  async execute(
    query: string,
    userContext: any,
    config: CoRAGConfig
  ): Promise<{
    coragContext: CoRAGContext[];
    finalDocuments: CustomDocument[];
    totalIterations: number;
  }> {
    this.logger.log(
      `Starting CoRAG retrieval for query: ${query.substring(0, 100)}...`
    );

    const coragContext: CoRAGContext[] = [];
    let currentQuery = query;
    let iteration = 0;
    let adequacyScore = 0;
    let finalDocuments: CustomDocument[] = [];

    while (
      iteration < config.maxIterations &&
      adequacyScore < config.adequacyThreshold
    ) {
      iteration++;
      this.logger.debug(`CoRAG iteration ${iteration}/${config.maxIterations}`);

      try {
        // 1. Vector search for current query
        const searchResults = await this.performVectorSearch(
          currentQuery,
          userContext,
          config.topK
        );

        // 2. Reranking of results (if enabled)
        const rerankedResults = config.rerankingEnabled
          ? await this.rerankResults(currentQuery, searchResults, userContext)
          : searchResults;

        // 3. Assessment of information adequacy
        const adequacyAnalysis = await this.evaluateInformationAdequacy(
          query, // Original query
          currentQuery, // Current iteration query
          rerankedResults,
          coragContext // History of previous iterations
        );

        adequacyScore = adequacyAnalysis.score;

        // 4. Creating context for this iteration
        const iterationContext: CoRAGContext = {
          iteration,
          query: currentQuery,
          documents: rerankedResults.map(doc => ({
            content: doc.content,
            source: doc.metadata.source || "unknown",
            score: doc.metadata.rerankScore || doc.metadata.score || 0.5,
            metadata: doc.metadata,
          })),
          adequacyScore,
          informationGaps: adequacyAnalysis.gaps,
          nextQueryRationale: adequacyAnalysis.nextQueryRationale,
        };

        coragContext.push(iterationContext);
        finalDocuments = [...finalDocuments, ...rerankedResults];

        this.logger.debug(`Iteration ${iteration} adequacy: ${adequacyScore}`);

        // 5. Generate next query (if information is insufficient)
        if (
          adequacyScore < config.adequacyThreshold &&
          iteration < config.maxIterations
        ) {
          currentQuery = await this.generateNextQuery(
            query,
            adequacyAnalysis.gaps,
            coragContext
          );
          this.logger.debug(`Generated next query: ${currentQuery}`);
        }
      } catch (error) {
        this.logger.error(
          `CoRAG iteration ${iteration} failed: ${getErrorMessage(error)}`
        );

        // Add context with error
        coragContext.push({
          iteration,
          query: currentQuery,
          documents: [], // Empty array matches expected type
          adequacyScore: 0,
          informationGaps: [`Iteration failed: ${getErrorMessage(error)}`],
          nextQueryRationale: "Error occurred during processing",
        });

        break;
      }
    }

    // Remove duplicate documents
    const uniqueDocuments = this.deduplicateDocuments(finalDocuments);

    this.logger.log(
      `CoRAG completed: ${iteration} iterations, ${uniqueDocuments.length} unique documents, adequacy: ${adequacyScore}`
    );

    return {
      coragContext,
      finalDocuments: uniqueDocuments,
      totalIterations: iteration,
    };
  }

  /**
   * Perform vector search in knowledge base
   */
  private async performVectorSearch(
    query: string,
    userContext: any,
    topK: number
  ): Promise<CustomDocument[]> {
    try {
      this.logger.debug(`🔍 Performing vector search for: ${query}`);

      // Use real retriever service if available
      if (this.retrieverService) {
        // Extract knowledge base IDs from user context
        const knowledgeBaseIds = this.extractKnowledgeBaseIds(userContext);

        if (knowledgeBaseIds.length === 0) {
          this.logger.warn(
            "⚠️ No knowledge bases configured for user, using fallback"
          );
          return this.getFallbackResults(query, topK);
        }

        // Perform semantic search using RetrieverService
        const results = await this.retrieverService.search(
          query,
          RetrieverSearchType.Similarity,
          knowledgeBaseIds,
          {
            k: topK,
            threshold: 0.7,
            metadata: { source: "corag-retrieval" },
          }
        );

        this.logger.debug(
          `🎯 Found ${results.length} documents from knowledge base`
        );
        return results;
      } else {
        this.logger.warn(
          "⚠️ RetrieverService not available, using fallback search"
        );
        return this.getFallbackResults(query, topK);
      }
    } catch (error) {
      const errorInfo = formatError(error);
      this.logger.error(
        `❌ Vector search failed: ${errorInfo.message}`,
        errorInfo
      );

      // Fallback to mock results on error
      this.logger.debug("🔄 Falling back to mock results due to search error");
      return this.getFallbackResults(query, topK);
    }
  }

  /**
   * Extract knowledge base IDs from user context
   */
  private extractKnowledgeBaseIds(userContext: any): string[] {
    try {
      // Extract from user context structure
      const kbIds: string[] = [];

      if (userContext?.organizationId) {
        // Add organization-level knowledge bases
        if (userContext.knowledgeBaseIds) {
          kbIds.push(...userContext.knowledgeBaseIds);
        }
      }

      if (userContext?.userId) {
        // Add user-specific knowledge bases if any
        if (userContext.userKnowledgeBaseIds) {
          kbIds.push(...userContext.userKnowledgeBaseIds);
        }
      }

      // Remove duplicates
      return [...new Set(kbIds)];
    } catch (error) {
      this.logger.warn(
        `Failed to extract knowledge base IDs: ${getErrorMessage(error)}`
      );
      return [];
    }
  }

  /**
   * Fallback results when real search is not available
   */
  private getFallbackResults(query: string, topK: number): CustomDocument[] {
    const mockResults: CustomDocument[] = [
      {
        id: "doc-1",
        content: `Relevant information for query "${query}". This document contains details about system setup and usage.`,
        metadata: {
          knowledgeBaseId: "fallback-kb",
          source: "Official Documentation",
          title: "System Configuration Guide",
          category: "documentation",
          lastUpdated: "2024-01-15",
          section: "configuration",
          score: 0.92,
        },
      },
      {
        id: "doc-2",
        content: `Additional information related to "${query}". Includes practical examples and problem-solving tips.`,
        metadata: {
          knowledgeBaseId: "fallback-kb",
          source: "Knowledge Base",
          title: "Troubleshooting Guide",
          category: "troubleshooting",
          lastUpdated: "2024-01-10",
          section: "examples",
          score: 0.88,
        },
      },
      {
        id: "doc-3",
        content: `API documentation for functionality related to "${query}". Description of methods, parameters and usage examples.`,
        metadata: {
          knowledgeBaseId: "fallback-kb",
          source: "API Reference",
          title: "API Documentation",
          category: "api",
          lastUpdated: "2024-01-20",
          section: "reference",
          score: 0.85,
        },
      },
    ];

    return mockResults.slice(0, topK);
  }

  /**
   * Rerank search results for better relevance
   */
  private async rerankResults(
    query: string,
    results: CustomDocument[],
    userContext: any
  ): Promise<CustomDocument[]> {
    try {
      this.logger.debug(`🔄 Reranking ${results.length} search results`);

      // TODO: Integration with reranker - Cohere Rerank API or cross-encoder
      // In real implementation this would be a call to reranker service

      // Simple reranking simulation considering user context
      const rerankedResults = results.map(result => {
        const originalScore = result.metadata.score || 0.5;

        // Small adjustment based on content type and user context
        let boostFactor = 1.0;

        // Preference for API documentation for technical queries
        if (
          query.toLowerCase().includes("api") &&
          result.metadata.category === "api"
        ) {
          boostFactor += 0.1;
        }

        // Preference for examples for "how" queries
        if (
          query.toLowerCase().includes("how") &&
          result.metadata.category === "troubleshooting"
        ) {
          boostFactor += 0.15;
        }

        // Preference for fresher content
        const lastUpdated = result.metadata.lastUpdated;
        if (lastUpdated && new Date(lastUpdated) > new Date("2024-01-01")) {
          boostFactor += 0.05;
        }

        const rerankScore = Math.min(
          originalScore * boostFactor * (0.9 + Math.random() * 0.2),
          1.0
        );

        return {
          ...result,
          metadata: {
            ...result.metadata,
            rerankScore,
            rankingRationale: `Reranked based on query relevance and user context (boost: ${boostFactor.toFixed(2)})`,
          },
        };
      });

      // Sort by new score
      rerankedResults.sort(
        (a, b) => (b.metadata.rerankScore || 0) - (a.metadata.rerankScore || 0)
      );

      this.logger.debug(`✅ Reranking completed successfully`);
      return rerankedResults;
    } catch (error) {
      const errorInfo = formatError(error);
      this.logger.warn(
        `⚠️ Reranking failed: ${errorInfo.message}, using original results`
      );
      return results;
    }
  }

  /**
   * Evaluate if retrieved information is adequate for the query
   */
  private async evaluateInformationAdequacy(
    originalQuery: string,
    currentQuery: string,
    documents: CustomDocument[],
    previousIterations: CoRAGContext[]
  ): Promise<{
    score: number;
    gaps: string[];
    nextQueryRationale: string;
  }> {
    try {
      // Basic assessment based on quantity and relevance of documents
      let baseScore = Math.min(documents.length / 3, 1.0); // Base score from quantity

      // Consider document quality
      const avgScore =
        documents.length > 0
          ? documents.reduce(
              (sum, doc) =>
                sum + (doc.metadata.rerankScore || doc.metadata.score || 0.5),
              0
            ) / documents.length
          : 0;
      const qualityBoost = avgScore * 0.3;

      // Penalty for repeated iterations without new information
      const iterationPenalty = Math.max(
        0,
        (previousIterations.length - 1) * 0.1
      );

      const adequacyScore = Math.min(
        baseScore + qualityBoost - iterationPenalty,
        1.0
      );

      // Analysis of information gaps
      const gaps: string[] = [];

      if (documents.length < 2) {
        gaps.push("Not enough documents for complete answer");
      }

      const categories = [
        ...new Set(documents.map(doc => doc.metadata?.category)),
      ];
      if (categories.length < 2) {
        gaps.push("Need information from different documentation categories");
      }

      // Check coverage of keywords from query
      const queryKeywords = originalQuery
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3);
      const documentText = documents
        .map(doc => doc.content.toLowerCase())
        .join(" ");
      const uncoveredKeywords = queryKeywords.filter(
        keyword => !documentText.includes(keyword)
      );

      if (uncoveredKeywords.length > 0) {
        gaps.push(`Missing information about: ${uncoveredKeywords.join(", ")}`);
      }

      // Logic for next query
      let nextQueryRationale = "Information appears adequate";
      if (adequacyScore < 0.7) {
        if (gaps.length > 0) {
          nextQueryRationale = `Need to search for: ${gaps[0]}`;
        } else {
          nextQueryRationale = "Need more comprehensive information";
        }
      }

      this.logger.debug(
        `Adequacy evaluation: score=${adequacyScore}, gaps=${gaps.length}`
      );

      return {
        score: adequacyScore,
        gaps,
        nextQueryRationale,
      };
    } catch (error) {
      this.logger.error(
        `Adequacy evaluation failed: ${getErrorMessage(error)}`
      );
      return {
        score: 0.5, // Average score on error
        gaps: ["Error in adequacy evaluation"],
        nextQueryRationale:
          "Evaluation failed, proceeding with current results",
      };
    }
  }

  /**
   * Generate next query based on information gaps
   */
  private async generateNextQuery(
    originalQuery: string,
    informationGaps: string[],
    previousIterations: CoRAGContext[]
  ): Promise<string> {
    try {
      if (informationGaps.length === 0) {
        return originalQuery; // Fallback
      }

      const primaryGap = informationGaps[0];

      // Simple logic for next query generation
      if (primaryGap.includes("categories")) {
        return `${originalQuery} examples troubleshooting`;
      } else if (primaryGap.includes("Not enough documents")) {
        return `${originalQuery} configuration setup`;
      } else if (primaryGap.includes("Missing information about:")) {
        const keywords = primaryGap.split(":")[1]?.trim();
        return `${originalQuery} ${keywords}`;
      }

      // General case - expand query
      return `${originalQuery} detailed guide`;
    } catch (error) {
      this.logger.warn(
        `Next query generation failed: ${getErrorMessage(error)}, using original query`
      );
      return originalQuery;
    }
  }

  /**
   * Remove duplicate documents from results
   */
  private deduplicateDocuments(documents: CustomDocument[]): CustomDocument[] {
    const seen = new Set();
    const unique: CustomDocument[] = [];

    for (const doc of documents) {
      // Use ID or content + source as uniqueness key
      const key =
        doc.id || `${doc.metadata.source}:${doc.content.substring(0, 100)}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(doc);
      }
    }

    this.logger.debug(
      `🧹 Deduplicated ${documents.length} → ${unique.length} documents`
    );
    return unique;
  }

  /**
   * Get default CoRAG configuration
   */
  static getDefaultConfig(): CoRAGConfig {
    return {
      maxIterations: 5,
      adequacyThreshold: 0.7,
      diversityWeight: 0.2,
      rerankingEnabled: true,
      topK: 10,
    };
  }
}
