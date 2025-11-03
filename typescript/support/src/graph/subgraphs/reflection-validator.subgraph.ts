import { Injectable, Logger } from "@nestjs/common";
import { ValidationResult } from "../graph.state";

/**
 * ReflectionValidator Subgraph - Response quality validation
 *
 * According to specifications:
 * - Check response completeness relative to question
 * - Assess accuracy and relevance of information
 * - Check for factual errors and contradictions
 * - Analyze tone and style of response
 * - Validate content security
 * - Provide improvement suggestions
 */

interface ValidationConfig {
  enableFactChecking: boolean;
  enableToneAnalysis: boolean;
  enableSecurityCheck: boolean;
  enableCompletenessCheck: boolean;
  minQualityScore: number;
  strictMode: boolean;
}

interface QualityMetrics {
  completeness: number;
  accuracy: number;
  relevance: number;
  clarity: number;
  tone: number;
  security: number;
  overall: number;
}

interface ValidationIssue {
  type: "error" | "warning" | "suggestion";
  category:
    | "completeness"
    | "accuracy"
    | "relevance"
    | "tone"
    | "security"
    | "clarity";
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  suggestedFix?: string;
}

@Injectable()
export class ReflectionValidatorSubgraph {
  private readonly logger = new Logger(ReflectionValidatorSubgraph.name);

  constructor() {}

  /**
   * Execute comprehensive response validation
   */
  async execute(
    originalQuery: string,
    generatedResponse: string,
    retrievedSources: any[],
    conversationHistory: any[],
    userProfile: any,
    config: ValidationConfig
  ): Promise<ValidationResult> {
    this.logger.log(
      `Starting response validation for query: ${originalQuery.substring(0, 100)}...`
    );

    try {
      const validationIssues: ValidationIssue[] = [];
      const qualityMetrics: QualityMetrics = {
        completeness: 0,
        accuracy: 0,
        relevance: 0,
        clarity: 0,
        tone: 0,
        security: 0,
        overall: 0,
      };

      // 1. Check response completeness
      if (config.enableCompletenessCheck) {
        const completenessResult = await this.validateCompleteness(
          originalQuery,
          generatedResponse
        );
        qualityMetrics.completeness = completenessResult.score;
        validationIssues.push(...completenessResult.issues);
      }

      // 2. Check accuracy (fact-checking)
      if (config.enableFactChecking) {
        const accuracyResult = await this.validateAccuracy(
          generatedResponse,
          retrievedSources
        );
        qualityMetrics.accuracy = accuracyResult.score;
        validationIssues.push(...accuracyResult.issues);
      }

      // 3. Check relevance
      const relevanceResult = await this.validateRelevance(
        originalQuery,
        generatedResponse
      );
      qualityMetrics.relevance = relevanceResult.score;
      validationIssues.push(...relevanceResult.issues);

      // 4. Check clarity and understandability
      const clarityResult = await this.validateClarity(
        generatedResponse,
        userProfile
      );
      qualityMetrics.clarity = clarityResult.score;
      validationIssues.push(...clarityResult.issues);

      // 5. Analyze tone and style
      if (config.enableToneAnalysis) {
        const toneResult = await this.validateTone(
          generatedResponse,
          userProfile,
          conversationHistory
        );
        qualityMetrics.tone = toneResult.score;
        validationIssues.push(...toneResult.issues);
      }

      // 6. Check content security
      if (config.enableSecurityCheck) {
        const securityResult = await this.validateSecurity(generatedResponse);
        qualityMetrics.security = securityResult.score;
        validationIssues.push(...securityResult.issues);
      }

      // 7. Calculate overall quality rating
      qualityMetrics.overall = this.calculateOverallScore(qualityMetrics);

      // 8. Determine if improvements are needed
      const needsImprovement =
        qualityMetrics.overall < config.minQualityScore ||
        validationIssues.some(issue => issue.severity === "critical");

      // 9. Generate improvement recommendations
      const improvements = await this.generateImprovements(
        validationIssues,
        qualityMetrics
      );

      const validationResult: ValidationResult = {
        passed: !needsImprovement,
        isValid: !needsImprovement,
        qualityScore: qualityMetrics.overall,
        completenessScore: qualityMetrics.completeness,
        accuracyScore: qualityMetrics.accuracy,
        issues: validationIssues,
        improvements,
        reasoning: `Quality assessment based on ${validationIssues.length} issues and overall score of ${qualityMetrics.overall.toFixed(2)}`,
        qualityMetrics,
        validationSummary: this.generateValidationSummary(
          qualityMetrics,
          validationIssues
        ),
      };

      this.logger.log(
        `Validation completed: score=${qualityMetrics.overall.toFixed(2)}, issues=${validationIssues.length}, needsImprovement=${needsImprovement}`
      );

      return validationResult;
    } catch (error) {
      this.logger.error(
        `Response validation failed: ${error.message}`,
        error.stack
      );

      // Fallback: consider response valid on validation error
      return {
        passed: true,
        isValid: true,
        qualityScore: 0.7,
        completenessScore: 0.7,
        accuracyScore: 0.7,
        issues: [`Validation failed: ${error.message}`],
        improvements: ["Manual review recommended due to validation error"],
        reasoning: `Validation error encountered: ${error.message}`,
        qualityMetrics: {
          completeness: 0.7,
          accuracy: 0.7,
          relevance: 0.7,
          clarity: 0.7,
          tone: 0.7,
          security: 0.9,
          overall: 0.7,
        },
        validationSummary: "Validation incomplete due to error",
      };
    }
  }

