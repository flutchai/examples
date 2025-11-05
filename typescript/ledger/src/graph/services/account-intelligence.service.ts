import {
  ACCOUNT_CODE_RANGES,
  CHART_OF_ACCOUNTS_SYSTEM_PROMPT,
} from "../../common/account-code-rules";
import { Injectable, Logger } from "@nestjs/common";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  TransactionType,
  AccountType,
  NormalBalance,
} from "../../common/types";
import { Account } from "../../service/account/account.entity";

// Zod schema for structured LLM response
export const AccountAnalysisSchema = z.object({
  transactionAnalysis: z.object({
    category: z
      .string()
      .describe("Transaction category (salary, rent, investments, etc)"),
    mainKeywords: z.array(z.string()).describe("Keywords from description"),
    confidence: z.number().min(0).max(1).describe("Analysis confidence"),
  }),

  suggestedAccounts: z.object({
    debitAccount: z.object({
      existingAccountCode: z
        .string()
        .nullable()
        .describe("Existing account code if found"),
      newAccountSuggestion: z
        .object({
          accountCode: z.string().describe("Suggested account code"),
          accountName: z.string().describe("Suggested account name"),
          accountType: z.nativeEnum(AccountType),
          normalBalance: z.nativeEnum(NormalBalance),
          reasoning: z
            .string()
            .describe("Explanation why this account is suitable"),
        })
        .nullable(),
    }),

    creditAccount: z.object({
      existingAccountCode: z.string().nullable(),
      newAccountSuggestion: z
        .object({
          accountCode: z.string(),
          accountName: z.string(),
          accountType: z.nativeEnum(AccountType),
          normalBalance: z.nativeEnum(NormalBalance),
          reasoning: z.string(),
        })
        .nullable(),
    }),
  }),

  recommendation: z.object({
    action: z.enum(["use_existing", "create_new", "user_choice"]),
    confidence: z.number().min(0).max(1),
    explanation: z.string().describe("Recommendation explanation for user"),
  }),
});

export type AccountAnalysis = z.infer<typeof AccountAnalysisSchema>;

// Batch account analysis schema
export const BatchAccountAnalysisSchema = z.object({
  accountMappings: z.array(
    z.object({
      transactionIndex: z
        .number()
        .describe("Index of transaction in input array"),
      fromAccount: z.object({
        name: z.string(),
        code: z.string(),
        type: z.nativeEnum(AccountType),
        exists: z.boolean().describe("Does this account already exist?"),
      }),
      toAccount: z.object({
        name: z.string(),
        code: z.string(),
        type: z.nativeEnum(AccountType),
        exists: z.boolean().describe("Does this account already exist?"),
      }),
      reasoning: z.string().optional().describe("Why these accounts?"),
    }),
  ),
  newAccountsNeeded: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        type: z.nativeEnum(AccountType),
      }),
    )
    .describe("Unique list of new accounts to create"),
  overallReasoning: z
    .string()
    .describe("General strategy for account selection"),
});

export type BatchAccountAnalysis = z.infer<typeof BatchAccountAnalysisSchema>;

@Injectable()
export class AccountIntelligenceService {
  private readonly logger = new Logger(AccountIntelligenceService.name);

  constructor(private readonly llmInitializer: ModelInitializer) {}

