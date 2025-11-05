import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { WorkflowStateValues } from "../graph.state";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { LedgerGraphConfigValues } from "../../ledger-graph.builder";

@Injectable()
export class OutputPresentResultNode {
  private readonly logger = new Logger(OutputPresentResultNode.name);

  constructor(private readonly llmInitializer: ModelInitializer) {}

  async execute(
    state: WorkflowStateValues,
    config?: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<Partial<WorkflowStateValues>> {
    this.logger.log("Presenting result with attachment");

    try {
      const presentResultConfig =
        config?.configurable?.graphSettings?.presentResult;
      const modelSettings = presentResultConfig?.llmConfig;

      if (!modelSettings) {
        return this.generateFallbackResponse(state);
      }

      const model = await this.llmInitializer.initializeChatModel({
        modelId: modelSettings.modelId,
        temperature: 0.7,
      });

      // Generate friendly streaming message based on request type
      const streamingMessage = await this.generateStreamingMessage(
        state,
        model,
        config,
      );

      // Create AI message with metadata (including journalEntryId for history)
      const aiMessage = new AIMessage({
        content: streamingMessage,
        additional_kwargs: {
          metadata: {
            journalEntryId: state.metadata?.journalEntryId,
            description: state.parsedIntent?.description,
            amount: state.parsedIntent?.amount,
            debitAccount: state.resolvedAccounts?.toAccount?.name,
            creditAccount: state.resolvedAccounts?.fromAccount?.name,
            createdAt:
              state.metadata?.transactionCreatedAt || new Date().toISOString(),
          },
        },
      });

      return {
        messages: [aiMessage],
        output: {
          text: streamingMessage,
          attachments: state.attachment ? [state.attachment] : [],
        },
      };
    } catch (error) {
      this.logger.error("Result presentation failed:", error);
      return this.generateFallbackResponse(state);
    }
  }

  private async generateStreamingMessage(
    state: WorkflowStateValues,
    model: any,
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<string> {
    const requestType = state.metadata?.requestType || "TRANSACTION";
    const attachmentType = state.attachment?.type || "unknown";

    // Build context-aware prompt
    const systemPrompt = this.buildSystemPrompt(requestType, attachmentType);
    const userPrompt = this.buildUserPrompt(state, requestType);

    const result = await model.invoke(
      [
        new SystemMessage(systemPrompt),
        ...state.messages,
        new HumanMessage(userPrompt),
      ],
      config,
    );

    return result.content.toString();
  }

  private buildSystemPrompt(
    requestType: string,
    attachmentType: string,
  ): string {
    return `You are a friendly financial assistant. Generate a brief, natural message for the user.

Request type: ${requestType}
Attachment type: ${attachmentType}

Guidelines:
- Be concise (1-2 sentences)
- Be friendly and professional
- If attachment has buttons (needs confirmation), explain WHAT needs to be confirmed, don't say it's already done
- If attachment is informational (no buttons), confirm the action is complete
- Don't repeat detailed information from the attachment card
- Use appropriate language for the request type`;
  }

  private buildUserPrompt(
    state: WorkflowStateValues,
    requestType: string,
  ): string {
    // Check if this needs confirmation
    const needsConfirmation =
      state.metadata?.needsConfirmation ||
      state.attachment?.value?.buttons?.length > 0;

    // Check if batch
    const isBatch = state.metadata?.transactionCount > 1;
    const transactionCount = state.metadata?.transactionCount || 1;

    // Check for new accounts
    const hasNewAccounts =
      state.attachment?.value?.metadata?.cardType ===
        "batch_transaction_confirmation" ||
      state.attachment?.value?.metadata?.cardType ===
        "transaction_confirmation";
    const newAccountsInfo = state.attachment?.value?.fields?.find(
      (f) => f.label === "New Accounts",
    );

    if (requestType === "TRANSACTION") {
      if (needsConfirmation && isBatch && hasNewAccounts) {
        return `User wants to create ${transactionCount} transactions, but suitable accounts don't exist yet.
New accounts needed: ${newAccountsInfo?.value || "some accounts"}.
The card shows details and has confirmation buttons.
Generate a message that:
1. Explains that suitable accounts are missing
2. Mentions what new accounts will be created (don't list all details, just mention the account name)
3. Asks user to confirm to create both accounts and all transactions`;
      } else if (needsConfirmation && hasNewAccounts) {
        return `User wants to create a transaction, but suitable account doesn't exist yet.
New account needed: ${newAccountsInfo?.value || "new account"}.
Generate a message explaining that a new account will be created and asking for confirmation.`;
      } else if (needsConfirmation) {
        return `Transaction requires confirmation. Generate a message asking user to review and confirm.`;
      } else if (isBatch) {
        return `Successfully created ${transactionCount} transactions. Generate a friendly confirmation message.`;
      } else {
        return `Transaction created: ${state.parsedIntent?.description || "operation"}. Generate a friendly confirmation message.`;
      }
    }

    const messages: Record<string, string> = {
      CREATE_ACCOUNT: `Account creation requested: ${state.metadata?.accountRequest?.accountName || "new account"}. Generate a friendly confirmation message.`,
      QUERY: `Query completed. Generate a friendly message presenting the results.`,
      UNCLEAR: `Request unclear. Generate a friendly message asking for clarification.`,
    };

    return (
      messages[requestType] ||
      "Operation completed. Generate a friendly confirmation message."
    );
  }

  private generateFallbackResponse(
    state: WorkflowStateValues,
  ): Partial<WorkflowStateValues> {
    // Check if we have a success message from subgraph (e.g., from CreateTransactionsNode)
    if (state.metadata?.successMessage) {
      this.logger.log("Using success message from subgraph metadata");
      return {
        output: {
          text: state.metadata.successMessage,
          attachments: state.attachment ? [state.attachment] : [],
        },
      };
    }

    // Check attachment metadata to determine if operation is complete
    const cardType = state.attachment?.value?.metadata?.cardType;
    if (
      cardType === "transaction_success" ||
      cardType === "batch_transaction_success"
    ) {
      const transactionCount =
        state.attachment.value.metadata.transactionCount || 1;
      const accountsCreated =
        state.attachment.value.metadata.accountsCreated || 0;

      let text = `✅ Created ${transactionCount} transaction${transactionCount > 1 ? "s" : ""}`;
      if (accountsCreated > 0) {
        text += ` and ${accountsCreated} new account${accountsCreated > 1 ? "s" : ""}`;
      }

      return {
        output: {
          text,
          attachments: state.attachment ? [state.attachment] : [],
        },
      };
    }

    const requestType = state.metadata?.requestType || "TRANSACTION";

    const fallbackMessages: Record<string, string> = {
      TRANSACTION: "Please review and confirm the transaction details.",
      CREATE_ACCOUNT: "Please review the account creation details.",
      QUERY: "Here are the results of your query.",
      UNCLEAR: "Could you please clarify your request?",
    };

    const text = fallbackMessages[requestType] || "Operation completed.";

    return {
      output: {
        text,
        attachments: state.attachment ? [state.attachment] : [],
      },
    };
  }
}