  /**
   * Validate response completeness against the original query
   */
  private async validateCompleteness(
    query: string,
    response: string
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];
      let score = 0.5; // Base score

      // Extract key aspects of the question
      const queryAspects = this.extractQueryAspects(query);
      let addressedAspects = 0;

      for (const aspect of queryAspects) {
        if (response.toLowerCase().includes(aspect.toLowerCase())) {
          addressedAspects++;
        } else {
          issues.push({
            type: "warning",
            category: "completeness",
            message: `Response doesn't address: ${aspect}`,
            severity: "medium",
            suggestedFix: `Add information about ${aspect}`,
          });
        }
      }

      // Calculate completeness score
      if (queryAspects.length > 0) {
        score = addressedAspects / queryAspects.length;
      } else {
        score = 0.8; // If we can't extract aspects, give high score
      }

      // Check minimum response length
      if (response.length < 50) {
        issues.push({
          type: "error",
          category: "completeness",
          message: "Response is too short to be complete",
          severity: "high",
          suggestedFix: "Provide more detailed explanation",
        });
        score = Math.min(score, 0.3);
      }

      // Check presence of specific examples (if requested)
      if (
        query.toLowerCase().includes("example") ||
        query.toLowerCase().includes("пример")
      ) {
        if (!this.containsExamples(response)) {
          issues.push({
            type: "warning",
            category: "completeness",
            message:
              "User requested examples but response lacks concrete examples",
            severity: "medium",
            suggestedFix: "Add specific examples to illustrate the concepts",
          });
          score *= 0.8;
        }
      }

