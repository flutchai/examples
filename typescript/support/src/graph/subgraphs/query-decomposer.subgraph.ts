import { Injectable, Logger } from "@nestjs/common";
import { DecomposedQuery } from "../graph.state";
import { formatError, getErrorMessage } from "@flutchai/flutch-sdk";

/**
 * QueryDecomposer Subgraph - Complex query decomposition
 *
 * According to specifications:
 * - User intent analysis
 * - Breaking down complex queries into sub-queries
 * - Identifying dependencies between sub-queries
 * - Determining search strategy
 * - Prioritizing sub-queries
 */

interface DecompositionConfig {
  maxSubQueries: number;
  complexityThreshold: number;
  enableDependencyAnalysis: boolean;
  minSubQueryLength: number;
}

interface QueryAnalysis {
  complexity: number;
  mainIntent: string;
  secondaryIntents: string[];
  entityTypes: string[];
  requiresDecomposition: boolean;
  searchStrategy: "simple" | "parallel" | "sequential" | "hybrid";
}

@Injectable()
export class QueryDecomposerSubgraph {
  private readonly logger = new Logger(QueryDecomposerSubgraph.name);

  constructor() {}

  /**
   * Execute query decomposition and analysis
   */
  async execute(
    originalQuery: string,
    conversationHistory: any[],
    userProfile: any,
    config: DecompositionConfig
  ): Promise<{
    decomposedQueries: DecomposedQuery[];
    searchStrategy: string;
    totalComplexity: number;
  }> {
    this.logger.log(
      `Starting query decomposition for: ${originalQuery.substring(0, 100)}...`
    );

    try {
      // 1. Analyze query complexity and intent
      const analysis = await this.analyzeQueryComplexity(
        originalQuery,
        conversationHistory
      );

      // 2. Determine if decomposition is needed
      if (
        !analysis.requiresDecomposition ||
        analysis.complexity < config.complexityThreshold
      ) {
        this.logger.debug("Query is simple enough, no decomposition needed");

        const singleQuery = this.createDecomposedQuery(
          originalQuery,
          originalQuery,
          analysis.mainIntent,
          1,
          analysis.complexity,
          "simple",
          [],
          this.generateSearchHints(originalQuery, analysis),
          this.inferResultType(originalQuery)
        );

        return {
          decomposedQueries: [singleQuery],
          searchStrategy: "simple",
          totalComplexity: analysis.complexity,
        };
      }

      // 3. Decompose complex query
      const subQueries = await this.decomposeComplexQuery(
        originalQuery,
        analysis,
        config
      );

      // 4. Analyze dependencies between sub-queries (if enabled)
      if (config.enableDependencyAnalysis) {
        await this.analyzeDependencies(subQueries);
      }

      // 5. Prioritize sub-queries
      const prioritizedQueries = await this.prioritizeSubQueries(
        subQueries,
        userProfile
      );

      // 6. Determine search strategy
      const searchStrategy = this.determineSearchStrategy(
        prioritizedQueries,
        analysis
      );

      this.logger.log(
        `Decomposition completed: ${prioritizedQueries.length} sub-queries, strategy: ${searchStrategy}`
      );

      return {
        decomposedQueries: prioritizedQueries,
        searchStrategy,
        totalComplexity: analysis.complexity,
      };
    } catch (error) {
      const errorInfo = formatError(error);
      this.logger.error(
        `Query decomposition failed: ${errorInfo.message}`,
        errorInfo.stack
      );

      // Fallback: return original query without decomposition
      const fallbackQuery = this.createDecomposedQuery(
        originalQuery,
        originalQuery,
        "general",
        1,
        1.0,
        "simple",
        [],
        ["general search"],
        "direct_answer"
      );

      return {
        decomposedQueries: [fallbackQuery],
        searchStrategy: "simple",
        totalComplexity: 1,
      };
    }
  }

