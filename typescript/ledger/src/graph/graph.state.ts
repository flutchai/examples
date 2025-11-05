import { Annotation } from "@langchain/langgraph";
// Removed UsageRecorder imports - now using context-based pattern
import { BaseGraphState } from "@flutchai/flutch-sdk";
import { BaseMessage } from "@langchain/core/messages";
import { TransactionType } from "../common/types";

/** Workflow step tracking */
export type WorkflowStep =
  | "parse_intent"
  | "resolve_accounts"
  | "build_transaction"
  | "validate_transaction"
  | "present_result"
  | "completed";

/** Input data for the workflow */
export interface WorkflowInput {
  userId: string;
  amount: number;
  description: string;
  transactionType?: TransactionType;
  fromAccountCode?: string;
  toAccountCode?: string;
  reference?: string;
}

/** Workflow progress tracking */
export interface WorkflowProgress {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  hasErrors: boolean;
  errorMessages: string[];
  startedAt: string;
  completedAt?: string;
}

/** Parsed transaction intent */
export interface AccountIntentHint {
  rawInput?: string;
  code?: string;
  name?: string;
  confidence?: number;
  matchType?: "code" | "name" | "alias" | "inferred";
}

export interface ParsedIntent {
  transactionType: TransactionType;
  amount: number;
  description: string;
  userId: string;
  confidence: number;
  reasoning: string;
  extractedAmount?: number;
  /** Currency of the transaction derived from selected accounts */
  currency?: string;
  extractedDate?: string;
  keywords?: string[];
  /** Flag indicating whether user confirmation of date is required */
  dateNeedsConfirmation?: boolean;
  /** Direct account hints extracted from the user text */
  fromAccountHint?: AccountIntentHint;
  toAccountHint?: AccountIntentHint;
}

/** Resolved accounts for transaction */
export interface ResolvedAccounts {
  fromAccount?: {
    code: string;
    name: string;
    type: string;
    isNew?: boolean; // Flag to indicate account needs to be created
    currency?: string;
  };
  toAccount?: {
    code: string;
    name: string;
    type: string;
    isNew?: boolean; // Flag to indicate account needs to be created
    currency?: string;
  };
  defaultAccountsUsed: boolean;
}

/** Built transaction ready for processing */
export interface BuiltTransaction {
  transactionId: string;
  journalEntryLines: Array<{
    accountCode: string;
    description: string;
    debitAmount: number;
    creditAmount: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

/** Validation results */
export interface ValidationResults {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  accountsVerified: boolean;
  balanceChecked: boolean;
}

/** Complete workflow state */
export interface StructuredWorkflowState extends BaseGraphState {
  input: WorkflowInput;
  progress: WorkflowProgress;
  parsedIntent?: ParsedIntent;
  resolvedAccounts?: ResolvedAccounts;
  builtTransaction?: BuiltTransaction;
  validation?: ValidationResults;
  output?: {
    text: string;
    attachments?: any[];
    metadata?: Record<string, any>;
  };
  metadata: Record<string, any>;
  // usageRecorder moved to context - access via (config as any)?.configurable?.context?.usageRecorder
}

/** Utility functions for workflow state management */
export class WorkflowStateUtils {
  static createInitialState(input: WorkflowInput): StructuredWorkflowState {
    return {
      input,
      progress: {
        currentStep: "parse_intent",
        completedSteps: [],
        hasErrors: false,
        errorMessages: [],
        startedAt: new Date().toISOString(),
      },
      metadata: {},
      // usageRecorder moved to context
    };
  }

  static advanceStep(
    state: StructuredWorkflowState,
    nextStep: WorkflowStep,
  ): Partial<StructuredWorkflowState> {
    const completed = state.progress.completedSteps.includes(
      state.progress.currentStep,
    )
      ? state.progress.completedSteps
      : [...state.progress.completedSteps, state.progress.currentStep];

    return {
      progress: {
        ...state.progress,
        currentStep: nextStep,
        completedSteps: completed,
      },
    };
  }

  static addError(
    state: StructuredWorkflowState,
    error: string,
  ): Partial<StructuredWorkflowState> {
    return {
      progress: {
        ...state.progress,
        hasErrors: true,
        errorMessages: [...state.progress.errorMessages, error],
      },
    };
  }

  static markCompleted(
    state: StructuredWorkflowState,
  ): Partial<StructuredWorkflowState> {
    return {
      progress: {
        ...state.progress,
        currentStep: "completed",
        completedAt: new Date().toISOString(),
      },
    };
  }

  static updateMetadata(
    state: StructuredWorkflowState,
    updates: Record<string, any>,
  ): Partial<StructuredWorkflowState> {
    return {
      metadata: { ...state.metadata, ...updates },
    };
  }
}

/**
 * LangGraph Annotation state definition for workflow coordination
 * Main graph state - delegates to subgraphs for specific tasks
 */
export const WorkflowState = Annotation.Root({
  // Top-level userId for subgraph propagation
  // LangGraph automatically passes matching field names to subgraphs
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  input: Annotation<WorkflowInput>({
    reducer: (_, next) => next,
    default: () => ({
      userId: "",
      amount: 0,
      description: "",
    }),
  }),

  progress: Annotation<WorkflowProgress>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({
      currentStep: "parse_intent",
      completedSteps: [],
      hasErrors: false,
      errorMessages: [],
      startedAt: new Date().toISOString(),
    }),
  }),

  parsedIntent: Annotation<ParsedIntent>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  resolvedAccounts: Annotation<ResolvedAccounts>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  builtTransaction: Annotation<BuiltTransaction>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  validation: Annotation<ValidationResults>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  output: Annotation<{
    text: string;
    attachments?: any[];
    buttons?: any[];
    metadata?: Record<string, any>;
  }>({
    reducer: (state, update) => update || state,
    default: () => ({ text: "", attachments: [], metadata: {} }),
  }),

  metadata: Annotation<Record<string, any>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),

  // usageRecorder moved to context - access via (config as any)?.configurable?.context?.usageRecorder

  // LLM Analysis results for account suggestions
  llmAnalysis: Annotation<any>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Attachment generated by build nodes (transaction card, account form, etc.)
  attachment: Annotation<any>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Whether accounts have been resolved
  accountsResolved: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Message history for context-aware conversations
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...(state || []), ...(update || [])],
    default: () => [],
  }),
});

export type WorkflowStateValues = typeof WorkflowState.State;
