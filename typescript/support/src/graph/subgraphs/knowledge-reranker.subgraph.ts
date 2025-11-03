import { Injectable, Logger } from "@nestjs/common";
import { RerankedResult } from "../graph.state";
// import { trackApiCall } from "@flutchai/flutch-sdk"; // Uncomment when implementing real Cohere API

/**
 * KnowledgeReranker Subgraph - Intelligent reranking of search results
 *
 * According to specifications:
 * - Semantic reranking via Cohere API or cross-encoder
 * - Contextual assessment considering user profile
 * - Document freshness evaluation by dates
 * - Composite scoring using weighted formula
 * - Ranking rationale explanation
 */

interface RerankingConfig {
  model: "cohere-rerank-v3" | "custom";
  semanticWeight: number;
  contextualWeight: number;
  freshnessWeight: number;
  topK: number;
}

interface SearchResult {
  content: string;
  source: string;
  score: number;
  metadata: Record<string, any>;
}

interface UserProfile {
  expertiseLevel: "beginner" | "intermediate" | "expert";
  technicalBackground: string[];
  preferredLanguage: string;
  recentTopics?: string[];
}

@Injectable()
export class KnowledgeRerankerSubgraph {
  private readonly logger = new Logger(KnowledgeRerankerSubgraph.name);

  constructor() {}

  /**
   * Execute intelligent reranking of search results
   */
  async execute(
    query: string,
    searchResults: SearchResult[],
    userProfile: UserProfile,
    conversationHistory: any[],
    config: RerankingConfig
  ): Promise<RerankedResult[]> {
    this.logger.log(`Starting reranking of ${searchResults.length} results`);

    if (searchResults.length === 0) {
      this.logger.warn("No search results to rerank");
      return [];
    }

    try {
      const rerankedResults: RerankedResult[] = [];

      for (const result of searchResults) {
        // 1. Semantic reranking
        const semanticScore = await this.calculateSemanticScore(
          query,
          result,
          config.model
        );

        // 2. Contextual assessment
        const contextualScore = await this.calculateContextualScore(
          query,
          result,
          userProfile,
          conversationHistory
        );

        // 3. Document freshness evaluation
        const freshnessScore = this.calculateFreshnessScore(result);

        // 4. Composite scoring
        const finalScore = this.calculateCompositeScore(
          semanticScore,
          contextualScore,
          freshnessScore,
          config
        );

        // 5. Ranking rationale
        const rankingRationale = this.generateRankingRationale(
          semanticScore,
          contextualScore,
          freshnessScore,
          finalScore,
          result
        );

        const rerankedResult: RerankedResult = {
          document: {
            content: result.content,
            source: result.source,
            metadata: result.metadata,
          },
          originalScore: result.score,
          semanticScore,
          contextualScore,
          freshnessScore,
          finalScore,
          rankingRationale,
        };

        rerankedResults.push(rerankedResult);
      }

      // Sort by final score
      rerankedResults.sort((a, b) => b.finalScore - a.finalScore);

      // Limit number of results
      const topResults = rerankedResults.slice(0, config.topK);

      this.logger.log(
        `Reranking completed: top score = ${topResults[0]?.finalScore.toFixed(3)}`
      );

      return topResults;
    } catch (error) {
      this.logger.error(`Reranking failed: ${error.message}`, error.stack);

      // Fallback: return original results in RerankedResult format
      return searchResults.map(result => ({
        document: {
          content: result.content,
          source: result.source,
          metadata: result.metadata,
        },
        originalScore: result.score,
        semanticScore: result.score,
        contextualScore: 0.5,
        freshnessScore: 0.5,
        finalScore: result.score,
        rankingRationale: "Fallback: reranking failed, using original score",
      }));
    }
  }

  /**
   * Calculate semantic relevance score
   */
  private async calculateSemanticScore(
    query: string,
    result: SearchResult,
    model: string
  ): Promise<number> {
    try {
      if (model === "cohere-rerank-v3") {
        return await this.cohereSemanticScore(query, result);
      } else {
        return await this.customSemanticScore(query, result);
      }
    } catch (error) {
      this.logger.warn(`Semantic scoring failed: ${error.message}`);
      return result.score; // Fallback to original score
    }
  }

