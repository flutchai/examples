export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE",
}

export enum NormalBalance {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

export enum JournalEntryStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
  REVERSED = "REVERSED",
}

export enum TransactionType {
  TRANSACTION = "TRANSACTION",
}

export enum Currency {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  RUB = "RUB",
  CNY = "CNY",
  JPY = "JPY",
  CHF = "CHF",
  CAD = "CAD",
  AUD = "AUD",
}

export interface CreateAccountDto {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  userId: string;
  parentAccount?: string;
  description?: string;
  currency?: string;
}

export interface UpdateAccountDto {
  accountName?: string;
  description?: string;
  currency?: string;
}

export interface CreateTransactionDto {
  userId: string;
  amount: number;
  description: string;
  transactionType: TransactionType;
  reference?: string;
  fromAccountCode?: string;
  toAccountCode?: string;
  currency?: Currency;
}

export interface JournalEntryLineDto {
  accountCode: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  currency?: Currency;
}

export interface CreateJournalEntryDto {
  userId: string;
  description: string;
  reference?: string;
  date?: Date | string;
  entries: JournalEntryLineDto[];
  currency?: Currency;
  status?: JournalEntryStatus;
  tags?: string[];
}

export interface UpdateJournalEntryDto {
  description?: string;
  reference?: string;
  entries?: JournalEntryLineDto[];
}

export interface BalanceQueryDto {
  userId: string;
  accountCode?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  journalEntryId?: string;
  affectedAccounts: string[];
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface GetTransactionsDto {
  userId: string;
  fromDate?: Date;
  toDate?: Date;
  transactionType?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

export interface AccountBalance {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  lastUpdated: Date;
}
