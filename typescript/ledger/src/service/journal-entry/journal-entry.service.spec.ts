import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JournalEntryService } from "./journal-entry.service";
import { JournalEntryRepository } from "./journal-entry.repository";
import { AccountRepository } from "../account/account.repository";
import { JournalEntry } from "./journal-entry.entity";
import { JournalEntryStatus, Currency } from "../../common/types";
import { ExchangeRateService } from "../../common/exchange-rate.service";

describe("JournalEntryService", () => {
  let service: JournalEntryService;
  let journalEntryRepository: jest.Mocked<JournalEntryRepository>;
  let accountRepository: jest.Mocked<AccountRepository>;

  const mockAccount = {
    _id: "account-id-1",
    accountCode: "1001",
    accountName: "Cash Account",
    userId: "user-1",
    isDebitAccount: () => true,
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
    userId: "user-1",
    description: "Test journal entry",
    status: JournalEntryStatus.DRAFT,
    totalDebit: 1000,
    totalCredit: 1000,
    currency: Currency.USD,
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
    validateEntry: () => [],
    isBalanced: true,
    isDraft: true,
    isPosted: false,
    isReversed: false,
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
    $__: {},
  } as unknown as JournalEntry;

  beforeEach(async () => {
    const mockJournalEntryRepo = {
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

    const mockAccountRepo = {
      findByCode: jest.fn(),
      findById: jest.fn(),
      incrementBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalEntryService,
        {
          provide: JournalEntryRepository,
          useValue: mockJournalEntryRepo,
        },
        {
          provide: AccountRepository,
          useValue: mockAccountRepo,
        },
        {
          provide: ExchangeRateService,
          useValue: { getRate: jest.fn().mockResolvedValue(1) },
        },
      ],
    }).compile();

    service = module.get<JournalEntryService>(JournalEntryService);
    journalEntryRepository = module.get(JournalEntryRepository);
    accountRepository = module.get(AccountRepository);
  });

  describe("createJournalEntry", () => {
    const createDto = {
      userId: "user-1",
      description: "Test entry",
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

    it("should create journal entry successfully", async () => {
      const equityAccount = {
        ...mockAccount,
        _id: "account-id-2",
        accountCode: "3001",
        accountName: "Equity Account",
        id: "account-id-2",
      };

      accountRepository.findByCode.mockImplementation(
        (accountCode: string, userId: string) => {
          if (accountCode === "1001")
            return Promise.resolve(mockAccount as any);
          if (accountCode === "3001")
            return Promise.resolve(equityAccount as any);
          return Promise.resolve(null);
        }
      );

      journalEntryRepository.create.mockResolvedValue(mockJournalEntry as any);

      const result = await service.createJournalEntry(createDto);

      expect(accountRepository.findByCode).toHaveBeenCalledWith(
        "1001",
        "user-1"
      );
      expect(accountRepository.findByCode).toHaveBeenCalledWith(
        "3001",
        "user-1"
      );
      expect(journalEntryRepository.create).toHaveBeenCalledWith({
        ...createDto,
        entries: expect.arrayContaining([
          expect.objectContaining({
            accountId: "account-id-1",
            accountCode: "1001",
            accountName: "Cash Account",
            lineNumber: 1,
          }),
        ]),
      });
      expect(result).toEqual(mockJournalEntry);
    });

    it("should throw BadRequestException for invalid journal entry", async () => {
      const invalidDto = {
        ...createDto,
        entries: [
          {
            accountCode: "1001",
            description: "Invalid entry",
            debitAmount: 1000,
            creditAmount: 500, // Both debit and credit
            currency: Currency.USD,
          },
        ],
      };

      await expect(service.createJournalEntry(invalidDto)).rejects.toThrow(
        BadRequestException
      );
    });

    it("should throw BadRequestException for non-existent account", async () => {
      accountRepository.findByCode.mockResolvedValue(null);

      await expect(service.createJournalEntry(createDto)).rejects.toThrow(
        "Account 1001 not found"
      );
    });
  });

  describe("updateJournalEntry", () => {
    const updateDto = {
      description: "Updated description",
      entries: [
        {
          accountCode: "1001",
          description: "Updated cash entry",
          debitAmount: 1500,
          creditAmount: 0,
          currency: Currency.USD,
        },
        {
          accountCode: "3001",
          description: "Updated equity entry",
          debitAmount: 0,
          creditAmount: 1500,
          currency: Currency.USD,
        },
      ],
    };

    it("should update draft journal entry successfully", async () => {
      const updatedEntry = { ...mockJournalEntry, ...updateDto };
      const equityAccount = {
        ...mockAccount,
        _id: "account-id-2",
        accountCode: "3001",
        accountName: "Equity Account",
        id: "account-id-2",
      };

      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        mockJournalEntry as any
      );
      accountRepository.findByCode.mockImplementation(
        (accountCode: string, userId: string) => {
          if (accountCode === "1001")
            return Promise.resolve(mockAccount as any);
          if (accountCode === "3001")
            return Promise.resolve(equityAccount as any);
          return Promise.resolve(null);
        }
      );
      journalEntryRepository.update.mockResolvedValue(updatedEntry as any);

      const result = await service.updateJournalEntry(
        "JE-2024-000001",
        updateDto
      );

      expect(journalEntryRepository.findByJournalEntryId).toHaveBeenCalledWith(
        "JE-2024-000001"
      );
      expect(journalEntryRepository.update).toHaveBeenCalled();
      expect(result).toEqual(updatedEntry);
    });

    it("should throw NotFoundException if journal entry not found", async () => {
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(null);

      await expect(
        service.updateJournalEntry("JE-2024-000001", updateDto)
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if entry is not draft", async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
      };
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        postedEntry as any
      );

      await expect(
        service.updateJournalEntry("JE-2024-000001", updateDto)
      ).rejects.toThrow("Can only update draft journal entries");
    });
  });

  describe("postJournalEntry", () => {
    it("should post journal entry successfully", async () => {
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        mockJournalEntry as any
      );
      accountRepository.findById
        .mockResolvedValueOnce(mockAccount as any)
        .mockResolvedValueOnce({
          ...mockAccount,
          _id: "account-id-2",
          isDebitAccount: () => false,
          id: "account-id-2",
        } as any);
      accountRepository.incrementBalance
        .mockResolvedValueOnce(mockAccount as any)
        .mockResolvedValueOnce(mockAccount as any);
      journalEntryRepository.post.mockResolvedValue(mockJournalEntry as any);

      const result = await service.postJournalEntry("JE-2024-000001");

      expect(result.success).toBe(true);
      expect(result.affectedAccounts).toContain("1001");
      expect(accountRepository.incrementBalance).toHaveBeenCalledTimes(2);
      expect(journalEntryRepository.post).toHaveBeenCalledWith(
        "journal-entry-id"
      );
    });

    it("should return error if journal entry not found", async () => {
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(null);

      const result = await service.postJournalEntry("JE-2024-000001");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Journal entry not found");
    });

    it("should return error if entry is not draft", async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
      };
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        postedEntry as any
      );

      const result = await service.postJournalEntry("JE-2024-000001");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Can only post draft journal entries");
    });

    it("should return error if validation fails", async () => {
      const invalidEntry = {
        ...mockJournalEntry,
        validateEntry: () => ["Entry is not balanced"],
      };
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        invalidEntry as any
      );
      accountRepository.findById.mockResolvedValue(mockAccount as any);

      const result = await service.postJournalEntry("JE-2024-000001");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });
  });

  describe("reverseJournalEntry", () => {
    const reversalResult = {
      original: mockJournalEntry,
      reversal: {
        ...mockJournalEntry,
        journalEntryId: "JE-2024-000002",
        description: "REVERSAL: Test journal entry - Correction needed",
        entries: [
          {
            ...mockJournalEntry.entries[0],
            debitAmount: 0,
            creditAmount: 1000,
            description: "REVERSAL: Cash entry",
          },
          {
            ...mockJournalEntry.entries[1],
            debitAmount: 1000,
            creditAmount: 0,
            description: "REVERSAL: Equity entry",
          },
        ],
      },
    };

    it("should reverse journal entry successfully", async () => {
      journalEntryRepository.reverse.mockResolvedValue(reversalResult as any);
      accountRepository.findById
        .mockResolvedValueOnce(mockAccount as any)
        .mockResolvedValueOnce({
          ...mockAccount,
          _id: "account-id-2",
          isDebitAccount: () => false,
          id: "account-id-2",
        } as any);
      accountRepository.incrementBalance
        .mockResolvedValueOnce(mockAccount as any)
        .mockResolvedValueOnce(mockAccount as any);

      const result = await service.reverseJournalEntry(
        "JE-2024-000001",
        "Correction needed"
      );

      expect(result.success).toBe(true);
      expect(result.journalEntryId).toBe("JE-2024-000002");
      expect(journalEntryRepository.reverse).toHaveBeenCalledWith(
        "JE-2024-000001",
        "Correction needed"
      );
    });

    it("should handle reversal errors", async () => {
      journalEntryRepository.reverse.mockRejectedValue(
        new Error("Journal entry not found")
      );

      const result = await service.reverseJournalEntry(
        "JE-2024-000001",
        "Correction"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Journal entry not found");
    });
  });

  describe("validateJournalEntry", () => {
    const validDto = {
      userId: "user-1",
      description: "Valid entry",
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

    it("should validate journal entry successfully", async () => {
      accountRepository.findByCode.mockResolvedValue(mockAccount as any);

      const result = await service.validateJournalEntry(validDto);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return error for empty entries", async () => {
      const emptyDto = { ...validDto, entries: [] };

      const result = await service.validateJournalEntry(emptyDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Journal entry must have at least one line"
      );
    });

    it("should return error for single entry", async () => {
      const singleEntryDto = { ...validDto, entries: [validDto.entries[0]] };

      const result = await service.validateJournalEntry(singleEntryDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Journal entry must have at least two lines (debit and credit)"
      );
    });

    it("should return error for unbalanced entry", async () => {
      const unbalancedDto = {
        ...validDto,
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
            creditAmount: 500,
          },
        ],
      };
      accountRepository.findByCode.mockResolvedValue(mockAccount as any);

      const result = await service.validateJournalEntry(unbalancedDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Journal entry is not balanced: Debit=1000, Credit=500"
      );
    });

    it("should return error for entry with both debit and credit", async () => {
      const invalidEntryDto = {
        ...validDto,
        entries: [
          {
            accountCode: "1001",
            description: "Invalid entry",
            debitAmount: 1000,
            creditAmount: 500,
          },
          {
            accountCode: "3001",
            description: "Equity entry",
            debitAmount: 0,
            creditAmount: 1500,
          },
        ],
      };

      const result = await service.validateJournalEntry(invalidEntryDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Line 1: Entry cannot have both debit and credit amounts"
      );
    });

    it("should return error for non-existent account", async () => {
      accountRepository.findByCode
        .mockResolvedValueOnce(mockAccount as any)
        .mockResolvedValueOnce(null);

      const result = await service.validateJournalEntry(validDto);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Line 2: Account 3001 not found");
    });
  });

  describe("getJournalEntry", () => {
    it("should return journal entry", async () => {
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(
        mockJournalEntry as any
      );

      const result = await service.getJournalEntry("JE-2024-000001");

      expect(journalEntryRepository.findByJournalEntryId).toHaveBeenCalledWith(
        "JE-2024-000001"
      );
      expect(result).toEqual(mockJournalEntry);
    });

    it("should throw NotFoundException if not found", async () => {
      journalEntryRepository.findByJournalEntryId.mockResolvedValue(null);

      await expect(service.getJournalEntry("JE-2024-000001")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("getUserJournalEntries", () => {
    it("should return user journal entries", async () => {
      const entries = [mockJournalEntry];
      journalEntryRepository.findByUser.mockResolvedValue(entries);

      const result = await service.getUserJournalEntries("user-1");

      expect(journalEntryRepository.findByUser).toHaveBeenCalledWith(
        "user-1",
        undefined,
        50,
        0
      );
      expect(result).toEqual(entries);
    });

    it("should return entries with status filter", async () => {
      const entries = [mockJournalEntry];
      journalEntryRepository.findByUser.mockResolvedValue(entries);

      const result = await service.getUserJournalEntries(
        "user-1",
        JournalEntryStatus.DRAFT,
        10,
        5
      );

      expect(journalEntryRepository.findByUser).toHaveBeenCalledWith(
        "user-1",
        JournalEntryStatus.DRAFT,
        10,
        5
      );
      expect(result).toEqual(entries);
    });
  });

  describe("getAccountActivity", () => {
    it("should return account activity", async () => {
      const entries = [mockJournalEntry];
      journalEntryRepository.getAccountActivity.mockResolvedValue(entries);

      const result = await service.getAccountActivity("user-1", "1001");

      expect(journalEntryRepository.getAccountActivity).toHaveBeenCalledWith(
        "user-1",
        "1001",
        undefined,
        undefined
      );
      expect(result).toEqual(entries);
    });
  });

  describe("getDraftEntriesCount", () => {
    it("should return draft entries count", async () => {
      journalEntryRepository.getDraftCount.mockResolvedValue(5);

      const result = await service.getDraftEntriesCount("user-1");

      expect(journalEntryRepository.getDraftCount).toHaveBeenCalledWith(
        "user-1"
      );
      expect(result).toBe(5);
    });
  });

  describe("getJournalEntriesByReference", () => {
    it("should return entries by reference", async () => {
      const entries = [mockJournalEntry];
      journalEntryRepository.findByReference.mockResolvedValue(entries);

      const result = await service.getJournalEntriesByReference("REF-001");

      expect(journalEntryRepository.findByReference).toHaveBeenCalledWith(
        "REF-001"
      );
      expect(result).toEqual(entries);
    });
  });

  describe("getJournalEntriesInDateRange", () => {
    it("should return entries in date range", async () => {
      const entries = [mockJournalEntry];
      const fromDate = new Date("2024-01-01");
      const toDate = new Date("2024-01-31");
      journalEntryRepository.findByDateRange.mockResolvedValue(entries);

      const result = await service.getJournalEntriesInDateRange(
        "user-1",
        fromDate,
        toDate
      );

      expect(journalEntryRepository.findByDateRange).toHaveBeenCalledWith(
        "user-1",
        fromDate,
        toDate
      );
      expect(result).toEqual(entries);
    });
  });
});
