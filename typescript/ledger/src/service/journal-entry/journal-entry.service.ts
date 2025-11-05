import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JournalEntryRepository } from "./journal-entry.repository";
import { AccountRepository } from "../account/account.repository";
import { JournalEntry } from "./journal-entry.entity";
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  JournalEntryStatus,
  ValidationResult,
  TransactionResult,
  Currency,
} from "../../common/types";
import { ExchangeRateService } from "../../common/exchange-rate.service";

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);

  constructor(
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly accountRepository: AccountRepository,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async createJournalEntry(
    dto: CreateJournalEntryDto,
    options?: {
      skipAccountValidation?: boolean;
      pendingAccountsData?: Map<
        string,
        { name: string; type: string; currency: string; parentCode?: string }
      >;
    },
  ): Promise<JournalEntry> {
    if (process.env.NODE_ENV === "development") {
      this.logger.debug(
        `Creating journal entry for user: ${dto.userId}, skipValidation: ${options?.skipAccountValidation}`,
      );
    }

    // Validate the journal entry (skip account existence check if creating DRAFT with pending accounts)
    const validation = await this.validateJournalEntry(dto, {
      skipAccountExistenceCheck: options?.skipAccountValidation,
    });
    if (!validation.isValid) {
      throw new BadRequestException(
        `Invalid journal entry: ${validation.errors.join(", ")}`,
      );
    }

    // Resolve account IDs and names (or use pending data for DRAFT)
    const enrichedEntries = await Promise.all(
      dto.entries.map(async (entry, index) => {
        // Check if this account is pending (will be created later)
        const pendingData = options?.pendingAccountsData?.get(
          entry.accountCode,
        );

        if (pendingData) {
          // This account doesn't exist yet - use pending data
          return {
            accountId: undefined, // Will be set when account is created
            description: entry.description,
            debitAmount: entry.debitAmount,
            creditAmount: entry.creditAmount,
            lineNumber: index + 1,
            currency: entry.currency || (pendingData.currency as Currency),
            pendingAccountData: {
              code: entry.accountCode,
              ...pendingData,
            },
          };
        }

        // Normal flow: resolve existing account
        const account = await this.accountRepository.findByCode(
          entry.accountCode,
          dto.userId,
        );
        if (!account) {
          throw new BadRequestException(
            `Account ${entry.accountCode} not found`,
          );
        }

        return {
          accountId: account._id,
          description: entry.description,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
          lineNumber: index + 1,
          currency: entry.currency || account.currency,
        };
      }),
    );

    // Cast enrichedEntries to any since they contain accountId instead of accountCode
    // Repository will accept them and save directly
    return this.journalEntryRepository.create({
      ...dto,
      entries: enrichedEntries as any,
    });
  }

  async getJournalEntry(journalEntryId: string): Promise<JournalEntry> {
    const entry =
      await this.journalEntryRepository.findByJournalEntryId(journalEntryId);
    if (!entry) {
      throw new NotFoundException(`Journal entry ${journalEntryId} not found`);
    }
    return entry;
  }

  /**
   * Get statuses for multiple journal entries in one query
   * Used for checking transaction history efficiently
   */
  async getStatusesByIds(
    journalEntryIds: string[],
  ): Promise<Record<string, JournalEntryStatus>> {
    if (journalEntryIds.length === 0) {
      return {};
    }

    this.logger.debug(
      `Getting statuses for ${journalEntryIds.length} journal entries`,
    );

    const entries =
      await this.journalEntryRepository.findByIds(journalEntryIds);

    return entries.reduce(
      (acc, entry) => {
        acc[entry.journalEntryId] = entry.status;
        return acc;
      },
      {} as Record<string, JournalEntryStatus>,
    );
  }

  async updateJournalEntry(
    journalEntryId: string,
    updateDto: UpdateJournalEntryDto,
  ): Promise<JournalEntry> {
    const entry =
      await this.journalEntryRepository.findByJournalEntryId(journalEntryId);
    if (!entry) {
      throw new NotFoundException(`Journal entry ${journalEntryId} not found`);
    }

    if (entry.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException("Can only update draft journal entries");
    }

    // If entries are being updated, validate them
    if (updateDto.entries) {
      // Enrich entries with account information
      const enrichedEntries = await Promise.all(
        updateDto.entries.map(async (entryDto, index) => {
          const account = await this.accountRepository.findByCode(
            entryDto.accountCode,
            entry.userId,
          );
          if (!account) {
            throw new BadRequestException(
              `Account ${entryDto.accountCode} not found`,
            );
          }

          return {
            accountId: account._id,
            description: entryDto.description,
            debitAmount: entryDto.debitAmount,
            creditAmount: entryDto.creditAmount,
            lineNumber: index + 1,
            currency: entryDto.currency || entry.currency,
          };
        }),
      );

      // Validate the updated journal entry
      const validation = await this.validateJournalEntry({
        ...updateDto,
        userId: entry.userId,
        entries: updateDto.entries,
      } as CreateJournalEntryDto);

      if (!validation.isValid) {
        throw new BadRequestException(
          `Invalid journal entry: ${validation.errors.join(", ")}`,
        );
      }

      updateDto.entries = enrichedEntries as any;
    }

    return this.journalEntryRepository.update(entry._id.toString(), updateDto);
  }

  async getUserJournalEntries(
    userId: string,
    status?: JournalEntryStatus,
    limit: number = 50,
    offset: number = 0,
  ): Promise<JournalEntry[]> {
    return this.journalEntryRepository.findByUser(
      userId,
      status,
      limit,
      offset,
    );
  }

  async postJournalEntry(journalEntryId: string): Promise<TransactionResult> {
    this.logger.log(`Posting journal entry: ${journalEntryId}`);

    const entry =
      await this.journalEntryRepository.findByJournalEntryId(journalEntryId);
    if (!entry) {
      return {
        success: false,
        error: "Journal entry not found",
        affectedAccounts: [],
      };
    }

    if (entry.status !== JournalEntryStatus.DRAFT) {
      return {
        success: false,
        error: "Can only post draft journal entries",
        affectedAccounts: [],
      };
    }

    // Validate before posting
    const entryValidation = entry.validateEntry ? entry.validateEntry() : [];
    const postingValidation = this.validateJournalEntryForPosting(entry);
    const validationErrors = [...entryValidation, ...postingValidation];
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed: ${validationErrors.join(", ")}`,
        affectedAccounts: [],
      };
    }

    try {
      // Update account balances
      const affectedAccountCodes: string[] = [];

      for (const line of entry.entries) {
        const account = await this.accountRepository.findById(
          line.accountId.toString(),
        );
        if (!account) {
          throw new Error(`Account with ID ${line.accountId} not found`);
        }

        let debit = line.debitAmount;
        let credit = line.creditAmount;
        if (line.currency && line.currency !== account.currency) {
          const rate = await this.exchangeRateService.getRate(
            line.currency,
            account.currency,
          );
          debit = debit * rate;
          credit = credit * rate;
        }

        // Calculate balance change based on account's normal balance
        let balanceChange = 0;
        if (account.normalBalance === "DEBIT") {
          balanceChange = debit - credit;
        } else {
          balanceChange = credit - debit;
        }

        await this.accountRepository.incrementBalance(
          account._id.toString(),
          balanceChange,
        );
        affectedAccountCodes.push(account.accountCode);
      }

      // Mark journal entry as posted
      await this.journalEntryRepository.post(entry._id.toString());

      return {
        success: true,
        journalEntryId: entry.journalEntryId,
        affectedAccounts: affectedAccountCodes,
      };
    } catch (error) {
      this.logger.error(
        `Failed to post journal entry ${journalEntryId}:`,
        error,
      );
      return {
        success: false,
        error: error.message,
        affectedAccounts: [],
      };
    }
  }

  async reverseJournalEntry(
    journalEntryId: string,
    reversalReason: string,
  ): Promise<TransactionResult> {
    this.logger.log(`Reversing journal entry: ${journalEntryId}`);

    try {
      const result = await this.journalEntryRepository.reverse(
        journalEntryId,
        reversalReason,
      );

      // Update account balances for the reversal
      const affectedAccountCodes: string[] = [];

      for (const line of result.reversal.entries) {
        const account = await this.accountRepository.findById(
          line.accountId.toString(),
        );
        if (!account) {
          throw new Error(`Account with ID ${line.accountId} not found`);
        }

        // Calculate balance change for reversal
        let balanceChange = 0;
        if (account.normalBalance === "DEBIT") {
          balanceChange = line.debitAmount - line.creditAmount;
        } else {
          balanceChange = line.creditAmount - line.debitAmount;
        }

        await this.accountRepository.incrementBalance(
          account._id.toString(),
          balanceChange,
        );
        affectedAccountCodes.push(account.accountCode);
      }

      return {
        success: true,
        journalEntryId: result.reversal.journalEntryId,
        affectedAccounts: affectedAccountCodes,
      };
    } catch (error) {
      this.logger.error(
        `Failed to reverse journal entry ${journalEntryId}:`,
        error,
      );
      return {
        success: false,
        error: error.message,
        affectedAccounts: [],
      };
    }
  }

  async getAccountActivity(
    userId: string,
    accountCode: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<JournalEntry[]> {
    return this.journalEntryRepository.getAccountActivity(
      userId,
      accountCode,
      fromDate,
      toDate,
    );
  }

  async validateJournalEntry(
    dto: CreateJournalEntryDto,
    options?: { skipAccountExistenceCheck?: boolean },
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!dto.entries || dto.entries.length === 0) {
      errors.push("Journal entry must have at least one line");
    } else if (dto.entries.length === 1) {
      errors.push(
        "Journal entry must have at least two lines (debit and credit)",
      );
    }

    // Calculate totals
    const totalDebit = dto.entries.reduce(
      (sum, entry) => sum + entry.debitAmount,
      0,
    );
    const totalCredit = dto.entries.reduce(
      (sum, entry) => sum + entry.creditAmount,
      0,
    );

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push(
        `Journal entry is not balanced: Debit=${totalDebit}, Credit=${totalCredit}`,
      );
    }

    // Validate individual entries
    for (let i = 0; i < dto.entries.length; i++) {
      const entry = dto.entries[i];

      if (entry.debitAmount > 0 && entry.creditAmount > 0) {
        errors.push(
          `Line ${i + 1}: Entry cannot have both debit and credit amounts`,
        );
      }

      if (entry.debitAmount === 0 && entry.creditAmount === 0) {
        errors.push(
          `Line ${i + 1}: Entry must have either debit or credit amount`,
        );
      }

      if (entry.debitAmount < 0 || entry.creditAmount < 0) {
        errors.push(`Line ${i + 1}: Amounts cannot be negative`);
      }

      // Verify account exists (skip for DRAFT with pending accounts)
      if (!options?.skipAccountExistenceCheck) {
        const account = await this.accountRepository.findByCode(
          entry.accountCode,
          dto.userId,
        );
        if (!account) {
          errors.push(`Line ${i + 1}: Account ${entry.accountCode} not found`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getDraftEntriesCount(userId: string): Promise<number> {
    return this.journalEntryRepository.getDraftCount(userId);
  }

  async getJournalEntriesByReference(
    reference: string,
  ): Promise<JournalEntry[]> {
    return this.journalEntryRepository.findByReference(reference);
  }

  async getJournalEntriesInDateRange(
    userId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<JournalEntry[]> {
    return this.journalEntryRepository.findByDateRange(
      userId,
      fromDate,
      toDate,
    );
  }

  private validateJournalEntryForPosting(entry: any): string[] {
    const errors: string[] = [];

    if (!entry.entries || entry.entries.length === 0) {
      errors.push("Journal entry must have at least one line");
    }

    if (entry.entries && entry.entries.length === 1) {
      errors.push(
        "Journal entry must have at least two lines (debit and credit)",
      );
    }

    // Check if balanced
    const totalDebit = entry.totalDebit || 0;
    const totalCredit = entry.totalCredit || 0;
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      errors.push(
        `Journal entry is not balanced: Debit=${totalDebit}, Credit=${totalCredit}`,
      );
    }

    return errors;
  }
}
