import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { TransactionStateValues } from "../transaction.state";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";

/**
 * Present Result Node - formats transaction results into user-friendly response
 */
@Injectable()
export class PresentResultNode {
  private readonly logger = new Logger(PresentResultNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: TransactionStateValues,
    config?: LangGraphRunnableConfig<any>,
  ): Promise<Partial<TransactionStateValues>> {
    this.logger.log("Presenting transaction result");

    try {
      // Check if there were errors
      if (state.hasErrors) {
        return this.generateErrorResponse(state);
      }

      // Get model settings from config
      const presentResultConfig =
        config?.configurable?.graphSettings?.presentResult;
      const modelSettings = presentResultConfig?.llmConfig;

      if (!modelSettings) {
        return this.generateFallbackResponse(state);
      }

      const model = await this.modelInitializer.initializeChatModel({
        modelId: modelSettings.modelId,
        temperature: 0.7,
      });

      // Generate friendly message based on transaction results
      const streamingMessage = await this.generateStreamingMessage(
        state,
        model,
        config,
      );

      // Create AI message with metadata
      const aiMessage = new AIMessage({
        content: streamingMessage,
        additional_kwargs: {
          metadata: {
            transactionCount: state.createdJournalEntryIds?.length || 0,
            accountsCreated: state.newAccountsNeeded?.length || 0,
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
    state: TransactionStateValues,
    model: any,
    config: LangGraphRunnableConfig<any>,
  ): Promise<string> {
    const transactionCount = state.createdJournalEntryIds?.length || 0;
    const accountsCreated = state.newAccountsNeeded?.length || 0;
    const needsConfirmation = state.needsConfirmation || false;
    const attachmentType = state.attachment?.type || "unknown";

    // Build context-aware prompt
    const systemPrompt = this.buildSystemPrompt(attachmentType);
    const userPrompt = this.buildUserPrompt(
      transactionCount,
      accountsCreated,
      needsConfirmation,
      state,
    );

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

  private buildSystemPrompt(attachmentType: string): string {
    return `You are a friendly financial assistant. Generate a brief, natural message for the user.

Attachment type: ${attachmentType}

Guidelines:
- Be concise (1-2 sentences)
- Be friendly and professional
- If attachment has buttons (needs confirmation), explain WHAT needs to be confirmed, don't say it's already done
- If attachment is informational (no buttons), confirm the action is complete
- Don't repeat detailed information from the attachment card
- Use appropriate language for the transaction type`;
  }

  private buildUserPrompt(
    transactionCount: number,
    accountsCreated: number,
    needsConfirmation: boolean,
    state: TransactionStateValues,
  ): string {
    const isBatch = transactionCount > 1;

    if (needsConfirmation) {
      if (isBatch && accountsCreated > 0) {
        return `User wants to create ${transactionCount} transactions, but suitable accounts don't exist yet.
${accountsCreated} new account(s) will be created.
The card shows details and has confirmation buttons.
Generate a message that:
1. Explains that suitable accounts are missing
2. Mentions what new accounts will be created (don't list all details, just mention count)
3. Asks user to confirm to create both accounts and all transactions`;
      } else if (accountsCreated > 0) {
        return `User wants to create a transaction, but suitable account doesn't exist yet.
${accountsCreated} new account(s) needed.
Generate a message explaining that new account(s) will be created and asking for confirmation.`;
      } else {
        return `Transaction requires confirmation. Generate a message asking user to review and confirm.`;
      }
    }

    // Transaction(s) created successfully
    if (isBatch) {
      let message = `Successfully created ${transactionCount} transactions`;
      if (accountsCreated > 0) {
        message += ` and ${accountsCreated} new account(s)`;
      }
      message += `. Generate a friendly confirmation message.`;
      return message;
    } else {
      const txDescription =
        state.parsedTransactions?.[0]?.description || "transaction";
      let message = `Transaction created: ${txDescription}`;
      if (accountsCreated > 0) {
        message += ` with ${accountsCreated} new account(s)`;
      }
      message += `. Generate a friendly confirmation message.`;
      return message;
    }
  }

  private generateErrorResponse(
    state: TransactionStateValues,
  ): Partial<TransactionStateValues> {
    const errorMessage =
      state.errorMessages?.[0] ||
      "An error occurred while processing the transaction.";

    return {
      output: {
        text: errorMessage,
        attachments: state.attachment ? [state.attachment] : [],
      },
    };
  }

  private generateFallbackResponse(
    state: TransactionStateValues,
  ): Partial<TransactionStateValues> {
    const transactionCount = state.createdJournalEntryIds?.length || 0;
    const accountsCreated = state.newAccountsNeeded?.length || 0;

    // Check if we need confirmation
    if (state.needsConfirmation) {
      return {
        output: {
          text: "Please review and confirm the transaction details.",
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

    return {
      output: {
        text: "Transaction processed successfully.",
        attachments: state.attachment ? [state.attachment] : [],
      },
    };
  }
}
