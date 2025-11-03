import {
  AccountType,
  NormalBalance,
  Currency,
  JournalEntryStatus,
  TransactionType,
} from "./types";

export class TestDataFactory {
  static createMockAccount(overrides: Partial<any> = {}) {
    return {
      _id: "account-id-1",
      accountCode: "1001",
      accountName: "Test Account",
      accountType: AccountType.ASSET,
      normalBalance: NormalBalance.DEBIT,
      balance: 1000,
      userId: "user-1",
      isActive: true,
      currency: Currency.USD,
      description: "Test account description",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      isDebitAccount: () => true,
      isCreditAccount: () => false,
      canBeDebited: () => true,
      canBeCredited: () => false,
      displayName: "1001 - Test Account",
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
      $isNew: false,
      $isDeleted: false,
      isNew: false,
      markModified: jest.fn(),
      id: "account-id-1",
      __v: 0,
      ...overrides,
    };
  }

  static createMockJournalEntry(overrides: Partial<any> = {}) {
    return {
      _id: "journal-entry-id",
      journalEntryId: "JE-2024-000001",
      userId: "user-1",
      description: "Test journal entry",
      reference: "REF-001",
      status: JournalEntryStatus.DRAFT,
      totalDebit: 1000,
      totalCredit: 1000,
      currency: Currency.USD,
      date: new Date("2024-01-01T00:00:00.000Z"),
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      entries: [
        {
          accountId: "account-id-1",
          accountCode: "1001",
          accountName: "Cash Account",
          description: "Cash entry",
          debitAmount: 1000,
          creditAmount: 0,
          lineNumber: 1,
          currency: Currency.USD,
        },
        {
          accountId: "account-id-2",
          accountCode: "3001",
          accountName: "Equity Account",
          description: "Equity entry",
          debitAmount: 0,
          creditAmount: 1000,
          lineNumber: 2,
          currency: Currency.USD,
        },
      ],
      isBalanced: true,
      isDraft: true,
      isPosted: false,
      isReversed: false,
      validateEntry: () => [],
      calculateTotals: () => ({ totalDebit: 1000, totalCredit: 1000 }),
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
      $isNew: false,
      $isDeleted: false,
      isNew: false,
      markModified: jest.fn(),
      id: "journal-entry-id",
      __v: 0,
      ...overrides,
    };
  }

  static createMockTransaction(overrides: Partial<any> = {}) {
    return {
      transactionId: "TXN-001",
      journalEntryId: "JE-2024-000001",
      date: new Date("2024-01-01T00:00:00.000Z"),
      description: "Test transaction",
      reference: "REF-001",
      type: TransactionType.TRANSACTION,
      amount: 1000,
      status: JournalEntryStatus.POSTED,
      currency: Currency.USD,
      entries: [
        {
          accountCode: "1001",
          accountName: "Cash",
          description: "Cash deposit",
          debitAmount: 1000,
          creditAmount: 0,
        },
        {
          accountCode: "3001",
          accountName: "Equity",
          description: "Equity increase",
          debitAmount: 0,
          creditAmount: 1000,
        },
      ],
      ...overrides,
    };
  }

  static createDefaultAccounts() {
    return {
      cash: this.createMockAccount({
        accountCode: "1001",
        accountName: "Cash",
        accountType: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
      }),
      equity: this.createMockAccount({
        _id: "account-id-2",
        accountCode: "3001",
        accountName: "Owner's Equity",
        accountType: AccountType.EQUITY,
        normalBalance: NormalBalance.CREDIT,
        isDebitAccount: () => false,
        isCreditAccount: () => true,
        canBeDebited: () => false,
        canBeCredited: () => true,
      }),
      revenue: this.createMockAccount({
        _id: "account-id-3",
        accountCode: "4001",
        accountName: "Service Revenue",
        accountType: AccountType.REVENUE,
        normalBalance: NormalBalance.CREDIT,
        isDebitAccount: () => false,
        isCreditAccount: () => true,
        canBeDebited: () => false,
        canBeCredited: () => true,
      }),
      expense: this.createMockAccount({
        _id: "account-id-4",
        accountCode: "5001",
        accountName: "General Expense",
        accountType: AccountType.EXPENSE,
        normalBalance: NormalBalance.DEBIT,
      }),
    };
  }

