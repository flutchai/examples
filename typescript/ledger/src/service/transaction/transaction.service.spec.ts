import { Test, TestingModule } from "@nestjs/testing";
import { TransactionService } from "./transaction.service";
import { AccountService } from "../account/account.service";
import { JournalEntryService } from "../journal-entry/journal-entry.service";
import { TransactionType, Currency } from "../../common/types";

describe("TransactionService", () => {
  let service: TransactionService;
  let accountService: jest.Mocked<AccountService>;
  let journalEntryService: jest.Mocked<JournalEntryService>;

  const mockDefaultAccounts = {
    cash: {
      accountCode: "1001",
      accountName: "Cash",
      _id: "account-id-1",
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
    },
    equity: {
      accountCode: "3001",
      accountName: "Owner's Equity",
      _id: "account-id-2",
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
    },
    revenue: {
      accountCode: "4001",
      accountName: "Service Revenue",
      _id: "account-id-3",
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
    },
    expense: {
      accountCode: "5001",
      accountName: "General Expense",
      _id: "account-id-4",
      save: jest.fn().mockResolvedValue({}),
      toObject: jest.fn().mockReturnValue({}),
      toJSON: jest.fn().mockReturnValue({}),
    },
  };

  const mockJournalEntry = {
    _id: "journal-entry-id",
    journalEntryId: "JE-2024-000001",
    userId: "user-1",
    description: "Test transaction",
    status: "DRAFT",
    entries: [],
    save: jest.fn().mockResolvedValue({}),
    toObject: jest.fn().mockReturnValue({}),
    toJSON: jest.fn().mockReturnValue({}),
    $isNew: false,
    $isDeleted: false,
    isNew: false,
    markModified: jest.fn(),
    id: "journal-entry-id",
    __v: 0,
  };

  beforeEach(async () => {
    const mockAccountService = {
      setupDefaultAccounts: jest.fn(),
      validateTransaction: jest.fn(),
      getAccount: jest.fn(),
    };

    const mockJournalEntryService = {
      createJournalEntry: jest.fn(),
      postJournalEntry: jest.fn(),
      getJournalEntriesInDateRange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: JournalEntryService,
          useValue: mockJournalEntryService,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    accountService = module.get(AccountService);
    journalEntryService = module.get(JournalEntryService);
  });

  describe("processTransaction", () => {
    const depositDto = {
      userId: "user-1",
      amount: 1000,
      description: "Initial deposit",
      transactionType: TransactionType.TRANSACTION,
      currency: Currency.USD,
    };

    it("should process deposit transaction successfully", async () => {
      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: true,
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["1001", "3001"],
      });

      const result = await service.processTransaction(depositDto);

      expect(accountService.setupDefaultAccounts).toHaveBeenCalledWith(
        "user-1"
      );
      expect(journalEntryService.createJournalEntry).toHaveBeenCalledWith({
        userId: "user-1",
        description: "Initial deposit",
        reference: undefined,
        currency: Currency.USD,
        entries: [
          {
            accountCode: "1001",
            description: "Cash deposit: Initial deposit",
            debitAmount: 1000,
            creditAmount: 0,
            currency: Currency.USD,
          },
          {
            accountCode: "3001",
            description: "Equity increase: Initial deposit",
            debitAmount: 0,
            creditAmount: 1000,
            currency: Currency.USD,
          },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.affectedAccounts).toEqual(["1001", "3001"]);
    });

    it("should process withdrawal transaction successfully", async () => {
      const withdrawalDto = {
        ...depositDto,
        transactionType: TransactionType.TRANSACTION,
        description: "Cash withdrawal",
      };

      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: true,
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["3001", "1001"],
      });

      const result = await service.processTransaction(withdrawalDto);

      expect(journalEntryService.createJournalEntry).toHaveBeenCalledWith({
        userId: "user-1",
        description: "Cash withdrawal",
        reference: undefined,
        currency: Currency.USD,
        entries: [
          {
            accountCode: "3001",
            description: "Equity decrease: Cash withdrawal",
            debitAmount: 1000,
            creditAmount: 0,
            currency: Currency.USD,
          },
          {
            accountCode: "1001",
            description: "Cash withdrawal: Cash withdrawal",
            debitAmount: 0,
            creditAmount: 1000,
            currency: Currency.USD,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should process expense transaction successfully", async () => {
      const expenseDto = {
        ...depositDto,
        transactionType: TransactionType.TRANSACTION,
        description: "Office supplies",
      };

      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: true,
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["5001", "1001"],
      });

      const result = await service.processTransaction(expenseDto);

      expect(journalEntryService.createJournalEntry).toHaveBeenCalledWith({
        userId: "user-1",
        description: "Office supplies",
        reference: undefined,
        currency: Currency.USD,
        entries: [
          {
            accountCode: "5001",
            description: "Expense: Office supplies",
            debitAmount: 1000,
            creditAmount: 0,
            currency: Currency.USD,
          },
          {
            accountCode: "1001",
            description: "Cash payment: Office supplies",
            debitAmount: 0,
            creditAmount: 1000,
            currency: Currency.USD,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should process receipt transaction successfully", async () => {
      const receiptDto = {
        ...depositDto,
        transactionType: TransactionType.TRANSACTION,
        description: "Service payment received",
      };

      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: true,
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["1001", "4001"],
      });

      const result = await service.processTransaction(receiptDto);

      expect(journalEntryService.createJournalEntry).toHaveBeenCalledWith({
        userId: "user-1",
        description: "Service payment received",
        reference: undefined,
        currency: Currency.USD,
        entries: [
          {
            accountCode: "1001",
            description: "Cash received: Service payment received",
            debitAmount: 1000,
            creditAmount: 0,
            currency: Currency.USD,
          },
          {
            accountCode: "4001",
            description: "Revenue: Service payment received",
            debitAmount: 0,
            creditAmount: 1000,
            currency: Currency.USD,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should process transfer transaction successfully", async () => {
      const transferDto = {
        ...depositDto,
        transactionType: TransactionType.TRANSACTION,
        description: "Account transfer",
        fromAccountCode: "1001",
        toAccountCode: "1002",
      };

      const fromAccount = {
        accountCode: "1001",
        accountName: "Cash",
        _id: "account-id-1",
        save: jest.fn().mockResolvedValue({}),
        toObject: jest.fn().mockReturnValue({}),
      };
      const toAccount = {
        accountCode: "1002",
        accountName: "Savings",
        _id: "account-id-2",
        save: jest.fn().mockResolvedValue({}),
        toObject: jest.fn().mockReturnValue({}),
      };

      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      accountService.getAccount
        .mockResolvedValueOnce(fromAccount as any)
        .mockResolvedValueOnce(toAccount as any);
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: true,
        journalEntryId: "JE-2024-000001",
        affectedAccounts: ["1002", "1001"],
      });

      const result = await service.processTransaction(transferDto);

      expect(accountService.getAccount).toHaveBeenCalledWith("1001", "user-1");
      expect(accountService.getAccount).toHaveBeenCalledWith("1002", "user-1");
      expect(result.success).toBe(true);
    });

    it("should return error when posting fails", async () => {
      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.createJournalEntry.mockResolvedValue(
        mockJournalEntry as any
      );
      journalEntryService.postJournalEntry.mockResolvedValue({
        success: false,
        error: "Balance validation failed",
        affectedAccounts: [],
      });

      const result = await service.processTransaction(depositDto);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Balance validation failed");
    });

    it("should handle errors gracefully", async () => {
      accountService.setupDefaultAccounts.mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await service.processTransaction(depositDto);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection failed");
    });
  });

  describe("validateTransaction", () => {
    it("should validate transaction successfully", async () => {
      const validDto = {
        userId: "user-1",
        amount: 100,
        description: "Test transaction",
        transactionType: TransactionType.TRANSACTION,
      };

      const result = await service.validateTransaction(validDto);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return error for non-positive amount", async () => {
      const invalidDto = {
        userId: "user-1",
        amount: -100,
        description: "Test transaction",
        transactionType: TransactionType.TRANSACTION,
      };

      const result = await service.validateTransaction(invalidDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Transaction amount must be positive");
    });

    it("should validate transfer transaction with missing accounts", async () => {
      const transferDto = {
        userId: "user-1",
        amount: 100,
        description: "Transfer",
        transactionType: TransactionType.TRANSACTION,
        fromAccountCode: undefined,
        toAccountCode: "1002",
      };

      const result = await service.validateTransaction(transferDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Transfer requires both from and to account codes"
      );
    });

    it("should validate transfer to same account", async () => {
      const transferDto = {
        userId: "user-1",
        amount: 100,
        description: "Transfer",
        transactionType: TransactionType.TRANSACTION,
        fromAccountCode: "1001",
        toAccountCode: "1001",
      };

      const result = await service.validateTransaction(transferDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Cannot transfer to the same account");
    });
  });

  describe("getTransactionSummary", () => {
    const mockJournalEntries = [
      {
        journalEntryId: "JE-001",
        entries: [
          { accountCode: "1001", debitAmount: 1000, creditAmount: 0 },
          { accountCode: "3001", debitAmount: 0, creditAmount: 1000 },
        ],
      },
      {
        journalEntryId: "JE-002",
        entries: [
          { accountCode: "5001", debitAmount: 500, creditAmount: 0 },
          { accountCode: "1001", debitAmount: 0, creditAmount: 500 },
        ],
      },
    ] as any;

    it("should return transaction summary", async () => {
      accountService.setupDefaultAccounts.mockResolvedValue(
        mockDefaultAccounts as any
      );
      journalEntryService.getJournalEntriesInDateRange.mockResolvedValue(
        mockJournalEntries as any
      );

      const result = await service.getTransactionSummary("user-1");

      expect(result.totalDeposits).toBe(1000);
      expect(result.totalExpenses).toBe(500);
      expect(result.netCashFlow).toBe(500);
      expect(result.transactionCount).toBe(2);
    });
  });

  describe("getTransactions", () => {
    const mockJournalEntries = [
      {
        journalEntryId: "JE-001",
        date: new Date("2024-01-01"),
        description: "Initial deposit",
        reference: "REF-001",
        status: "POSTED",
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
      },
    ] as any;

    it("should return filtered transactions", async () => {
      journalEntryService.getJournalEntriesInDateRange.mockResolvedValue(
        mockJournalEntries as any
      );

      const filters = {
        userId: "user-1",
        fromDate: new Date("2024-01-01"),
        toDate: new Date("2024-01-31"),
        limit: 10,
        offset: 0,
      };

      const result = await service.getTransactions(filters);

      expect(result).toHaveLength(1);
      expect(result[0].transactionId).toBe("TXN-JE-001");
      expect(result[0].type).toBe("DEPOSIT");
      expect(result[0].amount).toBe(1000);
    });

    it("should filter transactions by type", async () => {
      journalEntryService.getJournalEntriesInDateRange.mockResolvedValue(
        mockJournalEntries as any
      );

      const filters = {
        userId: "user-1",
        transactionType: "DEPOSIT",
        limit: 10,
        offset: 0,
      };

      const result = await service.getTransactions(filters);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("DEPOSIT");
    });

    it("should filter transactions by amount range", async () => {
      journalEntryService.getJournalEntriesInDateRange.mockResolvedValue(
        mockJournalEntries as any
      );

      const filters = {
        userId: "user-1",
        minAmount: 500,
        maxAmount: 1500,
        limit: 10,
        offset: 0,
      };

      const result = await service.getTransactions(filters);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1000);
    });
  });
});
