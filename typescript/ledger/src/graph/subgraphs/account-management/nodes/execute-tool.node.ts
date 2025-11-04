import { Injectable, Inject } from "@nestjs/common";
import { ToolMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { z } from "zod";
import {
  CHART_OF_ACCOUNTS_SHORT,
  validateAccountCode,
} from "../../../../common/account-code-rules";
import { AccountManagementStateValues } from "../account-management.subgraph";

/**
 * Execute Tool Node - handles account management operations using LLM with tool binding
 */
@Injectable()
export class ExecuteToolNode {
  constructor(
    @Inject("AccountService") private readonly accountService: any,
    private readonly modelInitializer: ModelInitializer
  ) {}

  async execute(
    state: AccountManagementStateValues,
    config: LangGraphRunnableConfig<any>
  ): Promise<Partial<AccountManagementStateValues>> {
    const userId = state.userId;
    const messages = state.messages || [];

    // Get LLM config from graphSettings
    const accountMgmtConfig =
      config.configurable?.graphSettings?.accountManagement;
    const modelSettings = accountMgmtConfig?.llmConfig;

    if (!modelSettings) {
      throw new Error("Account management LLM configuration not found");
    }

    // Initialize LLM with config
    const model = await this.modelInitializer.initializeChatModel({
      modelId: modelSettings.modelId,
      temperature: modelSettings.temperature || 0.1,
      maxTokens: modelSettings.maxTokens || 2000,
    });

    if (!model) {
      throw new Error("LLM not found in context");
    }

    // Create tools with userId bound
    const tools = this.createTools(userId);

    // Bind tools to model
    const modelWithTools = model.bindTools(tools);

    // First call: model decides which tool to call
    const response = await modelWithTools.invoke(messages, config);

    // Check if model wants to call tools
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(
        `[EXECUTE_TOOL] Executing ${response.tool_calls.length} tool calls`
      );

      // Execute tool calls and create ToolMessage objects
      const toolMessages: ToolMessage[] = [];

      for (const toolCall of response.tool_calls) {
        const tool = tools.find((t: any) => t.name === toolCall.name);

        if (!tool) {
          console.warn(`[EXECUTE_TOOL] Tool not found: ${toolCall.name}`);
          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify({
                error: `Tool ${toolCall.name} not found`,
              }),
            })
          );
          continue;
        }

        try {
          console.log(`[EXECUTE_TOOL] Executing tool: ${toolCall.name}`);
          const result = await tool.invoke(toolCall.args, config);

          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: result,
            })
          );

          console.log(
            `[EXECUTE_TOOL] Tool ${toolCall.name} executed successfully`
          );
        } catch (error: any) {
          console.error(
            `[EXECUTE_TOOL] Tool ${toolCall.name} failed:`,
            error.message
          );

          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify({ error: error.message }),
            })
          );
        }
      }

      // Return messages with tool call response and tool results
      return {
        messages: [response, ...toolMessages],
      };
    }

    // No tool calls, return response directly
    return {
      messages: [response],
    };
  }

  private createTools(userId: string): any[] {
    // Import DynamicStructuredTool dynamically to avoid TypeScript compilation issues
    const { DynamicStructuredTool } = require("@langchain/core/tools");

    return [
      this.createListAccountsTool(userId, DynamicStructuredTool),
      this.createCreateAccountTool(userId, DynamicStructuredTool),
      this.createUpdateAccountTool(userId, DynamicStructuredTool),
    ];
  }

  private createListAccountsTool(
    userId: string,
    DynamicStructuredTool: any
  ): any {
    const schema = z.object({
      accountType: z
        .enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
        .optional()
        .describe("Optional: filter accounts by type"),
    });

    return new DynamicStructuredTool({
      name: "list_accounts",
      description:
        "Get a list of all accounts for the user. Optionally filter by account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE).",
      schema,
      func: async (input: Record<string, any>): Promise<string> => {
        // Use getUserAccounts for all accounts, or getAccountsByType for filtered
        const accounts = input.accountType
          ? await this.accountService.getAccountsByType(
              userId,
              input.accountType
            )
          : await this.accountService.getUserAccounts(userId);

        if (accounts.length === 0) {
          return input.accountType
            ? `No accounts found with type ${input.accountType}`
            : "No accounts found";
        }

        return JSON.stringify(
          accounts.map((acc: any) => ({
            code: acc.accountCode,
            name: acc.accountName,
            type: acc.accountType,
            currency: acc.currency,
            balance: acc.balance,
          })),
          null,
          2
        );
      },
    });
  }

  private createCreateAccountTool(
    userId: string,
    DynamicStructuredTool: any
  ): any {
    const schema = z.object({
      code: z
        .string()
        .describe(
          `Account code following the chart of accounts numbering system: ${CHART_OF_ACCOUNTS_SHORT} (e.g., '1010' for Cash, '5100' for Salaries)`
        ),
      name: z
        .string()
        .describe("Account name (e.g., 'Cash in Bank', 'AWS Expenses')"),
      type: z
        .enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
        .describe("Account type"),
      currency: z
        .string()
        .default("USD")
        .describe("Account currency (default: USD)"),
      parentCode: z
        .string()
        .optional()
        .describe("Optional: parent account code for hierarchical structure"),
    });

    return new DynamicStructuredTool({
      name: "create_account",
      description: `Create a new account with specified code, name, type, and currency. Account codes must follow the chart of accounts numbering: ${CHART_OF_ACCOUNTS_SHORT}.`,
      schema,
      func: async (input: Record<string, any>): Promise<string> => {
        try {
          // Validate account code using shared validation function
          const validation = validateAccountCode(input.code, input.type);
          if (!validation.isValid) {
            throw new Error(validation.error);
          }

          // Determine normalBalance based on account type
          // ASSET and EXPENSE have DEBIT normal balance
          // LIABILITY, EQUITY, and REVENUE have CREDIT normal balance
          const normalBalance =
            input.type === "ASSET" || input.type === "EXPENSE"
              ? "DEBIT"
              : "CREDIT";

          const account = await this.accountService.createAccount({
            userId,
            accountCode: input.code,
            accountName: input.name,
            accountType: input.type,
            normalBalance,
            currency: input.currency || "USD",
            parentAccountCode: input.parentCode,
          });

          return `Successfully created account: ${account.accountCode} - ${account.accountName}`;
        } catch (error: any) {
          throw new Error(`Failed to create account: ${error.message}`);
        }
      },
    });
  }

  private createUpdateAccountTool(
    userId: string,
    DynamicStructuredTool: any
  ): any {
    const schema = z.object({
      code: z.string().describe("Account code to update"),
      name: z.string().optional().describe("New account name"),
      parentCode: z.string().optional().describe("New parent account code"),
    });

    return new DynamicStructuredTool({
      name: "update_account",
      description:
        "Update an existing account's name or parent. You cannot change the account code or type.",
      schema,
      func: async (input: Record<string, any>): Promise<string> => {
        try {
          const updateDto: any = {};
          if (input.name) updateDto.accountName = input.name;
          if (input.parentCode) updateDto.parentAccountCode = input.parentCode;

          const account = await this.accountService.updateAccount(
            input.code,
            userId,
            updateDto
          );

          return `Successfully updated account: ${account.accountCode} - ${account.accountName}`;
        } catch (error: any) {
          throw new Error(`Failed to update account: ${error.message}`);
        }
      },
    });
  }
}