  static createValidJournalEntryDto() {
    return {
      userId: "user-1",
      description: "Test journal entry",
      reference: "REF-001",
      currency: Currency.USD,
      entries: [
        {
          accountCode: "1001",
          description: "Cash entry",
          debitAmount: 1000,
          creditAmount: 0,
          currency: Currency.USD,
        },
        {
          accountCode: "3001",
          description: "Equity entry",
          debitAmount: 0,
          creditAmount: 1000,
          currency: Currency.USD,
        },
      ],
    };
  }

  static createValidTransactionDto(
    type: TransactionType = TransactionType.TRANSACTION
  ) {
    return {
      userId: "user-1",
      amount: 1000,
      description: "Test transaction",
      transactionType: type,
      reference: "REF-001",
      currency: Currency.USD,
      fromAccountCode:
        type === TransactionType.TRANSACTION ? "1001" : undefined,
      toAccountCode: type === TransactionType.TRANSACTION ? "1002" : undefined,
    };
  }

  static createValidAccountDto() {
    return {
      accountCode: "1001",
      accountName: "Test Account",
      accountType: AccountType.ASSET,
      normalBalance: NormalBalance.DEBIT,
      userId: "user-1",
      currency: Currency.USD,
      description: "Test account description",
    };
  }

  static createAccountBalance() {
    return {
      accountCode: "1001",
      accountName: "Test Account",
      accountType: AccountType.ASSET,
      balance: 1000,
      lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
    };
  }

  static createTrialBalance() {
    return {
      assets: [this.createAccountBalance()],
      liabilities: [],
      equity: [
        {
          ...this.createAccountBalance(),
          accountCode: "3001",
          accountName: "Equity",
          accountType: AccountType.EQUITY,
        },
      ],
      revenue: [],
      expenses: [],
      totalDebits: 1000,
      totalCredits: 1000,
      isBalanced: true,
    };
  }

  static createTransactionSummary() {
    return {
      totalDeposits: 5000,
      totalWithdrawals: 1000,
      totalExpenses: 500,
      totalRevenue: 3000,
      transactionCount: 10,
      netCashFlow: 4500,
    };
  }

  static createValidationResult(
    isValid: boolean = true,
    errors: string[] = []
  ) {
    return {
      isValid,
      errors,
      warnings: [],
    };
  }

  static createTransactionResult(success: boolean = true) {
    if (success) {
      return {
        success: true,
        transactionId: "TXN-001",
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["1001", "3001"],
      };
    } else {
      return {
        success: false,
        error: "Transaction failed",
        affectedAccounts: [],
      };
    }
  }
}

export class MockRepositoryFactory {
  static createAccountRepository() {
    return {
      create: jest.fn(),
      findByCode: jest.fn(),
      findById: jest.fn(),
      findByUser: jest.fn(),
      findByType: jest.fn(),
      updateBalance: jest.fn(),
      incrementBalance: jest.fn(),
      findOrCreateDefaultAccounts: jest.fn(),
      deactivate: jest.fn(),
      update: jest.fn(),
      getTotalsByType: jest.fn(),
    };
  }

  static createJournalEntryRepository() {
    return {
      create: jest.fn(),
      findByJournalEntryId: jest.fn(),
      findById: jest.fn(),
      findByUser: jest.fn(),
      findByReference: jest.fn(),
      findByDateRange: jest.fn(),
      post: jest.fn(),
      reverse: jest.fn(),
      getDraftCount: jest.fn(),
      getAccountActivity: jest.fn(),
      update: jest.fn(),
    };
  }
}

export class MockServiceFactory {
  static createAccountService() {
    return {
      createAccount: jest.fn(),
      getAccount: jest.fn(),
      getUserAccounts: jest.fn(),
      getAccountsByType: jest.fn(),
      updateAccount: jest.fn(),
      deactivateAccount: jest.fn(),
      setupDefaultAccounts: jest.fn(),
      getAccountBalances: jest.fn(),
      getTrialBalance: jest.fn(),
      updateAccountBalance: jest.fn(),
      adjustAccountBalance: jest.fn(),
      validateTransaction: jest.fn(),
    };
  }

