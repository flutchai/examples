import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AccountService } from "./account.service";
import { AccountRepository } from "./account.repository";
import { Account } from "./account.entity";
import { AccountType, NormalBalance, Currency } from "../../common/types";

describe("AccountService", () => {
  let service: AccountService;
  let repository: jest.Mocked<AccountRepository>;

  const mockAccount = {
    _id: "account-id-1",
    accountCode: "1001",
    accountName: "Cash Account",
    accountType: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
    balance: 1000,
    userId: "user-1",
    isActive: true,
    currency: Currency.USD,
    description: "Test account",
    createdAt: new Date(),
    updatedAt: new Date(),
    displayName: "1001 - Cash Account",
    canBeDebited: () => true,
    canBeCredited: () => false,
    isDebitAccount: () => true,
    isCreditAccount: () => false,
    save: jest.fn().mockResolvedValue({}),
    toObject: jest.fn().mockReturnValue({}),
    toJSON: jest.fn().mockReturnValue({}),
    $isNew: false,
    $isDeleted: false,
    $isDirty: jest.fn().mockReturnValue(false),
    $isModified: jest.fn().mockReturnValue(false),
    $isDefault: jest.fn().mockReturnValue(false),
    $isValid: jest.fn().mockReturnValue(true),
    $isEmpty: jest.fn().mockReturnValue(false),
    isNew: false,
    isModified: jest.fn().mockReturnValue(false),
    markModified: jest.fn(),
    populate: jest.fn().mockResolvedValue({}),
    populated: jest.fn(),
    depopulate: jest.fn(),
    validateSync: jest.fn(),
    validate: jest.fn().mockResolvedValue({}),
    errors: {},
    id: "account-id-1",
    __v: 0,
    $__: {},
  } as unknown as Account;

  beforeEach(async () => {
    const mockRepository = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: AccountRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    repository = module.get(AccountRepository);
  });

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
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockAccount as any);

      const result = await service.createAccount(createAccountDto);

      expect(repository.findByCode).toHaveBeenCalledWith("1001", "user-1");
      expect(repository.create).toHaveBeenCalledWith(createAccountDto);
      expect(result).toEqual(mockAccount);
    });

    it("should throw BadRequestException for invalid account code", async () => {
      const invalidDto = { ...createAccountDto, accountCode: "invalid" };

      await expect(service.createAccount(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if account already exists", async () => {
      repository.findByCode.mockResolvedValue(mockAccount as any);

      await expect(service.createAccount(createAccountDto)).rejects.toThrow(
        "Account with code 1001 already exists",
      );
    });
  });

  describe("getAccount", () => {
    it("should return account if found", async () => {
      repository.findByCode.mockResolvedValue(mockAccount as any);

      const result = await service.getAccount("1001", "user-1");

      expect(repository.findByCode).toHaveBeenCalledWith("1001", "user-1");
      expect(result).toEqual(mockAccount);
    });

    it("should throw NotFoundException if account not found", async () => {
      repository.findByCode.mockResolvedValue(null);

      await expect(service.getAccount("1001", "user-1")).rejects.toThrow(
        NotFoundException,
      );
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
      repository.findByCode.mockResolvedValue(mockAccount as any);
      repository.update.mockResolvedValue(updatedAccount as any);

      const result = await service.updateAccount("1001", "user-1", updateDto);

      expect(repository.findByCode).toHaveBeenCalledWith("1001", "user-1");
      expect(repository.update).toHaveBeenCalledWith("account-id-1", updateDto);
      expect(result).toEqual(updatedAccount);
    });

    it("should throw NotFoundException if account not found", async () => {
      repository.findByCode.mockResolvedValue(null);

      await expect(
        service.updateAccount("1001", "user-1", updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deactivateAccount", () => {
    it("should deactivate account with zero balance", async () => {
      const zeroBalanceAccount = { ...mockAccount, balance: 0 };
      repository.findByCode.mockResolvedValue(zeroBalanceAccount as any);
      repository.deactivate.mockResolvedValue(undefined);

      await service.deactivateAccount("1001", "user-1");

      expect(repository.findByCode).toHaveBeenCalledWith("1001", "user-1");
      expect(repository.deactivate).toHaveBeenCalledWith("account-id-1");
    });

    it("should throw BadRequestException for non-zero balance", async () => {
      repository.findByCode.mockResolvedValue(mockAccount as any);

      await expect(service.deactivateAccount("1001", "user-1")).rejects.toThrow(
        "Cannot deactivate account with non-zero balance",
      );
    });
  });

  describe("validateTransaction", () => {
    it("should return valid result for valid transaction", async () => {
      const fromAccount = { ...mockAccount, accountCode: "1001", balance: 500 };
      const toAccount = {
        ...mockAccount,
        accountCode: "3001",
        accountType: AccountType.EQUITY,
        canBeCredited: () => true,
      };

      repository.findByCode
        .mockResolvedValueOnce(fromAccount as any)
        .mockResolvedValueOnce(toAccount as any);

      const result = await service.validateTransaction(
        "1001",
        "3001",
        100,
        "user-1",
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return invalid result for insufficient funds", async () => {
      const fromAccount = { ...mockAccount, accountCode: "1001", balance: 50 };
      const toAccount = {
        ...mockAccount,
        accountCode: "3001",
        accountType: AccountType.EQUITY,
      };

      repository.findByCode
        .mockResolvedValueOnce(fromAccount as any)
        .mockResolvedValueOnce(toAccount as any);

      const result = await service.validateTransaction(
        "1001",
        "3001",
        100,
        "user-1",
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Insufficient funds in account 1001");
    });

    it("should return invalid result for non-positive amount", async () => {
      const result = await service.validateTransaction(
        "1001",
        "3001",
        -100,
        "user-1",
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Transaction amount must be positive");
    });
  });

  describe("getTrialBalance", () => {
    it("should return trial balance with all account types", async () => {
      const accounts = [
        { ...mockAccount, accountType: AccountType.ASSET, balance: 1000 },
        { ...mockAccount, accountType: AccountType.LIABILITY, balance: 500 },
        { ...mockAccount, accountType: AccountType.EQUITY, balance: 300 },
        { ...mockAccount, accountType: AccountType.REVENUE, balance: 100 },
        { ...mockAccount, accountType: AccountType.EXPENSE, balance: 200 },
      ];

      repository.findByUser.mockResolvedValue(accounts as any);

      const result = await service.getTrialBalance("user-1");

      expect(result.assets).toHaveLength(1);
      expect(result.liabilities).toHaveLength(1);
      expect(result.equity).toHaveLength(1);
      expect(result.revenue).toHaveLength(1);
      expect(result.expenses).toHaveLength(1);
      expect(result.totalDebits).toBe(1200); // Assets + Expenses
      expect(result.totalCredits).toBe(900); // Liabilities + Equity + Revenue
      expect(result.isBalanced).toBe(false);
    });
  });

  describe("setupDefaultAccounts", () => {
    it("should setup default accounts", async () => {
      const defaultAccounts = {
        cash: mockAccount,
        equity: mockAccount,
        revenue: mockAccount,
        expense: mockAccount,
      };

      repository.findOrCreateDefaultAccounts.mockResolvedValue(
        defaultAccounts as any,
      );

      const result = await service.setupDefaultAccounts("user-1");

      expect(repository.findOrCreateDefaultAccounts).toHaveBeenCalledWith(
        "user-1",
      );
      expect(result).toEqual(defaultAccounts);
    });
  });

  describe("getUserAccounts", () => {
    it("should return user accounts", async () => {
      const accounts = [mockAccount];
      repository.findByUser.mockResolvedValue(accounts as any);

      const result = await service.getUserAccounts("user-1");

      expect(repository.findByUser).toHaveBeenCalledWith("user-1");
      expect(result).toEqual(accounts);
    });
  });

  describe("getAccountsByType", () => {
    it("should return accounts by type", async () => {
      const accounts = [mockAccount];
      repository.findByType.mockResolvedValue(accounts as any);

      const result = await service.getAccountsByType(
        "user-1",
        AccountType.ASSET,
      );

      expect(repository.findByType).toHaveBeenCalledWith(
        "user-1",
        AccountType.ASSET,
      );
      expect(result).toEqual(accounts);
    });
  });

  describe("adjustAccountBalance", () => {
    it("should adjust account balance", async () => {
      const adjustedAccount = { ...mockAccount, balance: 1100 };
      repository.incrementBalance.mockResolvedValue(adjustedAccount as any);

      const result = await service.adjustAccountBalance("account-id-1", 100);

      expect(repository.incrementBalance).toHaveBeenCalledWith(
        "account-id-1",
        100,
      );
      expect(result).toEqual(adjustedAccount);
    });

    it("should throw NotFoundException if account not found", async () => {
      repository.incrementBalance.mockResolvedValue(null);

      await expect(
        service.adjustAccountBalance("account-id-1", 100),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