  /**
   * Analyze multiple transactions at once for account selection
   * More efficient than analyzing each transaction separately
   */
  async analyzeBatchTransactions(
    transactions: Array<{
      userInput: string;
      amount: number;
      currency: string;
      date?: string;
      tags?: string[];
    }>,
    existingAccounts: Account[],
    modelSettings: any,
    usageRecorder: any,
    currentDate: string,
  ): Promise<BatchAccountAnalysis> {
    this.logger.log(
      `Analyzing batch of ${transactions.length} transactions for accounts`,
    );

    this.logger.debug(`Model settings: ${JSON.stringify(modelSettings)}`);

    const systemPrompt = this.buildBatchSystemPrompt(
      existingAccounts,
      currentDate,
    );
    const userPrompt = this.buildBatchUserPrompt(transactions);

    this.logger.debug(
      `System prompt length: ${systemPrompt.length}, User prompt length: ${userPrompt.length}`,
    );

    try {
      const modelId = modelSettings?.modelId;
      const temperature = modelSettings?.temperature || 0.3;
      const maxTokens = modelSettings?.maxTokens || 4000;

      if (!modelId) {
        throw new Error("modelId is required in modelSettings");
      }

      const model = await this.llmInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      this.logger.debug(
        "About to invoke LLM for batch analysis WITHOUT structured output...",
      );

      // Try calling model directly without withStructuredOutput
      let rawResult: any = null;

      try {
        this.logger.debug("Calling model.invoke() directly...");

        const jsonSchema = `
REQUIRED JSON RESPONSE FORMAT:
{
  "accountMappings": [
    {
      "transactionIndex": number,
      "fromAccount": {
        "name": "string - account name",
        "code": "string - account code",
        "type": "ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE",
        "exists": boolean
      },
      "toAccount": {
        "name": "string - account name",
        "code": "string - account code",
        "type": "ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE",
        "exists": boolean
      },
      "reasoning": "string - optional explanation"
    }
  ],
  "newAccountsNeeded": [
    {
      "code": "string",
      "name": "string",
      "type": "ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE"
    }
  ],
  "overallReasoning": "string"
}

CRITICAL: Respond ONLY with valid JSON in this exact format. No markdown, no extra text.`;

        rawResult = await model.invoke([
          new SystemMessage(systemPrompt + "\n\n" + jsonSchema),
          new HumanMessage(userPrompt),
        ]);

        this.logger.debug(
          `Model returned: ${rawResult ? "HAS_RAW_RESULT" : "NO_RAW_RESULT"}`,
        );
        this.logger.debug(`Raw result type: ${typeof rawResult}`);
      } catch (invokeError) {
        this.logger.error("Model invoke failed:", invokeError);
        throw invokeError;
      }

      // Parse the result manually
      let result: { parsed: BatchAccountAnalysis; raw: any } | null = null;

      try {
        this.logger.debug(
          `Raw result keys: ${JSON.stringify(Object.keys(rawResult || {}))}`,
        );

        const content =
          rawResult?.content || rawResult?.text || JSON.stringify(rawResult);
        this.logger.debug(
          `Attempting to parse content length: ${content?.length || 0}`,
        );
        this.logger.debug(`Content preview: ${content.substring(0, 500)}`);

        // Extract JSON from markdown code blocks if present
        let jsonStr = content;
        if (typeof content === "string") {
          // Try to extract JSON from ```json ... ``` blocks
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
            this.logger.debug("Extracted JSON from code block");
          }
        }

        const parsed =
          typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;

        result = {
          parsed: parsed,
          raw: rawResult,
        };

        this.logger.debug(
          `Successfully parsed result with ${parsed.accountMappings?.length || 0} mappings`,
        );
      } catch (parseError) {
        this.logger.error("Failed to parse LLM response:", parseError);
        this.logger.error(
          "Raw response structure:",
          JSON.stringify(rawResult).substring(0, 1000),
        );
        throw new Error(
          `Failed to parse batch analysis result: ${parseError.message}`,
        );
      }

      if (!result || !result.parsed) {
        this.logger.error(
          "LLM output was incomplete. Raw content:",
          result?.raw?.content,
        );
        throw new Error(
          "LLM returned incomplete result for batch account analysis",
        );
      }

      this.logger.log(
        `Batch analysis complete: ${result.parsed.newAccountsNeeded.length} new accounts needed`,
      );

      return result.parsed;
    } catch (error) {
      this.logger.error("Batch account analysis failed:", error);
      throw new Error(`Batch account analysis failed: ${error.message}`);
    }
  }

  async analyzeTransactionForAccounts(
    userInput: string,
    amount: number,
    currency: string,
    existingAccounts: Account[],
    modelSettings: any,
    usageRecorder: any,
    currentDate: string,
  ): Promise<AccountAnalysis> {
    // Transaction analysis debug logging removed

    const systemPrompt = this.buildSystemPrompt(existingAccounts, currentDate);
    const userPrompt = this.buildUserPrompt(userInput, amount, currency);

    try {
      const modelId = modelSettings?.modelId;
      const temperature = modelSettings?.temperature;
      const maxTokens = modelSettings?.maxTokens || 4000;

      if (!modelId) {
        throw new Error("modelId is required in modelSettings");
      }

      // Model config debug logging removed

      const model = await this.llmInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      const llmWithStructure = (model as any).withStructuredOutput(
        AccountAnalysisSchema,
        { name: "account_analyzer", includeRaw: true },
      );

      const result = (await llmWithStructure.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])) as { parsed: AccountAnalysis; raw: any };

      // Result debug logging removed

      if (!result || !result.parsed) {
        this.logger.error(
          "LLM output was incomplete. Raw content:",
          result?.raw?.content,
        );
        throw new Error("LLM returned incomplete result for account analysis");
      }

      return result.parsed;
    } catch (error) {
      this.logger.error("Account analysis failed:", error);
      throw new Error(`Account analysis failed: ${error.message}`);
    }
  }

  private buildBatchSystemPrompt(
    existingAccounts: Account[],
    currentDate: string,
  ): string {
    return `
You are an accounting and double-entry bookkeeping expert analyzing MULTIPLE transactions at once.

CURRENT DATE: ${currentDate}

TASK: Analyze ALL transactions and suggest correct accounts for each one, ensuring consistency.

USER'S EXISTING ACCOUNTS:
${
  existingAccounts.length > 0
    ? existingAccounts
        .map(
          (acc) =>
            `${acc.accountCode} - ${acc.accountName} (${acc.accountType})`,
        )
        .join("\n")
    : "No existing accounts except base accounts (Cash, Equity, Revenue, Expense)"
}

DOUBLE-ENTRY PRINCIPLES:
- DEBIT increases: Assets (ASSET), Expenses (EXPENSE)
- CREDIT increases: Liabilities (LIABILITY), Equity (EQUITY), Revenue (REVENUE)

${CHART_OF_ACCOUNTS_SYSTEM_PROMPT}

INSTRUCTIONS:
1. Analyze ALL transactions as a group
2. Use SAME accounts for similar transactions (e.g., all AWS expenses → IT Expenses)
3. Prefer existing accounts when appropriate (set exists=true)
4. Only suggest new accounts when necessary (set exists=false)
5. Provide consistent account codes for new accounts
6. Use account names in the SAME LANGUAGE as transaction descriptions

IMPORTANT: Return accountMappings array with SAME LENGTH as input transactions.
Each mapping must have transactionIndex matching the input array index.
`;
  }

  private buildBatchUserPrompt(
    transactions: Array<{
      userInput: string;
      amount: number;
      currency: string;
      date?: string;
      tags?: string[];
    }>,
  ): string {
    const txList = transactions
      .map((tx, idx) => {
        const dateStr = tx.date ? ` | Date: ${tx.date}` : "";
        const tagsStr =
          tx.tags && tx.tags.length > 0 ? ` | Tags: ${tx.tags.join(", ")}` : "";
        return `${idx}. ${tx.userInput} | ${tx.amount} ${tx.currency}${dateStr}${tagsStr}`;
      })
      .join("\n");

    return `
BATCH OF ${transactions.length} TRANSACTIONS:

${txList}

For each transaction above:
1. Determine debit and credit accounts
2. Check if accounts exist or need to be created
3. Use consistent naming for similar transactions
4. Return mapping with correct transactionIndex

Ensure:
- accountMappings.length === ${transactions.length}
- Each mapping has unique transactionIndex (0 to ${transactions.length - 1})
- newAccountsNeeded contains unique accounts only (no duplicates)
- Account names match transaction language
`;
  }

  private buildSystemPrompt(
    existingAccounts: Account[],
    currentDate: string,
  ): string {
    return `
You are an accounting and double-entry bookkeeping expert with deep understanding of modern business processes.

CURRENT DATE: ${currentDate}

TASK: Analyze the transaction and suggest correct accounts for double-entry bookkeeping.

USER'S EXISTING ACCOUNTS:
${
  existingAccounts.length > 0
    ? existingAccounts
        .map(
          (acc) =>
            `${acc.accountCode} - ${acc.accountName} (${acc.accountType})`,
        )
        .join("\n")
    : "No existing accounts except base accounts (Cash, Equity, Revenue, Expense)"
}

DOUBLE-ENTRY PRINCIPLES:
- DEBIT increases: Assets (ASSET), Expenses (EXPENSE)
- CREDIT increases: Liabilities (LIABILITY), Equity (EQUITY), Revenue (REVENUE)
- DEBIT decreases: Liabilities, Equity, Revenue
- CREDIT decreases: Assets, Expenses

${CHART_OF_ACCOUNTS_SYSTEM_PROMPT}

CODE GENERATION RULES:
- For new accounts use the next available code in the appropriate range
- If there are similar accounts (e.g., 5001, 5002), continue the numbering
- For specific categories use logical grouping (e.g., 5100-5199 for salaries)

INSTRUCTIONS:
1. Carefully analyze the transaction description
2. Determine the economic substance of the operation
3. Find suitable existing accounts with high confidence (confidence > 0.8)
4. If no suitable accounts exist - suggest creating new ones with logical names
5. Ensure the entry follows double-entry principles
6. Provide a clear and understandable explanation of your decision

IMPORTANT: Use account names in the SAME LANGUAGE as the transaction description.
- If description is in English → use English account names (e.g., "Rental Income")
- If description is in Russian → use Russian account names (e.g., "Rental Income" in Russian)

COMMON TRANSACTION PATTERNS:
- Income/Revenue: Usually Debit Cash/Bank, Credit Revenue Account
- Expenses: Usually Debit Expense Account, Credit Cash/Bank
- Transfers: Debit recipient account, Credit sender account
- Purchases: Debit Asset/Expense, Credit Cash/Payable
    `;
  }

  private buildUserPrompt(
    userInput: string,
    amount: number,
    currency: string,
  ): string {
    return `
USER INPUT:
"${userInput}"

TRANSACTION AMOUNT: ${amount} ${currency}

STEP-BY-STEP ANALYSIS:

1. DETERMINE ECONOMIC SUBSTANCE:
   - What happened in this transaction?
   - Which resources increased/decreased?

2. CHOOSE STRATEGY:
   - use_existing: if there are perfectly matching accounts (confidence > 0.8)
   - create_new: if new specific accounts are needed (confidence > 0.7)
   - user_choice: if uncertain or multiple options (confidence < 0.7)

3. BUILD THE ENTRY:
   - Debit: which account increases
   - Credit: which account decreases
   - Verify compliance with double-entry principles

4. CREATE CLEAR NAMES (in the same language as description):
   - For EXPENSE: "Expense for [category]" or similar in the transaction language
   - For ASSET: specific asset name
   - For REVENUE: revenue source
   - Avoid generic names like "Other expenses" or similar vague terms

5. EXPLANATION:
   - Briefly and clearly explain the entry logic
   - Indicate why you chose these specific accounts

IMPORTANT: Be consistent in choosing accounts for similar transactions.
    `;
  }

  /**
   * Generates the next available account code in the specified range
   */
  generateNextAccountCode(
    accountType: string,
    existingAccounts: Account[],
  ): string {
    const range = ACCOUNT_CODE_RANGES[accountType as AccountType];
    if (!range) {
      throw new Error(`Unknown account type: ${accountType}`);
    }

    // Find all existing codes in this range
    const existingCodes = existingAccounts
      .filter((acc) => acc.accountType === accountType)
      .map((acc) => parseInt(acc.accountCode))
      .filter(
        (code) => !isNaN(code) && code >= range.start && code <= range.end,
      )
      .sort((a, b) => a - b);

    // If no existing codes, start from beginning of range + 1
    if (existingCodes.length === 0) {
      return String(range.start + 1);
    }

    // Find first available code
    let nextCode = range.start + 1;
    for (const code of existingCodes) {
      if (nextCode === code) {
        nextCode++;
      } else {
        break;
      }
    }

    // Check that we haven't exceeded range boundaries
    if (nextCode > range.end) {
      throw new Error(
        `No available account codes in range ${range.start}-${range.end}`,
      );
    }

    return String(nextCode);
  }
}