  static createJournalEntryService() {
    return {
      createJournalEntry: jest.fn(),
      getJournalEntry: jest.fn(),
      getUserJournalEntries: jest.fn(),
      updateJournalEntry: jest.fn(),
      postJournalEntry: jest.fn(),
      reverseJournalEntry: jest.fn(),
      getAccountActivity: jest.fn(),
      validateJournalEntry: jest.fn(),
      getDraftEntriesCount: jest.fn(),
      getJournalEntriesByReference: jest.fn(),
      getJournalEntriesInDateRange: jest.fn(),
    };
  }

  static createTransactionService() {
    return {
      processTransaction: jest.fn(),
      validateTransaction: jest.fn(),
      getTransactionSummary: jest.fn(),
      getTransactions: jest.fn(),
    };
  }
}

export const TestConstants = {
  USER_ID: "user-1",
  ACCOUNT_CODE: "1001",
  JOURNAL_ENTRY_ID: "JE-2024-000001",
  TRANSACTION_ID: "TXN-001",
  REFERENCE: "REF-001",
  DESCRIPTION: "Test transaction",
  AMOUNT: 1000,
  DATES: {
    START_OF_YEAR: new Date("2024-01-01T00:00:00.000Z"),
    END_OF_YEAR: new Date("2024-12-31T23:59:59.999Z"),
    TODAY: new Date(),
  },
  CURRENCIES: [Currency.USD, Currency.EUR, Currency.GBP],
  ACCOUNT_TYPES: [
    AccountType.ASSET,
    AccountType.LIABILITY,
    AccountType.EQUITY,
    AccountType.REVENUE,
    AccountType.EXPENSE,
  ],
  TRANSACTION_TYPES: [
    TransactionType.TRANSACTION,
    TransactionType.TRANSACTION,
    TransactionType.TRANSACTION,
    TransactionType.TRANSACTION,
    TransactionType.TRANSACTION,
    TransactionType.TRANSACTION,
  ],
};

export const TestHelpers = {
  /**
   * Create a date in the past by specified number of days
   */
  daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  },

  /**
   * Create a date in the future by specified number of days
   */
  daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  },

  /**
   * Generate a unique account code
   */
  generateAccountCode(prefix: string = "1"): string {
    const suffix = Math.floor(Math.random() * 999)
      .toString()
      .padStart(3, "0");
    return `${prefix}${suffix}`;
  },

  /**
   * Generate a unique journal entry ID
   */
  generateJournalEntryId(): string {
    const year = new Date().getFullYear();
    const number = Math.floor(Math.random() * 999999)
      .toString()
      .padStart(6, "0");
    return `JE-${year}-${number}`;
  },

  /**
   * Generate a unique transaction ID
   */
  generateTransactionId(): string {
    const timestamp = Date.now();
    return `TXN-${timestamp}`;
  },

  /**
   * Check if two numbers are approximately equal (for floating point comparisons)
   */
  isApproximatelyEqual(
    a: number,
    b: number,
    tolerance: number = 0.01
  ): boolean {
    return Math.abs(a - b) < tolerance;
  },

  /**
   * Wait for a specified number of milliseconds (for testing async operations)
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Validate journal entry balance
   */
  isJournalEntryBalanced(
    entries: Array<{ debitAmount: number; creditAmount: number }>
  ): boolean {
    const totalDebit = entries.reduce(
      (sum, entry) => sum + entry.debitAmount,
      0
    );
    const totalCredit = entries.reduce(
      (sum, entry) => sum + entry.creditAmount,
      0
    );
    return this.isApproximatelyEqual(totalDebit, totalCredit);
  },

  /**
   * Create a balanced journal entry with random amounts
   */
  createBalancedJournalEntry(amount: number = 1000) {
    return [
      {
        accountCode: "1001",
        description: "Debit entry",
        debitAmount: amount,
        creditAmount: 0,
        currency: Currency.USD,
      },
      {
        accountCode: "3001",
        description: "Credit entry",
        debitAmount: 0,
        creditAmount: amount,
        currency: Currency.USD,
      },
    ];
  },
};