  /**
   * Analyze query complexity and intent
   */
  private async analyzeQueryComplexity(
    query: string,
    conversationHistory: any[]
  ): Promise<QueryAnalysis> {
    try {
      // Simple heuristics for complexity analysis
      const words = query.split(/\s+/).filter(word => word.length > 2);
      const sentences = query.split(/[.!?]+/).filter(s => s.trim().length > 0);

      let complexity = 0;

      // Complexity factors
      complexity += Math.min(words.length * 0.1, 2); // Query length
      complexity += Math.min(sentences.length * 0.3, 1.5); // Number of sentences

      // Search for keywords indicating complexity
      const complexityIndicators = [
        "how to configure",
        "step by step",
        "in detail",
        "difference between",
        "compare",
        "which is better",
        "problem with",
        "not working",
        "integration",
        "configure",
        "troubleshoot",
        "compare",
      ];

      for (const indicator of complexityIndicators) {
        if (query.toLowerCase().includes(indicator)) {
          complexity += 0.5;
        }
      }

      // Intent analysis
      const mainIntent = this.extractMainIntent(query);
      const secondaryIntents = this.extractSecondaryIntents(query);

      // Extract entity types
      const entityTypes = this.extractEntityTypes(query);

      // Determine if decomposition is needed
      const requiresDecomposition =
        complexity > 1.5 ||
        secondaryIntents.length > 1 ||
        entityTypes.length > 2;

      // Determine search strategy based on analysis
      let searchStrategy: "simple" | "parallel" | "sequential" | "hybrid" =
        "simple";

      if (requiresDecomposition) {
        if (secondaryIntents.length > 1) {
          searchStrategy = "parallel";
        } else if (complexity > 2.5) {
          searchStrategy = "sequential";
        } else {
          searchStrategy = "hybrid";
        }
      }

      this.logger.debug(
        `Query analysis: complexity=${complexity}, intent=${mainIntent}, requiresDecomposition=${requiresDecomposition}`
      );

      return {
        complexity,
        mainIntent,
        secondaryIntents,
        entityTypes,
        requiresDecomposition,
        searchStrategy,
      };
    } catch (error) {
      this.logger.warn(`Query analysis failed: ${getErrorMessage(error)}`);
      return {
        complexity: 1,
        mainIntent: "general",
        secondaryIntents: [],
        entityTypes: [],
        requiresDecomposition: false,
        searchStrategy: "simple",
      };
    }
  }