  /**
   * Cohere reranking implementation
   */
  private async cohereSemanticScore(
    query: string,
    result: SearchResult,
    usageRecorder?: any
  ): Promise<number> {
    try {
      // Integration with Cohere Rerank API for document reranking
      // In real implementation this would be a call to Cohere API with trackApiCall:
      //
      // const rerankResponse = await trackApiCall(
      //   usageRecorder,
      //   "knowledgeRerankerNode",
      //   "cohere",
      //   "rerank",
      //   () => this.cohereClient.rerank({
      //     model: 'rerank-english-v3.0',
      //     query: query,
      //     documents: [result.content],
      //     top_k: 1,
      //     return_documents: false
      //   })
      // );
      // return rerankResponse.results[0]?.relevance_score || 0.5;

      this.logger.debug("Using Cohere rerank v3 (simulated)");

      // Simulation of Cohere API
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simple heuristic for semantic scoring simulation
      const queryTerms = query.toLowerCase().split(/\s+/);
      const contentLower = result.content.toLowerCase();

      let matches = 0;
      let totalTerms = queryTerms.length;

      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          matches++;
        }
      }

      const basicMatch = matches / totalTerms;

      // Add "intelligence" for different types of matches
      let semanticBonus = 0;

      // Bonus for exact phrases
      if (contentLower.includes(query.toLowerCase())) {
        semanticBonus += 0.3;
      }

      // Bonus for synonyms (simple heuristic)
      const synonymPairs = [
        ["configuration", "setup"],
        ["error", "problem"],
        ["guide", "manual"],
        ["api", "interface"],
      ];

      for (const [word1, word2] of synonymPairs) {
        if (
          (query.includes(word1) && contentLower.includes(word2)) ||
          (query.includes(word2) && contentLower.includes(word1))
        ) {
          semanticBonus += 0.1;
        }
      }

      const finalScore = Math.min(basicMatch + semanticBonus, 1.0);

