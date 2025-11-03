import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { AccountService } from "./account/account.service";
import { JournalEntryService } from "./journal-entry/journal-entry.service";
import { TransactionService } from "./transaction/transaction.service";
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateTransactionDto,
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  AccountType,
  JournalEntryStatus,
} from "../common/types";

@Controller("ledger")
export class ServiceController {
  private readonly logger = new Logger(ServiceController.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService,
    private readonly transactionService: TransactionService
  ) {}

  // =====================
  // Account Management
  // =====================

  @Post("accounts")
  async createAccount(@Body() dto: CreateAccountDto) {
    try {
      const account = await this.accountService.createAccount(dto);
      return {
        success: true,
        account: {
          id: account._id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: account.balance,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("accounts")
  async getUserAccounts(
    @Query("userId") userId: string,
    @Query("type") accountType?: AccountType
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const accounts = accountType
        ? await this.accountService.getAccountsByType(userId, accountType)
        : await this.accountService.getUserAccounts(userId);

      return {
        success: true,
        userId,
        count: accounts.length,
        accounts: accounts.map(account => ({
          id: account._id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: account.balance,
          isActive: account.isActive,
          createdAt: account.createdAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("accounts/:accountCode")
  async getAccount(
    @Param("accountCode") accountCode: string,
    @Query("userId") userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const account = await this.accountService.getAccount(accountCode, userId);
      return {
        success: true,
        account: {
          id: account._id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: account.balance,
          isActive: account.isActive,
          description: account.description,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Put("accounts/:accountCode")
  async updateAccount(
    @Param("accountCode") accountCode: string,
    @Query("userId") userId: string,
    @Body() updateDto: UpdateAccountDto
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const account = await this.accountService.updateAccount(
        accountCode,
        userId,
        updateDto
      );
      return {
        success: true,
        account: {
          id: account._id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: account.balance,
          isActive: account.isActive,
          description: account.description,
          currency: account.currency,
          updatedAt: account.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Delete("accounts/:accountCode")
  async deactivateAccount(
    @Param("accountCode") accountCode: string,
    @Query("userId") userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      await this.accountService.deactivateAccount(accountCode, userId);
      return {
        success: true,
        message: `Account ${accountCode} has been deactivated`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post("accounts/setup-defaults")
  async setupDefaultAccounts(@Body() { userId }: { userId: string }) {
    try {
      if (!userId) {
        throw new BadRequestException("userId is required");
      }

      const accounts = await this.accountService.setupDefaultAccounts(userId);
      return {
        success: true,
        message: "Default accounts created successfully",
        accounts: {
          cash: accounts.cash.accountCode,
          equity: accounts.equity.accountCode,
          revenue: accounts.revenue.accountCode,
          expense: accounts.expense.accountCode,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // =====================
  // Balance & Reporting
  // =====================

  @Get("balances")
  async getAccountBalances(@Query("userId") userId: string) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const balances = await this.accountService.getAccountBalances(userId);
      return {
        success: true,
        userId,
        balances,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("trial-balance")
  async getTrialBalance(@Query("userId") userId: string) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const trialBalance = await this.accountService.getTrialBalance(userId);
      return {
        success: true,
        userId,
        trialBalance,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // =====================
  // Transactions
  // =====================

  @Get("transactions")
  async getTransactions(
    @Query("userId") userId: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("transactionType") transactionType?: string,
    @Query("minAmount") minAmount?: string,
    @Query("maxAmount") maxAmount?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const from = fromDate ? new Date(fromDate) : undefined;
      const to = toDate ? new Date(toDate) : undefined;
      const limitNum = limit ? parseInt(limit) : 50;
      const offsetNum = offset ? parseInt(offset) : 0;
      const minAmountNum = minAmount ? parseFloat(minAmount) : undefined;
      const maxAmountNum = maxAmount ? parseFloat(maxAmount) : undefined;

      const transactions = await this.transactionService.getTransactions({
        userId,
        fromDate: from,
        toDate: to,
        transactionType,
        minAmount: minAmountNum,
        maxAmount: maxAmountNum,
        limit: limitNum,
        offset: offsetNum,
      });

      return {
        success: true,
        userId,
        filters: {
          fromDate: from?.toISOString(),
          toDate: to?.toISOString(),
          transactionType,
          minAmount: minAmountNum,
          maxAmount: maxAmountNum,
        },
        pagination: {
          limit: limitNum,
          offset: offsetNum,
        },
        count: transactions.length,
        transactions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post("transactions")
  async processTransaction(@Body() dto: CreateTransactionDto) {
    try {
      // Validate transaction
      const validation = await this.transactionService.validateTransaction(dto);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Transaction validation failed: ${validation.errors.join(", ")}`,
        };
      }

      const result = await this.transactionService.processTransaction(dto);
      return result;
    } catch (error) {
      this.logger.error("Transaction processing failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("transactions/summary")
  async getTransactionSummary(
    @Query("userId") userId: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const from = fromDate ? new Date(fromDate) : undefined;
      const to = toDate ? new Date(toDate) : undefined;

      const summary = await this.transactionService.getTransactionSummary(
        userId,
        from,
        to
      );
      return {
        success: true,
        userId,
        period: {
          fromDate: from?.toISOString(),
          toDate: to?.toISOString(),
        },
        summary,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // =====================
  // Journal Entries
  // =====================

  @Post("journal-entries")
  async createJournalEntry(@Body() dto: CreateJournalEntryDto) {
    try {
      const journalEntry =
        await this.journalEntryService.createJournalEntry(dto);
      return {
        success: true,
        journalEntry: {
          id: journalEntry._id,
          journalEntryId: journalEntry.journalEntryId,
          date: journalEntry.date,
          description: journalEntry.description,
          status: journalEntry.status,
          totalDebit: journalEntry.totalDebit,
          totalCredit: journalEntry.totalCredit,
          entries: journalEntry.entries,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("journal-entries")
  async getUserJournalEntries(
    @Query("userId") userId: string,
    @Query("status") status?: JournalEntryStatus,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const limitNum = limit ? parseInt(limit) : 50;
      const offsetNum = offset ? parseInt(offset) : 0;

      const entries = await this.journalEntryService.getUserJournalEntries(
        userId,
        status,
        limitNum,
        offsetNum
      );

      return {
        success: true,
        userId,
        count: entries.length,
        entries: entries.map(entry => ({
          id: entry._id,
          journalEntryId: entry.journalEntryId,
          date: entry.date,
          description: entry.description,
          status: entry.status,
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
          entriesCount: entry.entries.length,
          createdAt: entry.createdAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get("journal-entries/:journalEntryId")
  async getJournalEntry(@Param("journalEntryId") journalEntryId: string) {
    try {
      const entry =
        await this.journalEntryService.getJournalEntry(journalEntryId);
      return {
        success: true,
        journalEntry: {
          id: entry._id,
          journalEntryId: entry.journalEntryId,
          date: entry.date,
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
          entries: entry.entries,
          isBalanced: entry.isBalanced,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Put("journal-entries/:journalEntryId")
  async updateJournalEntry(
    @Param("journalEntryId") journalEntryId: string,
    @Body() updateDto: UpdateJournalEntryDto
  ) {
    try {
      const entry = await this.journalEntryService.updateJournalEntry(
        journalEntryId,
        updateDto
      );
      return {
        success: true,
        journalEntry: {
          id: entry._id,
          journalEntryId: entry.journalEntryId,
          date: entry.date,
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
          entries: entry.entries,
          isBalanced: entry.isBalanced,
          updatedAt: entry.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post("journal-entries/:journalEntryId/post")
  async postJournalEntry(@Param("journalEntryId") journalEntryId: string) {
    try {
      const result =
        await this.journalEntryService.postJournalEntry(journalEntryId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        affectedAccounts: [],
      };
    }
  }

  @Post("journal-entries/:journalEntryId/reverse")
  async reverseJournalEntry(
    @Param("journalEntryId") journalEntryId: string,
    @Body() { reason }: { reason: string }
  ) {
    try {
      if (!reason) {
        throw new BadRequestException("Reversal reason is required");
      }

      const result = await this.journalEntryService.reverseJournalEntry(
        journalEntryId,
        reason
      );
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        affectedAccounts: [],
      };
    }
  }

  // =====================
  // Account Activity
  // =====================

  @Get("accounts/:accountCode/activity")
  async getAccountActivity(
    @Param("accountCode") accountCode: string,
    @Query("userId") userId: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException("userId parameter is required");
      }

      const from = fromDate ? new Date(fromDate) : undefined;
      const to = toDate ? new Date(toDate) : undefined;

      const entries = await this.journalEntryService.getAccountActivity(
        userId,
        accountCode,
        from,
        to
      );

      return {
        success: true,
        accountCode,
        userId,
        period: {
          fromDate: from?.toISOString(),
          toDate: to?.toISOString(),
        },
        activityCount: entries.length,
        entries: entries.map(entry => ({
          journalEntryId: entry.journalEntryId,
          date: entry.date,
          description: entry.description,
          reference: entry.reference,
          accountLine: entry.entries.find(
            line => (line.accountId as any)?.accountCode === accountCode
          ),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