  /**
   * Create a complete DecomposedQuery object with all required fields
   */
  private createDecomposedQuery(
    originalQuery: string,
    subQuery: string,
    intent: string,
    priority: number,
    complexity: number,
    strategy: "simple" | "parallel" | "sequential" | "hybrid",
    dependencies: string[] = [],
    searchHints: string[] = [],
    expectedResultType?:
      | "direct_answer"
      | "documentation"
      | "code_example"
      | "tutorial"
      | "troubleshooting"
      | "comparison"
  ): DecomposedQuery {
    return {
      id: `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      originalQuery,
      subQuery,
      intent,
      complexity,
      order: priority,
      strategy,
      priority,
      dependencies,
      searchHints,
      expectedResultType:
        expectedResultType || this.inferResultType(subQuery, intent),
    };
  }

  /**
   * Decompose complex query into sub-queries
   */
  private async decomposeComplexQuery(
    originalQuery: string,
    analysis: QueryAnalysis,
    config: DecompositionConfig
  ): Promise<DecomposedQuery[]> {
    const subQueries: DecomposedQuery[] = [];

    try {
      // Strategy 1: Split by intents
      if (analysis.secondaryIntents.length > 0) {
        // Main query for primary intent
        subQueries.push(
          this.createDecomposedQuery(
            originalQuery,
            this.reformulateForIntent(originalQuery, analysis.mainIntent),
            analysis.mainIntent,
            1,
            analysis.complexity,
            "parallel",
            [],
            this.generateSearchHints(originalQuery, analysis),
            this.inferResultType(originalQuery, analysis.mainIntent)
          )
        );

        // Additional queries for secondary intents
        for (
          let i = 0;
          i < analysis.secondaryIntents.length &&
          subQueries.length < config.maxSubQueries;
          i++
        ) {
          const intent = analysis.secondaryIntents[i];
          subQueries.push(
            this.createDecomposedQuery(
              originalQuery,
              this.reformulateForIntent(originalQuery, intent),
              intent,
              i + 2,
              analysis.complexity * 0.8,
              "parallel",
              [],
              this.generateSearchHints(originalQuery, analysis, intent),
              this.inferResultType(originalQuery, intent)
            )
          );
        }
      }
      // Strategy 2: Split by entities
      else if (analysis.entityTypes.length > 1) {
        for (
          let i = 0;
          i < analysis.entityTypes.length &&
          subQueries.length < config.maxSubQueries;
          i++
        ) {
          const entityType = analysis.entityTypes[i];
          subQueries.push(
            this.createDecomposedQuery(
              originalQuery,
              this.reformulateForEntity(originalQuery, entityType),
              analysis.mainIntent,
              i + 1,
              analysis.complexity * 0.7,
              "parallel",
              [],
              [
                entityType,
                ...this.generateSearchHints(originalQuery, analysis),
              ],
              this.inferResultType(originalQuery, analysis.mainIntent)
            )
          );
        }
      }
      // Strategy 3: Split by sentences
      else {
        const sentences = originalQuery
          .split(/[.!?]+/)
          .filter(s => s.trim().length > config.minSubQueryLength);

        for (
          let i = 0;
          i < sentences.length && subQueries.length < config.maxSubQueries;
          i++
        ) {
          const sentence = sentences[i].trim();
          if (sentence.length > config.minSubQueryLength) {
            subQueries.push(
              this.createDecomposedQuery(
                originalQuery,
                sentence,
                analysis.mainIntent,
                i + 1,
                analysis.complexity * 0.6,
                "sequential",
                [],
                this.generateSearchHints(sentence, analysis),
                this.inferResultType(sentence)
              )
            );
          }
        }
      }

      // If splitting failed, return original query
      if (subQueries.length === 0) {
        subQueries.push(
          this.createDecomposedQuery(
            originalQuery,
            originalQuery,
            analysis.mainIntent,
            1,
            analysis.complexity,
            "simple",
            [],
            this.generateSearchHints(originalQuery, analysis),
            this.inferResultType(originalQuery)
          )
        );
      }

      this.logger.debug(`Generated ${subQueries.length} sub-queries`);
      return subQueries;
    } catch (error) {
      this.logger.error(
        `Query decomposition failed: ${getErrorMessage(error)}`
      );

      // Fallback
      return [
        this.createDecomposedQuery(
          originalQuery,
          originalQuery,
          analysis.mainIntent,
          1,
          analysis.complexity || 1.0,
          "simple",
          [],
          this.generateSearchHints(originalQuery, analysis),
          this.inferResultType(originalQuery)
        ),
      ];
    }
  }

  /**
   * Analyze dependencies between sub-queries
   */
  private async analyzeDependencies(
    subQueries: DecomposedQuery[]
  ): Promise<void> {
    try {
      for (let i = 0; i < subQueries.length; i++) {
        const currentQuery = subQueries[i];
        const dependencies: string[] = [];

        // Simple heuristic for finding dependencies
        for (let j = 0; j < subQueries.length; j++) {
          if (i !== j) {
            const otherQuery = subQueries[j];

            // Search for common keywords
            const currentWords = currentQuery.subQuery
              .toLowerCase()
              .split(/\s+/);
            const otherWords = otherQuery.subQuery.toLowerCase().split(/\s+/);

            const commonWords = currentWords.filter(
              word => word.length > 3 && otherWords.includes(word)
            );

            if (commonWords.length > 1) {
              dependencies.push(`subquery_${j}`);
            }
          }
        }

        currentQuery.dependencies = dependencies;
      }

      this.logger.debug("Dependency analysis completed");
    } catch (error) {
      this.logger.warn(`Dependency analysis failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Prioritize sub-queries based on user profile and context
   */
  private async prioritizeSubQueries(
    subQueries: DecomposedQuery[],
    userProfile: any
  ): Promise<DecomposedQuery[]> {
    try {
      // Simple prioritization based on intent and user profile
      const prioritized = [...subQueries].sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Bonus for main intent
        if (a.intent === "configuration" || a.intent === "troubleshooting")
          scoreA += 2;
        if (b.intent === "configuration" || b.intent === "troubleshooting")
          scoreB += 2;

        // Bonus for matching user level
        if (userProfile?.expertiseLevel === "beginner") {
          if (a.subQuery.includes("tutorial") || a.subQuery.includes("basic"))
            scoreA += 1;
          if (b.subQuery.includes("tutorial") || b.subQuery.includes("basic"))
            scoreB += 1;
        }

        // Consider original priority
        scoreA += 10 - a.priority; // Invert, as lower number = higher priority
        scoreB += 10 - b.priority;

        return scoreB - scoreA;
      });

      // Reassign priorities
      prioritized.forEach((query, index) => {
        query.priority = index + 1;
      });

      this.logger.debug("Sub-queries prioritized");
      return prioritized;
    } catch (error) {
      this.logger.warn(`Prioritization failed: ${getErrorMessage(error)}`);
      return subQueries;
    }
  }

  /**
   * Determine optimal search strategy
   */
  private determineSearchStrategy(
    subQueries: DecomposedQuery[],
    analysis: QueryAnalysis
  ): string {
    try {
      // Check dependencies
      const hasDependencies = subQueries.some(q => q.dependencies.length > 0);

      if (hasDependencies) {
        return "sequential"; // Sequential search when dependencies exist
      }

      if (subQueries.length === 1) {
        return "simple";
      }

      if (subQueries.length <= 3) {
        return "parallel"; // Parallel search for small number of queries
      }

      return "hybrid"; // Hybrid strategy for complex cases
    } catch (error) {
      this.logger.warn(
        `Strategy determination failed: ${getErrorMessage(error)}`
      );
      return "simple";
    }
  }