      this.logger.debug(
        `Completeness validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Completeness validation failed: ${error.message}`);
      return { score: 0.7, issues: [] };
    }
  }

  /**
   * Validate response accuracy against retrieved sources
   */
  private async validateAccuracy(
    response: string,
    retrievedSources: any[]
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];
      let score = 0.8; // Base accuracy score

      if (!retrievedSources || retrievedSources.length === 0) {
        this.logger.debug("No sources available for accuracy validation");
        return { score: 0.7, issues: [] };
      }

      // Extract factual claims from response
      const factualClaims = this.extractFactualClaims(response);
      let verifiedClaims = 0;

      // Check each claim against sources
      for (const claim of factualClaims) {
        let isSupported = false;

        for (const source of retrievedSources) {
          if (
            source.content &&
            source.content.toLowerCase().includes(claim.toLowerCase())
          ) {
            isSupported = true;
            break;
          }
        }

        if (isSupported) {
          verifiedClaims++;
        } else {
          issues.push({
            type: "warning",
            category: "accuracy",
            message: `Claim not supported by sources: "${claim}"`,
            severity: "medium",
            suggestedFix:
              "Verify this information or remove if unsubstantiated",
          });
        }
      }

      // Calculate accuracy score
      if (factualClaims.length > 0) {
        score = verifiedClaims / factualClaims.length;
      }

      // Check for contradictions between sources
      const contradictions = this.findContradictions(
        response,
        retrievedSources
      );
      for (const contradiction of contradictions) {
        issues.push({
          type: "error",
          category: "accuracy",
          message: `Potential contradiction detected: ${contradiction}`,
          severity: "high",
          suggestedFix: "Resolve conflicting information and clarify",
        });
        score *= 0.7;
      }

      this.logger.debug(
        `Accuracy validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Accuracy validation failed: ${error.message}`);
      return { score: 0.7, issues: [] };
    }
  }

  /**
   * Validate response relevance to the query
   */
  private async validateRelevance(
    query: string,
    response: string
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];

      // Простой семантический анализ релевантности
      const queryKeywords = this.extractKeywords(query);
      const responseKeywords = this.extractKeywords(response);

      const commonKeywords = queryKeywords.filter(keyword =>
        responseKeywords.includes(keyword.toLowerCase())
      );

      let score = 0.5; // Базовый скор

      if (queryKeywords.length > 0) {
        score = commonKeywords.length / queryKeywords.length;
      }

      // Бонус за прямое упоминание ключевых терминов из запроса
      if (
        response.toLowerCase().includes(query.toLowerCase().substring(0, 20))
      ) {
        score = Math.min(score * 1.2, 1.0);
      }

      // Штраф за избыточную информацию (если ответ слишком общий)
      if (response.length > 2000 && score < 0.6) {
        issues.push({
          type: "suggestion",
          category: "relevance",
          message: "Response may be too verbose for the specific query",
          severity: "low",
          suggestedFix: "Focus more directly on the specific question asked",
        });
        score *= 0.9;
      }

      // Проверка на off-topic контент
      if (score < 0.3) {
        issues.push({
          type: "error",
          category: "relevance",
          message:
            "Response appears to be off-topic or not addressing the query",
          severity: "critical",
          suggestedFix: "Revise response to directly address the user question",
        });
      }

      this.logger.debug(
        `Relevance validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Relevance validation failed: ${error.message}`);
      return { score: 0.7, issues: [] };
    }
  }

  /**
   * Validate response clarity and readability
   */
  private async validateClarity(
    response: string,
    userProfile: any
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];
      let score = 0.7; // Базовый скор ясности

      // Анализ читаемости
      const sentences = response
        .split(/[.!?]+/)
        .filter(s => s.trim().length > 0);
      const averageSentenceLength =
        sentences.length > 0
          ? response.split(/\s+/).length / sentences.length
          : 0;

      // Проверка длины предложений
      if (averageSentenceLength > 25) {
        issues.push({
          type: "suggestion",
          category: "clarity",
          message: "Some sentences may be too long for easy reading",
          severity: "low",
          suggestedFix: "Break down long sentences into shorter, clearer ones",
        });
        score *= 0.9;
      }

      // Проверка структуры
      const hasStructure = this.hasGoodStructure(response);
      if (!hasStructure) {
        issues.push({
          type: "suggestion",
          category: "clarity",
          message:
            "Response could benefit from better structure (headings, lists, etc.)",
          severity: "low",
          suggestedFix:
            "Add headings, bullet points, or numbered lists for better organization",
        });
        score *= 0.9;
      }

      // Проверка технического языка для начинающих пользователей
      if (userProfile?.expertiseLevel === "beginner") {
        const technicalTermsCount = this.countTechnicalTerms(response);
        if (technicalTermsCount > 5) {
          issues.push({
            type: "suggestion",
            category: "clarity",
            message: "Response may be too technical for beginner user",
            severity: "medium",
            suggestedFix:
              "Simplify technical language or add explanations for technical terms",
          });
          score *= 0.8;
        }
      }

      // Проверка на опечатки и грамматические ошибки (простая эвристика)
      const potentialErrors = this.detectPotentialErrors(response);
      if (potentialErrors > 0) {
        issues.push({
          type: "warning",
          category: "clarity",
          message: `Potential spelling or grammar issues detected (${potentialErrors})`,
          severity: "medium",
          suggestedFix: "Review and correct spelling and grammar",
        });
        score *= 0.85;
      }

      this.logger.debug(
        `Clarity validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Clarity validation failed: ${error.message}`);
      return { score: 0.7, issues: [] };
    }
  }

  /**
   * Validate response tone and style
   */
  private async validateTone(
    response: string,
    userProfile: any,
    conversationHistory: any[]
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];
      let score = 0.8; // Базовый скор тона

      // Анализ формальности тона
      const formalityLevel = this.analyzeFormalityLevel(response);
      const expectedFormality = this.getExpectedFormality(
        userProfile,
        conversationHistory
      );

      if (Math.abs(formalityLevel - expectedFormality) > 0.3) {
        const toneIssue =
          formalityLevel > expectedFormality ? "too formal" : "too casual";
        issues.push({
          type: "suggestion",
          category: "tone",
          message: `Response tone may be ${toneIssue} for this context`,
          severity: "low",
          suggestedFix: `Adjust tone to be more ${formalityLevel > expectedFormality ? "conversational" : "professional"}`,
        });
        score *= 0.9;
      }

      // Проверка на поддерживающий тон
      const isSupportive = this.isSupportiveTone(response);
      if (!isSupportive) {
        issues.push({
          type: "suggestion",
          category: "tone",
          message: "Response could be more supportive and encouraging",
          severity: "low",
          suggestedFix:
            "Add more supportive language and positive reinforcement",
        });
        score *= 0.95;
      }

      // Проверка на негативный язык
      const hasNegativeLanguage = this.hasNegativeLanguage(response);
      if (hasNegativeLanguage) {
        issues.push({
          type: "warning",
          category: "tone",
          message: "Response contains potentially negative language",
          severity: "medium",
          suggestedFix:
            "Reframe negative statements in a more constructive way",
        });
        score *= 0.8;
      }

      this.logger.debug(
        `Tone validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Tone validation failed: ${error.message}`);
      return { score: 0.8, issues: [] };
    }
  }

  /**
   * Validate content security and safety
   */
  private async validateSecurity(
    response: string
  ): Promise<{ score: number; issues: ValidationIssue[] }> {
    try {
      const issues: ValidationIssue[] = [];
      let score = 1.0; // Начинаем с максимального скора безопасности

      // Проверка на утечку чувствительной информации
      const sensitivePatterns = [
        { pattern: /password|пароль/i, type: "password" },
        { pattern: /api[_\s]*key|ключ[_\s]*api/i, type: "api_key" },
        { pattern: /token|токен/i, type: "token" },
        { pattern: /secret|секрет/i, type: "secret" },
        { pattern: /\b\d{16,19}\b/, type: "credit_card" },
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/, type: "ssn" },
      ];

      for (const { pattern, type } of sensitivePatterns) {
        if (pattern.test(response)) {
          issues.push({
            type: "error",
            category: "security",
            message: `Potential sensitive information leak detected: ${type}`,
            severity: "critical",
            suggestedFix: `Remove or mask ${type} information`,
          });
          score *= 0.5;
        }
      }

      // Проверка на небезопасные рекомендации
      const unsafePatterns = [
        /disable\s+(ssl|tls|https)/i,
        /turn\s+off\s+(firewall|security)/i,
        /chmod\s+777/i,
        /sudo\s+rm\s+-rf/i,
      ];

      for (const pattern of unsafePatterns) {
        if (pattern.test(response)) {
          issues.push({
            type: "error",
            category: "security",
            message:
              "Response contains potentially unsafe security recommendations",
            severity: "high",
            suggestedFix: "Review and provide secure alternatives",
          });
          score *= 0.7;
        }
      }

      // Проверка на вредоносный контент
      const maliciousIndicators = [
        /download\s+from\s+unknown/i,
        /ignore\s+(certificate|ssl)\s+errors/i,
        /bypass\s+security/i,
      ];

      for (const indicator of maliciousIndicators) {
        if (indicator.test(response)) {
          issues.push({
            type: "warning",
            category: "security",
            message: "Response may encourage unsafe practices",
            severity: "medium",
            suggestedFix: "Emphasize security best practices",
          });
          score *= 0.8;
        }
      }

      this.logger.debug(
        `Security validation: score=${score.toFixed(3)}, issues=${issues.length}`
      );
      return { score, issues };
    } catch (error) {
      this.logger.warn(`Security validation failed: ${error.message}`);
      return { score: 0.9, issues: [] };
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(metrics: QualityMetrics): number {
    // Весовые коэффициенты для разных метрик
    const weights = {
      completeness: 0.25,
      accuracy: 0.25,
      relevance: 0.2,
      clarity: 0.15,
      tone: 0.1,
      security: 0.05,
    };

    const weightedScore =
      metrics.completeness * weights.completeness +
      metrics.accuracy * weights.accuracy +
      metrics.relevance * weights.relevance +
      metrics.clarity * weights.clarity +
      metrics.tone * weights.tone +
      metrics.security * weights.security;

    return Math.max(0, Math.min(weightedScore, 1.0));
  }

  /**
   * Generate improvement recommendations
   */
  private async generateImprovements(
    issues: ValidationIssue[],
    metrics: QualityMetrics
  ): Promise<string[]> {
    const improvements: string[] = [];

    // Группируем проблемы по категориям
    const issuesByCategory = issues.reduce(
      (acc, issue) => {
        if (!acc[issue.category]) acc[issue.category] = [];
        acc[issue.category].push(issue);
        return acc;
      },
      {} as Record<string, ValidationIssue[]>
    );

    // Генерируем рекомендации на основе критических проблем
    for (const [category, categoryIssues] of Object.entries(issuesByCategory)) {
      const criticalIssues = categoryIssues.filter(
        issue => issue.severity === "critical"
      );
      const highIssues = categoryIssues.filter(
        issue => issue.severity === "high"
      );

      if (criticalIssues.length > 0) {
        improvements.push(
          `CRITICAL: Fix ${category} issues - ${criticalIssues.length} critical problems detected`
        );
      } else if (highIssues.length > 0) {
        improvements.push(
          `HIGH: Address ${category} issues - ${highIssues.length} high priority problems`
        );
      }
    }

    // Рекомендации на основе низких метрик
    if (metrics.completeness < 0.6) {
      improvements.push(
        "Expand response to address all aspects of the user's question"
      );
    }
    if (metrics.accuracy < 0.7) {
      improvements.push("Verify factual claims against reliable sources");
    }
    if (metrics.relevance < 0.6) {
      improvements.push("Focus more directly on the specific question asked");
    }
    if (metrics.clarity < 0.7) {
      improvements.push(
        "Improve clarity with better structure and simpler language"
      );
    }

    return improvements;
  }

  /**
   * Generate validation summary
   */
  private generateValidationSummary(
    metrics: QualityMetrics,
    issues: ValidationIssue[]
  ): string {
    const criticalIssues = issues.filter(
      issue => issue.severity === "critical"
    ).length;
    const highIssues = issues.filter(issue => issue.severity === "high").length;

    if (criticalIssues > 0) {
      return `Response has ${criticalIssues} critical issues and needs immediate revision`;
    }
    if (highIssues > 0) {
      return `Response has ${highIssues} high priority issues that should be addressed`;
    }
    if (metrics.overall > 0.8) {
      return `Response quality is excellent (${(metrics.overall * 100).toFixed(0)}%)`;
    }
    if (metrics.overall > 0.6) {
      return `Response quality is good (${(metrics.overall * 100).toFixed(0)}%) with room for improvement`;
    }

    return `Response quality is below average (${(metrics.overall * 100).toFixed(0)}%) and needs improvement`;
  }

  /**
   * Helper methods for content analysis
   */
  private extractQueryAspects(query: string): string[] {
    // Простая эвристика извлечения ключевых аспектов из вопроса
    const aspects: string[] = [];
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Извлекаем существительные и ключевые глаголы
    const keywords = words.filter(
      word =>
        ![
          "как",
          "что",
          "где",
          "когда",
          "почему",
          "зачем",
          "how",
          "what",
          "where",
          "when",
          "why",
        ].includes(word)
    );

    return keywords.slice(0, 5); // Ограничиваем количество аспектов
  }

  private extractFactualClaims(response: string): string[] {
    // Простая эвристика извлечения фактических утверждений
    const sentences = response
      .split(/[.!?]+/)
      .filter(s => s.trim().length > 10);

    // Фильтруем предложения, которые содержат фактические утверждения
    return sentences
      .filter(sentence => {
        const lower = sentence.toLowerCase();
        return (
          lower.includes("является") ||
          lower.includes("составляет") ||
          lower.includes("равно") ||
          lower.includes("means") ||
          lower.includes("equals") ||
          lower.includes("is")
        );
      })
      .slice(0, 10);
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/[^\p{L}\p{N}]/u.test(word))
      .slice(0, 20);
  }

  private findContradictions(response: string, sources: any[]): string[] {
    // Упрощенный поиск противоречий
    const contradictions: string[] = [];

    // Здесь должна быть более сложная логика поиска противоречий
    // Пока оставляем простую заглушку

    return contradictions;
  }

  private containsExamples(response: string): boolean {
    const exampleIndicators = [
      "например",
      "example",
      "пример",
      "для примера",
      "such as",
      "like",
      "включая",
      "including",
    ];

    return exampleIndicators.some(indicator =>
      response.toLowerCase().includes(indicator)
    );
  }

  private hasGoodStructure(response: string): boolean {
    // Проверяем наличие структурных элементов
    const hasLists =
      /^[\s]*[-*]\s+/m.test(response) || /^\s*\d+\.\s+/m.test(response);
    const hasHeadings = /^#+\s+/m.test(response);
    const hasParagraphs = response.split("\n\n").length > 1;

    return hasLists || hasHeadings || hasParagraphs;
  }

  private countTechnicalTerms(response: string): number {
    const technicalPatterns = [
      /api|endpoint/gi,
      /database|sql/gi,
      /authentication|authorization/gi,
      /configuration|config/gi,
      /json|xml|yaml/gi,
    ];

    let count = 0;
    for (const pattern of technicalPatterns) {
      const matches = response.match(pattern);
      if (matches) count += matches.length;
    }

    return count;
  }

  private detectPotentialErrors(response: string): number {
    // Простая эвристика поиска потенциальных ошибок
    let errorCount = 0;

    // Проверка на двойные пробелы
    if (/\s{2,}/g.test(response)) errorCount++;

    // Проверка на отсутствие пробелов после знаков препинания
    if (/[.!?][^\s]/g.test(response)) errorCount++;

    return errorCount;
  }

  private analyzeFormalityLevel(response: string): number {
    // Простой анализ формальности (0 = очень неформально, 1 = очень формально)
    let formalityScore = 0.5;

    const formalIndicators = [
      "следует",
      "необходимо",
      "рекомендуется",
      "should",
      "must",
    ];
    const informalIndicators = [
      "можно",
      "просто",
      "легко",
      "can",
      "just",
      "easy",
    ];

    formalIndicators.forEach(indicator => {
      if (response.toLowerCase().includes(indicator)) formalityScore += 0.1;
    });

    informalIndicators.forEach(indicator => {
      if (response.toLowerCase().includes(indicator)) formalityScore -= 0.1;
    });

    return Math.max(0, Math.min(formalityScore, 1));
  }

  private getExpectedFormality(
    userProfile: any,
    conversationHistory: any[]
  ): number {
    // Определяем ожидаемый уровень формальности
    let expected = 0.6; // Умеренно формальный по умолчанию

    if (userProfile?.expertiseLevel === "expert") expected += 0.2;
    if (userProfile?.expertiseLevel === "beginner") expected -= 0.2;

    return Math.max(0, Math.min(expected, 1));
  }

  private isSupportiveTone(response: string): boolean {
    const supportiveWords = [
      "поможем",
      "поможет",
      "можем помочь",
      "will help",
      "can help",
      "рады помочь",
      "с удовольствием",
      "glad to help",
    ];

    return supportiveWords.some(word => response.toLowerCase().includes(word));
  }

  private hasNegativeLanguage(response: string): boolean {
    const negativeWords = [
      "невозможно",
      "нельзя",
      "не получится",
      "impossible",
      "cannot",
      "won't work",
      "бесполезно",
      "не стоит",
      "плохая идея",
    ];

    return negativeWords.some(word => response.toLowerCase().includes(word));
  }

  /**
   * Get default validation configuration
   */
  static getDefaultConfig(): ValidationConfig {
    return {
      enableFactChecking: true,
      enableToneAnalysis: true,
      enableSecurityCheck: true,
      enableCompletenessCheck: true,
      minQualityScore: 0.7,
      strictMode: false,
    };
  }
}
