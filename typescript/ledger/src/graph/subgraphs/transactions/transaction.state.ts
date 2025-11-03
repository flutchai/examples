import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { AccountType, NormalBalance } from "../../../common/types";

/**
 * Single parsed transaction intent
 */
export interface ParsedTransaction {
  description: string;
  amount: number;
  date?: string;
  currency?: string;
  tags?: string[];
}

/**
 * Account mapping for a transaction
 */
export interface AccountMapping {
  debitAccount: {
    code: string;
    name: string;
    type: AccountType;
    exists: boolean;
  };
  creditAccount: {
    code: string;
    name: string;
    type: AccountType;
    exists: boolean;
  };
  reasoning?: string;
}

/**
 * New account that needs to be created
 */
export interface NewAccountSpec {
  code: string;
  name: string;
  type: AccountType;
  normalBalance?: NormalBalance;
  currency?: string;
}

/**
 * Confirmed transaction ready for creation
 */
export interface ConfirmedTransaction {
  description: string;
  amount: number;
  date: string;
  currency: string;
  tags: string[];
  debitAccountCode: string;
  creditAccountCode: string;
}

/**
 * User's response to account confirmation
 */
export interface UserConfirmation {
  action: "approve" | "cancel" | "edit";
  accountChanges?: Array<{
    originalName: string;
    newName: string;
    reasoning?: string;
  }>;
  rawText?: string; // If user just typed text instead of structured response
}

/**
 * State for Transactions subgraph
 */
export const TransactionState = Annotation.Root({
  // Input from parent graph
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  description: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  // Parsed transactions (from analyze node)
  parsedTransactions: Annotation<ParsedTransaction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Is this a batch of transactions?
  isBatch: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Account mappings (from build node)
  accountMappings: Annotation<AccountMapping[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // New accounts that need to be created
  newAccountsNeeded: Annotation<NewAccountSpec[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Whether confirmation is needed
  needsConfirmation: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // User's confirmation response (from interrupt)
  userConfirmation: Annotation<UserConfirmation | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Final confirmed transactions (after applying edits)
  confirmedTransactions: Annotation<ConfirmedTransaction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Created journal entry IDs
  createdJournalEntryIds: Annotation<string[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  // Error tracking
  hasErrors: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  errorMessages: Annotation<string[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),

  // Metadata
  metadata: Annotation<Record<string, any>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),

  // Attachment to be returned to user (card with transaction details)
  attachment: Annotation<any>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Output text to be sent to user (especially important for interrupts)
  outputText: Annotation<string>({
    reducer: (_, next) => next || "",
    default: () => "",
  }),

  // Output for parent graph (matches parent WorkflowState.output structure)
  output: Annotation<{
    text: string;
    attachments?: any[];
  }>({
    reducer: (_, next) => next,
    default: () => ({ text: "", attachments: [] }),
  }),
});

export type TransactionStateValues = typeof TransactionState.State;