  /**
   * Helper methods for intent and entity extraction
   */
  private extractMainIntent(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("configure") || lowerQuery.includes("set up"))
      return "configuration";
    if (
      lowerQuery.includes("problem") ||
      lowerQuery.includes("error") ||
      lowerQuery.includes("issue")
    )
      return "troubleshooting";
    if (lowerQuery.includes("how") || lowerQuery.includes("how to"))
      return "howto";
    if (lowerQuery.includes("what is") || lowerQuery.includes("define"))
      return "definition";
    if (lowerQuery.includes("compare") || lowerQuery.includes("vs"))
      return "comparison";
    if (lowerQuery.includes("install") || lowerQuery.includes("setup"))
      return "installation";

    return "general";
  }

  private extractSecondaryIntents(query: string): string[] {
    const intents: string[] = [];
    const lowerQuery = query.toLowerCase();

    const intentPatterns = [
      { pattern: /also|additionally|furthermore/, intent: "additional" },
      { pattern: /example|sample|demo/, intent: "example" },
      { pattern: /recommend|suggestion|advice/, intent: "recommendation" },
      { pattern: /security|safety|protection/, intent: "security" },
      { pattern: /performance|speed|optimization/, intent: "performance" },
    ];

    for (const { pattern, intent } of intentPatterns) {
      if (pattern.test(lowerQuery) && !intents.includes(intent)) {
        intents.push(intent);
      }
    }

    return intents;
  }

  private extractEntityTypes(query: string): string[] {
    const entities: string[] = [];
    const lowerQuery = query.toLowerCase();

    const entityPatterns = [
      { pattern: /api|endpoint|interface/, type: "api" },
      { pattern: /database|db|storage/, type: "database" },
      { pattern: /authentication|auth|login/, type: "auth" },
      { pattern: /configuration|config|settings/, type: "config" },
      { pattern: /payment|billing|transaction/, type: "payment" },
      { pattern: /user|account|profile/, type: "user" },
      { pattern: /service|microservice|component/, type: "service" },
    ];

    for (const { pattern, type } of entityPatterns) {
      if (pattern.test(lowerQuery) && !entities.includes(type)) {
        entities.push(type);
      }
    }

    return entities;
  }

  private reformulateForIntent(query: string, intent: string): string {
    switch (intent) {
      case "configuration":
        return `configure ${query}`;
      case "troubleshooting":
        return `troubleshoot ${query}`;
      case "howto":
        return `how to use ${query}`;
      case "example":
        return `examples of ${query}`;
      default:
        return query;
    }
  }

  private reformulateForEntity(query: string, entityType: string): string {
    return `${query} ${entityType}`;
  }

  private generateSearchHints(
    query: string,
    analysis: QueryAnalysis,
    specificIntent?: string
  ): string[] {
    const hints: string[] = [];

    // Basic hints based on intent
    const intent = specificIntent || analysis.mainIntent;
    switch (intent) {
      case "configuration":
        hints.push("setup", "config", "settings");
        break;
      case "troubleshooting":
        hints.push("error", "fix", "solution");
        break;
      case "howto":
        hints.push("tutorial", "guide", "instruction");
        break;
      case "definition":
        hints.push("documentation", "reference", "overview");
        break;
    }

    // Add hints based on entities
    hints.push(...analysis.entityTypes);

    return hints
      .filter((hint, index, arr) => arr.indexOf(hint) === index)
      .slice(0, 5);
  }

  private inferResultType(
    query: string,
    intent?: string
  ):
    | "direct_answer"
    | "documentation"
    | "code_example"
    | "tutorial"
    | "troubleshooting"
    | "comparison" {
    if (intent === "howto" || intent === "configuration") return "tutorial";
    if (intent === "troubleshooting") return "troubleshooting";
    if (intent === "definition") return "documentation";
    if (query.includes("example") || query.includes("sample"))
      return "code_example";
    if (
      query.includes("compare") ||
      query.includes("versus") ||
      query.includes("vs")
    )
      return "comparison";

    return "direct_answer";
  }

  /**
   * Get default decomposition configuration
   */
  static getDefaultConfig(): DecompositionConfig {
    return {
      maxSubQueries: 5,
      complexityThreshold: 1.5,
      enableDependencyAnalysis: true,
      minSubQueryLength: 10,
    };
  }
}
