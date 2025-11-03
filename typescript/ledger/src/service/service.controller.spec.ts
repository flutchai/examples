import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ServiceController } from "./service.controller";
import { AccountService } from "./account/account.service";
import { JournalEntryService } from "./journal-entry/journal-entry.service";
import { TransactionService } from "./transaction/transaction.service";
import {
  AccountType,
  NormalBalance,
  Currency,
  TransactionType,
  JournalEntryStatus,
} from "../common/types";

describe("ServiceController", () => {
  let controller: ServiceController;
  let accountService: jest.Mocked<AccountService>;
  let journalEntryService: jest.Mocked<JournalEntryService>;
  let transactionService: jest.Mocked<TransactionService>;

  const mockAccount = {
    _id: "account-id-1",
    accountCode: "1001",
    accountName: "Cash Account",
    accountType: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
    balance: 1000,
    isActive: true,
    currency: Currency.USD,
    description: "Test account",
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue({}),
    toObject: jest.fn().mockReturnValue({}),
    toJSON: jest.fn().mockReturnValue({}),
    $isNew: false,
    $isDeleted: false,
    isNew: false,
    markModified: jest.fn(),
    id: "account-id-1",
    __v: 0,
  };

  const mockJournalEntry = {
    _id: "journal-entry-id",
    journalEntryId: "JE-2024-000001",
    date: new Date(),
    description: "Test entry",
    reference: "REF-001",
    status: JournalEntryStatus.DRAFT,
    totalDebit: 1000,
    totalCredit: 1000,
    entries: [],
    isBalanced: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
      createAccount: jest.fn(),
      getAccount: jest.fn(),
      getUserAccounts: jest.fn(),
      getAccountsByType: jest.fn(),
      updateAccount: jest.fn(),
      deactivateAccount: jest.fn(),
      setupDefaultAccounts: jest.fn(),
      getAccountBalances: jest.fn(),
      getTrialBalance: jest.fn(),
    };

    const mockJournalEntryService = {
      createJournalEntry: jest.fn(),
      getJournalEntry: jest.fn(),
      getUserJournalEntries: jest.fn(),
      updateJournalEntry: jest.fn(),
      postJournalEntry: jest.fn(),
      reverseJournalEntry: jest.fn(),
      getAccountActivity: jest.fn(),
    };

    const mockTransactionService = {
      processTransaction: jest.fn(),
      validateTransaction: jest.fn(),
      getTransactionSummary: jest.fn(),
      getTransactions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceController],
      providers: [
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: JournalEntryService,
          useValue: mockJournalEntryService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    controller = module.get<ServiceController>(ServiceController);
    accountService = module.get(AccountService);
    journalEntryService = module.get(JournalEntryService);
    transactionService = module.get(TransactionService);
  });

  describe("Account Management", () => {
    describe("createAccount", () => {
      const createAccountDto = {
        accountCode: "1001",
        accountName: "Test Account",
        accountType: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
        userId: "user-1",
        currency: Currency.USD,
      };

      it("should create account successfully", async () => {
        accountService.createAccount.mockResolvedValue(mockAccount as any);

        const result = await controller.createAccount(createAccountDto);

        expect(accountService.createAccount).toHaveBeenCalledWith(
          createAccountDto
        );
        expect(result.success).toBe(true);
        expect(result.account.accountCode).toBe("1001");
      });

      it("should handle creation errors", async () => {
        accountService.createAccount.mockRejectedValue(
          new BadRequestException("Account already exists")
        );

        const result = await controller.createAccount(createAccountDto);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Account already exists");
      });
    });

    describe("getUserAccounts", () => {
      it("should return user accounts", async () => {
        const accounts = [mockAccount];
        accountService.getUserAccounts.mockResolvedValue(accounts as any);

        const result = await controller.getUserAccounts("user-1");

        expect(accountService.getUserAccounts).toHaveBeenCalledWith("user-1");
        expect(result.success).toBe(true);
        expect(result.accounts).toHaveLength(1);
      });

      it("should return accounts by type", async () => {
        const accounts = [mockAccount];
        accountService.getAccountsByType.mockResolvedValue(accounts as any);

        const result = await controller.getUserAccounts(
          "user-1",
          AccountType.ASSET
        );

        expect(accountService.getAccountsByType).toHaveBeenCalledWith(
          "user-1",
          AccountType.ASSET
        );
        expect(result.success).toBe(true);
      });

      it("should require userId parameter", async () => {
        const result = await controller.getUserAccounts("");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });

    describe("getAccount", () => {
      it("should return specific account", async () => {
        accountService.getAccount.mockResolvedValue(mockAccount as any);

        const result = await controller.getAccount("1001", "user-1");

        expect(accountService.getAccount).toHaveBeenCalledWith(
          "1001",
          "user-1"
        );
        expect(result.success).toBe(true);
        expect(result.account.accountCode).toBe("1001");
      });

      it("should require userId parameter", async () => {
        const result = await controller.getAccount("1001", "");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });

    describe("updateAccount", () => {
      const updateDto = {
        accountName: "Updated Account",
        description: "Updated description",
        currency: Currency.EUR,
      };

      it("should update account successfully", async () => {
        const updatedAccount = { ...mockAccount, ...updateDto };
        accountService.updateAccount.mockResolvedValue(updatedAccount as any);

        const result = await controller.updateAccount(
          "1001",
          "user-1",
          updateDto
        );

        expect(accountService.updateAccount).toHaveBeenCalledWith(
          "1001",
          "user-1",
          updateDto
        );
        expect(result.success).toBe(true);
        expect(result.account.currency).toBe(Currency.EUR);
      });

      it("should require userId parameter", async () => {
        const result = await controller.updateAccount("1001", "", updateDto);

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });

    describe("deactivateAccount", () => {
      it("should deactivate account successfully", async () => {
        accountService.deactivateAccount.mockResolvedValue(undefined);

        const result = await controller.deactivateAccount("1001", "user-1");

        expect(accountService.deactivateAccount).toHaveBeenCalledWith(
          "1001",
          "user-1"
        );
        expect(result.success).toBe(true);
        expect(result.message).toContain("has been deactivated");
      });

      it("should handle deactivation errors", async () => {
        accountService.deactivateAccount.mockRejectedValue(
          new BadRequestException(
            "Cannot deactivate account with non-zero balance"
          )
        );

        const result = await controller.deactivateAccount("1001", "user-1");

        expect(result.success).toBe(false);
        expect(result.error).toContain("non-zero balance");
      });
    });

    describe("setupDefaultAccounts", () => {
      const defaultAccounts = {
        cash: mockAccount,
        equity: mockAccount,
        revenue: mockAccount,
        expense: mockAccount,
      };

      it("should setup default accounts", async () => {
        accountService.setupDefaultAccounts.mockResolvedValue(
          defaultAccounts as any
        );

        const result = await controller.setupDefaultAccounts({
          userId: "user-1",
        });

        expect(accountService.setupDefaultAccounts).toHaveBeenCalledWith(
          "user-1"
        );
        expect(result.success).toBe(true);
        expect(result.accounts).toHaveProperty("cash");
      });

      it("should require userId", async () => {
        const result = await controller.setupDefaultAccounts({ userId: "" });

        expect(result.success).toBe(false);
        expect(result.error).toBe("userId is required");
      });
    });

    describe("getAccountBalances", () => {
      const balances = [
        {
          accountCode: "1001",
          accountName: "Cash",
          accountType: AccountType.ASSET,
          balance: 1000,
          lastUpdated: new Date(),
        },
      ];

      it("should return account balances", async () => {
        accountService.getAccountBalances.mockResolvedValue(balances as any);

        const result = await controller.getAccountBalances("user-1");

        expect(accountService.getAccountBalances).toHaveBeenCalledWith(
          "user-1"
        );
        expect(result.success).toBe(true);
        expect(result.balances).toEqual(balances);
      });
    });

    describe("getTrialBalance", () => {
      const trialBalance = {
        assets: [],
        liabilities: [],
        equity: [],
        revenue: [],
        expenses: [],
        totalDebits: 1000,
        totalCredits: 1000,
        isBalanced: true,
      };

      it("should return trial balance", async () => {
        accountService.getTrialBalance.mockResolvedValue(trialBalance as any);

        const result = await controller.getTrialBalance("user-1");

        expect(accountService.getTrialBalance).toHaveBeenCalledWith("user-1");
        expect(result.success).toBe(true);
        expect(result.trialBalance.isBalanced).toBe(true);
      });
    });
  });

  describe("Transaction Management", () => {
    describe("getTransactions", () => {
      const mockTransactions = [
        {
          transactionId: "TXN-001",
          type: "DEPOSIT",
          amount: 1000,
          date: new Date(),
          description: "Initial deposit",
        },
      ];

      it("should return filtered transactions", async () => {
        transactionService.getTransactions.mockResolvedValue(
          mockTransactions as any
        );

        const result = await controller.getTransactions(
          "user-1",
          "2024-01-01",
          "2024-01-31",
          "DEPOSIT",
          "100",
          "2000",
          "10",
          "0"
        );

        expect(transactionService.getTransactions).toHaveBeenCalledWith({
          userId: "user-1",
          fromDate: new Date("2024-01-01"),
          toDate: new Date("2024-01-31"),
          transactionType: "DEPOSIT",
          minAmount: 100,
          maxAmount: 2000,
          limit: 10,
          offset: 0,
        });
        expect(result.success).toBe(true);
        expect(result.transactions).toEqual(mockTransactions);
      });

      it("should require userId parameter", async () => {
        const result = await controller.getTransactions("");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });

    describe("processTransaction", () => {
      const transactionDto = {
        userId: "user-1",
        amount: 1000,
        description: "Test transaction",
        transactionType: TransactionType.TRANSACTION,
        currency: Currency.USD,
      };

      it("should process transaction successfully", async () => {
        const validationResult = { isValid: true, errors: [] };
        const transactionResult = {
          success: true,
          transactionId: "TXN-001",
          journalEntryId: "JE-001",
          affectedAccounts: ["1001", "3001"],
        };

        transactionService.validateTransaction.mockResolvedValue(
          validationResult
        );
        transactionService.processTransaction.mockResolvedValue(
          transactionResult
        );

        const result = await controller.processTransaction(transactionDto);

        expect(transactionService.validateTransaction).toHaveBeenCalledWith(
          transactionDto
        );
        expect(transactionService.processTransaction).toHaveBeenCalledWith(
          transactionDto
        );
        expect(result).toEqual(transactionResult);
      });

      it("should return validation errors", async () => {
        const validationResult = {
          isValid: false,
          errors: ["Transaction amount must be positive"],
        };

        transactionService.validateTransaction.mockResolvedValue(
          validationResult
        );

        const result = await controller.processTransaction(transactionDto);

        expect(result.success).toBe(false);
        expect(result.error).toContain("validation failed");
      });

      it("should handle processing errors", async () => {
        const validationResult = { isValid: true, errors: [] };

        transactionService.validateTransaction.mockResolvedValue(
          validationResult
        );
        transactionService.processTransaction.mockRejectedValue(
          new Error("Database error")
        );

        const result = await controller.processTransaction(transactionDto);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Database error");
      });
    });

    describe("getTransactionSummary", () => {
      const summary = {
        totalDeposits: 5000,
        totalWithdrawals: 1000,
        totalExpenses: 500,
        totalRevenue: 3000,
        transactionCount: 10,
        netCashFlow: 4500,
      };

      it("should return transaction summary", async () => {
        transactionService.getTransactionSummary.mockResolvedValue(
          summary as any
        );

        const result = await controller.getTransactionSummary(
          "user-1",
          "2024-01-01",
          "2024-01-31"
        );

        expect(transactionService.getTransactionSummary).toHaveBeenCalledWith(
          "user-1",
          new Date("2024-01-01"),
          new Date("2024-01-31")
        );
        expect(result.success).toBe(true);
        expect(result.summary).toEqual(summary);
      });

      it("should require userId parameter", async () => {
        const result = await controller.getTransactionSummary("");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });
  });

  describe("Journal Entry Management", () => {
    describe("createJournalEntry", () => {
      const createDto = {
        userId: "user-1",
        description: "Test entry",
        reference: "REF-001",
        entries: [
          {
            accountCode: "1001",
            description: "Cash entry",
            debitAmount: 1000,
            creditAmount: 0,
          },
          {
            accountCode: "3001",
            description: "Equity entry",
            debitAmount: 0,
            creditAmount: 1000,
          },
        ],
      };

      it("should create journal entry successfully", async () => {
        journalEntryService.createJournalEntry.mockResolvedValue(
          mockJournalEntry as any
        );

        const result = await controller.createJournalEntry(createDto);

        expect(journalEntryService.createJournalEntry).toHaveBeenCalledWith(
          createDto
        );
        expect(result.success).toBe(true);
        expect(result.journalEntry.journalEntryId).toBe("JE-2024-000001");
      });

      it("should handle creation errors", async () => {
        journalEntryService.createJournalEntry.mockRejectedValue(
          new BadRequestException("Invalid journal entry")
        );

        const result = await controller.createJournalEntry(createDto);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid journal entry");
      });
    });

    describe("getUserJournalEntries", () => {
      it("should return user journal entries", async () => {
        const entries = [mockJournalEntry];
        journalEntryService.getUserJournalEntries.mockResolvedValue(
          entries as any
        );

        const result = await controller.getUserJournalEntries(
          "user-1",
          JournalEntryStatus.DRAFT,
          "10",
          "0"
        );

        expect(journalEntryService.getUserJournalEntries).toHaveBeenCalledWith(
          "user-1",
          JournalEntryStatus.DRAFT,
          10,
          0
        );
        expect(result.success).toBe(true);
        expect(result.entries).toHaveLength(1);
      });

      it("should require userId parameter", async () => {
        const result = await controller.getUserJournalEntries("");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });

    describe("getJournalEntry", () => {
      it("should return journal entry", async () => {
        journalEntryService.getJournalEntry.mockResolvedValue(
          mockJournalEntry as any
        );

        const result = await controller.getJournalEntry("JE-2024-000001");

        expect(journalEntryService.getJournalEntry).toHaveBeenCalledWith(
          "JE-2024-000001"
        );
        expect(result.success).toBe(true);
        expect(result.journalEntry.journalEntryId).toBe("JE-2024-000001");
      });
    });

    describe("updateJournalEntry", () => {
      const updateDto = {
        description: "Updated entry",
        entries: [
          {
            accountCode: "1001",
            description: "Updated cash entry",
            debitAmount: 1500,
            creditAmount: 0,
          },
          {
            accountCode: "3001",
            description: "Updated equity entry",
            debitAmount: 0,
            creditAmount: 1500,
          },
        ],
      };

      it("should update journal entry successfully", async () => {
        const updatedEntry = { ...mockJournalEntry, ...updateDto };
        journalEntryService.updateJournalEntry.mockResolvedValue(
          updatedEntry as any
        );

        const result = await controller.updateJournalEntry(
          "JE-2024-000001",
          updateDto
        );

        expect(journalEntryService.updateJournalEntry).toHaveBeenCalledWith(
          "JE-2024-000001",
          updateDto
        );
        expect(result.success).toBe(true);
      });

      it("should handle update errors", async () => {
        journalEntryService.updateJournalEntry.mockRejectedValue(
          new BadRequestException("Can only update draft entries")
        );

        const result = await controller.updateJournalEntry(
          "JE-2024-000001",
          updateDto
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Can only update draft entries");
      });
    });

    describe("postJournalEntry", () => {
      it("should post journal entry successfully", async () => {
        const postResult = {
          success: true,
          journalEntryId: "JE-2024-000001",
          affectedAccounts: ["1001", "3001"],
        };
        journalEntryService.postJournalEntry.mockResolvedValue(
          postResult as any
        );

        const result = await controller.postJournalEntry("JE-2024-000001");

        expect(journalEntryService.postJournalEntry).toHaveBeenCalledWith(
          "JE-2024-000001"
        );
        expect(result).toEqual(postResult);
      });

      it("should handle posting errors", async () => {
        const errorResult = {
          success: false,
          error: "Entry validation failed",
          affectedAccounts: [],
        };
        journalEntryService.postJournalEntry.mockResolvedValue(
          errorResult as any
        );

        const result = await controller.postJournalEntry("JE-2024-000001");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Entry validation failed");
      });
    });

    describe("reverseJournalEntry", () => {
      it("should reverse journal entry successfully", async () => {
        const reverseResult = {
          success: true,
          journalEntryId: "JE-2024-000002",
          affectedAccounts: ["1001", "3001"],
        };
        journalEntryService.reverseJournalEntry.mockResolvedValue(
          reverseResult as any
        );

        const result = await controller.reverseJournalEntry("JE-2024-000001", {
          reason: "Correction needed",
        });

        expect(journalEntryService.reverseJournalEntry).toHaveBeenCalledWith(
          "JE-2024-000001",
          "Correction needed"
        );
        expect(result).toEqual(reverseResult);
      });

      it("should require reversal reason", async () => {
        const result = await controller.reverseJournalEntry("JE-2024-000001", {
          reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe("Reversal reason is required");
      });
    });

    describe("getAccountActivity", () => {
      it("should return account activity", async () => {
        const entries = [mockJournalEntry];
        journalEntryService.getAccountActivity.mockResolvedValue(
          entries as any
        );

        const result = await controller.getAccountActivity(
          "1001",
          "user-1",
          "2024-01-01",
          "2024-01-31"
        );

        expect(journalEntryService.getAccountActivity).toHaveBeenCalledWith(
          "user-1",
          "1001",
          new Date("2024-01-01"),
          new Date("2024-01-31")
        );
        expect(result.success).toBe(true);
        expect(result.entries).toHaveLength(1);
      });

      it("should require userId parameter", async () => {
        const result = await controller.getAccountActivity("1001", "");

        expect(result.success).toBe(false);
        expect(result.error).toContain("userId parameter is required");
      });
    });
  });
});
