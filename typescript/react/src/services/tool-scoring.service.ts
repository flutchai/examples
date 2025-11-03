import { Injectable } from "@nestjs/common";
import { ToolMetadata, ToolConfiguration } from "../react.types";
import { ReactGraphStateValues } from "../react-graph.builder";

/**
 * Scoring configuration for tool selection
 */
export interface ToolScoringConfig {
  maxShortlistSize: number;
  scoring: {
    nameMatchWeight: number;
    descriptionMatchWeight: number;
    tagMatchWeight: number;
    recentUsePenalty: number;
    sequentialBonuses: Record<string, Record<string, number>>;
  };
  tokenization: {
    minTokenLength: number;
    splitPattern: RegExp;
  };
}

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ToolScoringConfig = {
  maxShortlistSize: 5,
  scoring: {
    nameMatchWeight: 3,
    descriptionMatchWeight: 1.5,
    tagMatchWeight: 2,
    recentUsePenalty: -3,
    sequentialBonuses: {
      kb_search: { kb_get_document: 4 },
      "email.search": { "email.get_thread": 4 },
    },
  },
  tokenization: {
    minTokenLength: 2,
    splitPattern: /[^a-z0-9]+/,
  },
};

/**
 * Service for scoring and shortlisting tools based on query relevance
 */
@Injectable()
export class ToolScoringService {
  constructor(
    private readonly config: ToolScoringConfig = DEFAULT_SCORING_CONFIG
  ) {}

  /**
   * Filters tools based on allowed names and tags
   */
  filterTools(
    tools: ToolMetadata[],
    allowedNames: string[] = [],
    allowedTags: string[] = []
  ): ToolMetadata[] {
    let filtered = [...tools];

    // Filter by allowed tool names
    if (allowedNames.length > 0) {
      const allowedSet = new Set(allowedNames);
      filtered = filtered.filter(tool => allowedSet.has(tool.name));
    }

    // Filter by allowed tags
    if (allowedTags.length > 0) {
      filtered = filtered.filter(tool =>
        (tool.tags || []).some(tag => allowedTags.includes(tag))
      );
    }

    return filtered;
  }

  /**
   * Creates a shortlist of most relevant tools based on scoring
   */
  buildShortlist(
    tools: ToolMetadata[],
    state: ReactGraphStateValues
  ): ToolMetadata[] {
    const queryTokens = this.tokenizeText(
      `${state.query || ""} ${state.evidence || ""}`
    );

    const scoredTools = tools.map(tool =>
      this.scoreToolRelevance(tool, queryTokens, state)
    );

    // Sort by score (highest first) and take top N
    return scoredTools
      .sort((a, b) => (b.shortlistScore ?? 0) - (a.shortlistScore ?? 0))
      .slice(0, this.config.maxShortlistSize);
  }

  /**
   * Scores a single tool's relevance to the query and current state
   */
  private scoreToolRelevance(
    tool: ToolMetadata,
    queryTokens: Set<string>,
    state: ReactGraphStateValues
  ): ToolMetadata {
    let score = 0;

    // Text similarity scoring
    score += this.calculateTextSimilarityScore(tool, queryTokens);

    // Recent usage penalty
    score += this.calculateRecentUsagePenalty(tool, state);

    // Sequential tool bonus
    score += this.calculateSequentialToolBonus(tool, state);

    return {
      ...tool,
      shortlistScore: score,
    };
  }

  /**
   * Calculates score based on text similarity between tool and query
   */
  private calculateTextSimilarityScore(
    tool: ToolMetadata,
    queryTokens: Set<string>
  ): number {
    let score = 0;
    const { nameMatchWeight, descriptionMatchWeight, tagMatchWeight } =
      this.config.scoring;

    const nameLower = tool.name.toLowerCase();
    const descLower = (tool.description || "").toLowerCase();
    const tags = tool.tags || [];

    for (const token of queryTokens) {
      if (!token) continue;

      // Name matches get highest weight
      if (nameLower.includes(token)) {
        score += nameMatchWeight;
      }

      // Description matches get medium weight
      if (descLower.includes(token)) {
        score += descriptionMatchWeight;
      }

      // Tag matches get good weight
      if (tags.some(tag => tag.toLowerCase() === token)) {
        score += tagMatchWeight;
      }
    }

    return score;
  }

  /**
   * Applies penalty for recently used tools to encourage diversity
   */
  private calculateRecentUsagePenalty(
    tool: ToolMetadata,
    state: ReactGraphStateValues
  ): number {
    if (!state.workingMemory?.length) {
      return 0;
    }

    const recentEntries = state.workingMemory.slice(-2);
    const recentSuccessfulUses = recentEntries.filter(
      entry => entry.tool === tool.name && entry.observation.success
    );

    return recentSuccessfulUses.length * this.config.scoring.recentUsePenalty;
  }

  /**
   * Applies bonus for tools that logically follow the last used tool
   */
  private calculateSequentialToolBonus(
    tool: ToolMetadata,
    state: ReactGraphStateValues
  ): number {
    if (!state.workingMemory?.length) {
      return 0;
    }

    const lastTool = state.workingMemory[state.workingMemory.length - 1]?.tool;
    if (!lastTool) {
      return 0;
    }

    const bonuses = this.config.scoring.sequentialBonuses[lastTool];
    if (!bonuses) {
      return 0;
    }

    return bonuses[tool.name] || 0;
  }

  /**
   * Tokenizes text for similarity comparison
   */
  private tokenizeText(text: string): Set<string> {
    return new Set(
      (text || "")
        .toLowerCase()
        .split(this.config.tokenization.splitPattern)
        .filter(token => token.length > this.config.tokenization.minTokenLength)
    );
  }

  /**
   * Formats tool shortlist for debugging/logging
   */
  formatShortlistForLogging(shortlist: ToolMetadata[]): string {
    return shortlist
      .map(tool => {
        const score = tool.shortlistScore?.toFixed(2) ?? "0.00";
        const tags = (tool.tags || []).join(", ") || "n/a";
        return `${tool.name} (score: ${score}, tags: ${tags})`;
      })
      .join("\n");
  }
}