      this.logger.debug(`Cohere semantic score: ${finalScore.toFixed(3)}`);
      return finalScore;
    } catch (error) {
      this.logger.error(`Cohere reranking failed: ${error.message}`);
      return result.score;
    }
  }

  /**
   * Custom semantic scoring implementation
   */
  private async customSemanticScore(
    query: string,
    result: SearchResult
  ): Promise<number> {
    try {
      this.logger.debug("Using custom semantic scoring");

      // Simple TF-IDF like scoring
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2);
      const content = result.content.toLowerCase();

      let score = 0;
      for (const term of queryTerms) {
        const termFreq = (content.match(new RegExp(term, "g")) || []).length;
        const termScore = Math.min(termFreq * 0.1, 0.5);
        score += termScore;
      }

      // Normalize to range [0, 1]
      const normalizedScore = Math.min(score, 1.0);

      this.logger.debug(`Custom semantic score: ${normalizedScore.toFixed(3)}`);
      return normalizedScore;
    } catch (error) {
      this.logger.error(`Custom semantic scoring failed: ${error.message}`);
      return result.score;
    }
  }

  /**
   * Calculate contextual relevance based on user profile
   */
  private async calculateContextualScore(
    query: string,
    result: SearchResult,
    userProfile: UserProfile,
    conversationHistory: any[]
  ): Promise<number> {
    try {
      let contextualScore = 0.5; // Base score

      // 1. Adaptation to expertise level
      const expertiseBonus = this.getExpertiseBonus(
        result,
        userProfile.expertiseLevel
      );
      contextualScore += expertiseBonus;

      // 2. Alignment with technical background
      const backgroundBonus = this.getBackgroundBonus(
        result,
        userProfile.technicalBackground
      );
      contextualScore += backgroundBonus;

      // 3. Document language
      const languageBonus = this.getLanguageBonus(
        result,
        userProfile.preferredLanguage
      );
      contextualScore += languageBonus;

      // 4. Relation to recent conversation topics
      const conversationBonus = this.getConversationBonus(
        result,
        conversationHistory
      );
      contextualScore += conversationBonus;

      // 5. Source popularity/authority
      const sourceBonus = this.getSourceAuthorityBonus(result);
      contextualScore += sourceBonus;

      // Normalize to range [0, 1]
      const finalScore = Math.max(0, Math.min(contextualScore, 1.0));

      this.logger.debug(`Contextual score: ${finalScore.toFixed(3)}`);
      return finalScore;
    } catch (error) {
      this.logger.warn(`Contextual scoring failed: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Calculate document freshness score
   */
  private calculateFreshnessScore(result: SearchResult): number {
    try {
      const lastUpdated = result.metadata?.lastUpdated;
      if (!lastUpdated) {
        return 0.5; // No date data - average score
      }

      const updatedDate = new Date(lastUpdated);
      const now = new Date();
      const daysSinceUpdate =
        (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

      // Exponential decay with age
      let freshnessScore;
      if (daysSinceUpdate <= 30) {
        freshnessScore = 1.0; // Very fresh
      } else if (daysSinceUpdate <= 90) {
        freshnessScore = 0.8; // Fresh
      } else if (daysSinceUpdate <= 180) {
        freshnessScore = 0.6; // Moderately fresh
      } else if (daysSinceUpdate <= 365) {
        freshnessScore = 0.4; // Old
      } else {
        freshnessScore = 0.2; // Very old
      }

      this.logger.debug(
        `Freshness score: ${freshnessScore.toFixed(3)} (${daysSinceUpdate.toFixed(0)} days old)`
      );
      return freshnessScore;
    } catch (error) {
      this.logger.warn(`Freshness calculation failed: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Calculate composite final score
   */
  private calculateCompositeScore(
    semanticScore: number,
    contextualScore: number,
    freshnessScore: number,
    config: RerankingConfig
  ): number {
    const finalScore =
      semanticScore * config.semanticWeight +
      contextualScore * config.contextualWeight +
      freshnessScore * config.freshnessWeight;

    return Math.max(0, Math.min(finalScore, 1.0));
  }

  /**
   * Generate ranking rationale explanation
   */
  private generateRankingRationale(
    semanticScore: number,
    contextualScore: number,
    freshnessScore: number,
    finalScore: number,
    result: SearchResult
  ): string {
    const parts: string[] = [];

    if (semanticScore > 0.8) {
      parts.push("high semantic relevance");
    } else if (semanticScore > 0.6) {
      parts.push("good semantic relevance");
    }

    if (contextualScore > 0.7) {
      parts.push("matches user context");
    }

    if (freshnessScore > 0.8) {
      parts.push("up-to-date information");
    } else if (freshnessScore < 0.3) {
      parts.push("outdated information");
    }

    if (result.source?.includes("Official")) {
      parts.push("official source");
    }

    const rationale =
      parts.length > 0
        ? `High rating: ${parts.join(", ")}`
        : `Rating ${finalScore.toFixed(2)}: basic query match`;

    return rationale;
  }

  /**
   * Helper methods for contextual scoring
   */
  private getExpertiseBonus(
    result: SearchResult,
    expertiseLevel: string
  ): number {
    const category = result.metadata?.category?.toLowerCase() || "";

    switch (expertiseLevel) {
      case "beginner":
        return category.includes("tutorial") || category.includes("basic")
          ? 0.2
          : 0;
      case "expert":
        return category.includes("advanced") || category.includes("api")
          ? 0.2
          : -0.1;
      default:
        return 0.1;
    }
  }

  private getBackgroundBonus(
    result: SearchResult,
    technicalBackground: string[]
  ): number {
    const content = result.content.toLowerCase();
    const source = result.source.toLowerCase();

    let bonus = 0;
    for (const skill of technicalBackground) {
      if (
        content.includes(skill.toLowerCase()) ||
        source.includes(skill.toLowerCase())
      ) {
        bonus += 0.05;
      }
    }

    return Math.min(bonus, 0.2);
  }

  private getLanguageBonus(
    result: SearchResult,
    preferredLanguage: string
  ): number {
    // Simple heuristic for content language detection
    const cyrillicRatio =
      (result.content.match(/[а-яё]/gi) || []).length / result.content.length;

    if (preferredLanguage === "ru" && cyrillicRatio > 0.1) {
      return 0.1;
    } else if (preferredLanguage === "en" && cyrillicRatio < 0.05) {
      return 0.1;
    }

    return 0;
  }

  private getConversationBonus(
    result: SearchResult,
    conversationHistory: any[]
  ): number {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 0;
    }

    // Extract keywords from recent messages
    const recentMessages = conversationHistory.slice(-3);
    const recentTopics = recentMessages
      .map(msg => msg.content?.toLowerCase() || "")
      .join(" ")
      .split(/\s+/)
      .filter(word => word.length > 3);

    const content = result.content.toLowerCase();
    let matches = 0;

    for (const topic of recentTopics) {
      if (content.includes(topic)) {
        matches++;
      }
    }

    return Math.min(matches * 0.02, 0.15);
  }

  private getSourceAuthorityBonus(result: SearchResult): number {
    const source = result.source.toLowerCase();

    if (source.includes("official") || source.includes("documentation")) {
      return 0.15;
    } else if (source.includes("api") || source.includes("reference")) {
      return 0.1;
    } else if (source.includes("community") || source.includes("forum")) {
      return -0.05;
    }

    return 0;
  }

  /**
   * Get default reranking configuration
   */
  static getDefaultConfig(): RerankingConfig {
    return {
      model: "cohere-rerank-v3",
      semanticWeight: 0.6,
      contextualWeight: 0.3,
      freshnessWeight: 0.1,
      topK: 10,
    };
  }
}
