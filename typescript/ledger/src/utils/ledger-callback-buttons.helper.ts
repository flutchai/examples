import { CallbackStore } from "@flutchai/flutch-sdk";

// Types from @amelie/shared-types (temporarily using any until types are properly exported)
const ButtonType = { INLINE: "inline" } as const;
type IInlineButton = any;

/**
 * Utility for creating callback buttons in Ledger graphs
 *
 * Uses CallbackStore for automatic token creation
 * with metadata support (userId, threadId, agentId)
 *
 * Used during graph execution to create interactive elements.
 */

/**
 * Creates single callback button for ledger graph
 */
export async function createLedgerCallbackButton(
  store: CallbackStore,
  handler: string,
  text: string,
  userId: string,
  params: Record<string, any> = {},
  options: { threadId?: string; agentId?: string; metadata?: any } = {},
): Promise<IInlineButton> {
  const token = await store.issue({
    graphType: "ledger::1.0.0",
    handler,
    userId,
    threadId: options.threadId,
    agentId: options.agentId,
    params,
    metadata: options.metadata,
  });

  return {
    text,
    type: ButtonType.INLINE,
    value: token,
  };
}

/**
 * Creates set of buttons for transaction management
 */
export async function createTransactionActionButtons(
  store: CallbackStore,
  userId: string,
  transactionId: string,
  options: {
    threadId?: string;
    agentId?: string;
    amount?: number;
    description?: string;
    metadata?: any;
  } = {},
): Promise<IInlineButton[]> {
  const baseParams = {
    transactionId,
    amount: options.amount,
    description: options.description,
  };

  const baseOptions = {
    threadId: options.threadId,
    agentId: options.agentId,
    metadata: options.metadata,
  };

  return Promise.all([
    createLedgerCallbackButton(
      store,
      "approve-transaction",
      "✅ Approve",
      userId,
      baseParams,
      baseOptions,
    ),
    createLedgerCallbackButton(
      store,
      "reject-transaction",
      "❌ Reject",
      userId,
      baseParams,
      baseOptions,
    ),
    createLedgerCallbackButton(
      store,
      "get-transaction-details",
      "📊 Details",
      userId,
      { transactionId },
      baseOptions,
    ),
  ]);
}

/**
 * Creates button for changing transaction category
 */
export async function createCategoryButton(
  store: CallbackStore,
  userId: string,
  transactionId: string,
  newCategory: string,
  options: {
    threadId?: string;
    agentId?: string;
    metadata?: any;
  } = {},
): Promise<IInlineButton> {
  return createLedgerCallbackButton(
    store,
    "update-category",
    `📂 ${newCategory}`,
    userId,
    { transactionId, newCategory },
    options,
  );
}

/**
 * Universal function for creating button of any type
 */
export async function createLedgerButton(
  store: CallbackStore,
  handler: string,
  text: string,
  userId: string,
  params: Record<string, any> = {},
  options: { threadId?: string; agentId?: string; metadata?: any } = {},
): Promise<IInlineButton> {
  return createLedgerCallbackButton(
    store,
    handler,
    text,
    userId,
    params,
    options,
  );
}
