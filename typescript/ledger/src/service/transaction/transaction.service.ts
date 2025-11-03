import { Injectable, Logger } from "@nestjs/common";
import { AccountService } from "../account/account.service";
import { JournalEntryService } from "../journal-entry/journal-entry.service";
import {
  CreateTransactionDto,
  GetTransactionsDto,
  TransactionType,
  TransactionResult,
  JournalEntryLineDto,
  Currency,
} from "../../common/types";

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService
  ) {}

  async processTransaction(
    dto: CreateTransactionDto
  ): Promise<TransactionResult> {
    this.logger.debug(
      `Processing ${dto.transactionType} transaction for user: ${dto.userId}`
    );

    try {
      // Ensure default accounts exist
      const defaultAccounts = await this.accountService.setupDefaultAccounts(
        dto.userId
      );

      // Generate journal entry based on transaction type
      const journalEntryLines = await this.generateJournalEntryLines(
        dto,
        defaultAccounts
      );

      // Create journal entry
      const journalEntry = await this.journalEntryService.createJournalEntry({
        userId: dto.userId,
        description: dto.description,
        reference: dto.reference,
        entries: journalEntryLines,
        currency: dto.currency || Currency.USD,
      });

      // Post the journal entry to update account balances
      const postResult = await this.journalEntryService.postJournalEntry(
        journalEntry.journalEntryId
      );

      if (!postResult.success) {
        return {
          success: false,
          error: postResult.error,
          affectedAccounts: [],
        };
      }

      return {
        success: true,
        transactionId: `TXN-${Date.now()}`,
        journalEntryId: journalEntry.journalEntryId,
        affectedAccounts: postResult.affectedAccounts,
      };
    } catch (error) {
      this.logger.error(`Transaction processing failed:`, error);
      return {
        success: false,
        error: error.message,
        affectedAccounts: [],
      };
    }
  }

  private async generateJournalEntryLines(
    dto: CreateTransactionDto,
    defaultAccounts: any
  ): Promise<JournalEntryLineDto[]> {
    // LEGACY CODE - This service is deprecated. Use JournalEntryService + AccountIntelligenceService instead.
    throw new Error(
      "TransactionService is deprecated. Use JournalEntryService + AccountIntelligenceService for new transactions."
    );

    /* COMMENTED OUT - OLD TRANSACTION TYPE LOGIC
    const {
      amount,
      transactionType,
      fromAccountCode,
      toAccountCode,
      currency = Currency.USD,
    } = dto;

    switch (transactionType) {
      case "DEPOSIT":
        // Deposit: Debit Cash, Credit Owner's Equity
        return [
          {
            accountCode: defaultAccounts.cash.accountCode,
            description: `Cash deposit: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: defaultAccounts.equity.accountCode,
            description: `Equity increase: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      case TransactionType.WITHDRAWAL:
        // Withdrawal: Debit Owner's Equity, Credit Cash
        return [
          {
            accountCode: defaultAccounts.equity.accountCode,
            description: `Equity decrease: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: defaultAccounts.cash.accountCode,
            description: `Cash withdrawal: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      case TransactionType.EXPENSE:
        // Expense: Debit Expense, Credit Cash
        return [
          {
            accountCode: defaultAccounts.expense.accountCode,
            description: `Expense: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: defaultAccounts.cash.accountCode,
            description: `Cash payment: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      case TransactionType.RECEIPT:
        // Revenue receipt: Debit Cash, Credit Revenue
        return [
          {
            accountCode: defaultAccounts.cash.accountCode,
            description: `Cash received: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: defaultAccounts.revenue.accountCode,
            description: `Revenue: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      case TransactionType.PAYMENT:
        // Payment for services: Debit Expense, Credit Cash
        return [
          {
            accountCode: defaultAccounts.expense.accountCode,
            description: `Service payment: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: defaultAccounts.cash.accountCode,
            description: `Cash payment: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      case TransactionType.TRANSFER:
        // Transfer between accounts
        if (!fromAccountCode || !toAccountCode) {
          throw new Error("Transfer requires both from and to account codes");
        }

        const fromAccount = await this.accountService.getAccount(
          fromAccountCode,
          dto.userId
        );
        const toAccount = await this.accountService.getAccount(
          toAccountCode,
          dto.userId
        );

        return [
          {
            accountCode: toAccount.accountCode,
            description: `Transfer from ${fromAccount.accountName}: ${dto.description}`,
            debitAmount: amount,
            creditAmount: 0,
            currency,
          },
          {
            accountCode: fromAccount.accountCode,
            description: `Transfer to ${toAccount.accountName}: ${dto.description}`,
            debitAmount: 0,
            creditAmount: amount,
            currency,
          },
        ];

      default:
        throw new Error(`Unsupported transaction type: ${transactionType}`);
    }
    */
  }

  async getTransactionSummary(
    userId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{
    totalDeposits: number;
    totalWithdrawals: number;
    totalExpenses: number;
    totalRevenue: number;
    transactionCount: number;
    netCashFlow: number;
  }> {
    // Get journal entries in date range
    const startDate =
      fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = toDate || new Date();

    const entries = await this.journalEntryService.getJournalEntriesInDateRange(
      userId,
      startDate,
      endDate
    );

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalExpenses = 0;
    let totalRevenue = 0;
    let netCashFlow = 0;

    // Get default accounts to categorize transactions
    const defaultAccounts =
      await this.accountService.setupDefaultAccounts(userId);

    for (const entry of entries) {
      // Analyze journal entry to determine transaction type
      // Access accountCode via populated accountId
      const cashEntries = entry.entries.filter(
        line =>
          (line.accountId as any)?.accountCode ===
          defaultAccounts.cash.accountCode
      );

      for (const cashEntry of cashEntries) {
        if (cashEntry.debitAmount > 0) {
          // Cash increase - could be deposit or revenue
          const otherEntry = entry.entries.find(
            line =>
              (line.accountId as any)?.accountCode !==
              defaultAccounts.cash.accountCode
          );

          if (
            (otherEntry?.accountId as any)?.accountCode ===
            defaultAccounts.equity.accountCode
          ) {
            totalDeposits += cashEntry.debitAmount;
          } else if (
            (otherEntry?.accountId as any)?.accountCode ===
            defaultAccounts.revenue.accountCode
          ) {
            totalRevenue += cashEntry.debitAmount;
          }

          netCashFlow += cashEntry.debitAmount;
        } else if (cashEntry.creditAmount > 0) {
          // Cash decrease - could be withdrawal or expense
          const otherEntry = entry.entries.find(
            line =>
              (line.accountId as any)?.accountCode !==
              defaultAccounts.cash.accountCode
          );

          if (
            (otherEntry?.accountId as any)?.accountCode ===
            defaultAccounts.equity.accountCode
          ) {
            totalWithdrawals += cashEntry.creditAmount;
          } else if (
            (otherEntry?.accountId as any)?.accountCode ===
            defaultAccounts.expense.accountCode
          ) {
            totalExpenses += cashEntry.creditAmount;
          }

          netCashFlow -= cashEntry.creditAmount;
        }
      }
    }

    return {
      totalDeposits,
      totalWithdrawals,
      totalExpenses,
      totalRevenue,
      transactionCount: entries.length,
      netCashFlow,
    };
  }

  async getTransactions(dto: GetTransactionsDto): Promise<any[]> {
    const {
      userId,
      fromDate,
      toDate,
      transactionType,
      minAmount,
      maxAmount,
      limit = 50,
      offset = 0,
    } = dto;

    // Get journal entries in date range
    const startDate =
      fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = toDate || new Date();

    const entries = await this.journalEntryService.getJournalEntriesInDateRange(
      userId,
      startDate,
      endDate
    );

    // Convert journal entries to transaction format
    const transactions = entries.map(entry => {
      // Determine transaction type based on entry patterns
      let type = "UNKNOWN";
      let amount = 0;

      const defaultAccounts = {
        cash: "1001",
        equity: "3001",
        revenue: "4001",
        expense: "5001",
      };

      // Analyze entries to determine transaction type
      // Access accountCode via populated accountId
      const cashEntry = entry.entries.find(
        line => (line.accountId as any)?.accountCode === defaultAccounts.cash
      );
      if (cashEntry) {
        amount = cashEntry.debitAmount || cashEntry.creditAmount;

        const otherEntry = entry.entries.find(
          line => (line.accountId as any)?.accountCode !== defaultAccounts.cash
        );
        if (otherEntry) {
          const otherAccountCode = (otherEntry.accountId as any)?.accountCode;
          if (otherAccountCode === defaultAccounts.equity) {
            type = cashEntry.debitAmount > 0 ? "DEPOSIT" : "WITHDRAWAL";
          } else if (otherAccountCode === defaultAccounts.revenue) {
            type = "RECEIPT";
          } else if (otherAccountCode === defaultAccounts.expense) {
            type = "EXPENSE";
          }
        }
      } else {
        // Might be a transfer between non-cash accounts
        type = "TRANSFER";
        amount =
          entry.entries[0]?.debitAmount || entry.entries[0]?.creditAmount || 0;
      }

      return {
        transactionId: `TXN-${entry.journalEntryId}`,
        journalEntryId: entry.journalEntryId,
        date: entry.date,
        description: entry.description,
        reference: entry.reference,
        type,
        amount,
        status: entry.status,
        entries: entry.entries.map(line => ({
          accountCode: (line.accountId as any)?.accountCode,
          accountName: (line.accountId as any)?.accountName,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        })),
      };
    });

    // Apply filters
    let filteredTransactions = transactions;

    if (transactionType) {
      filteredTransactions = filteredTransactions.filter(
        t => t.type.toLowerCase() === transactionType.toLowerCase()
      );
    }

    if (minAmount !== undefined) {
      filteredTransactions = filteredTransactions.filter(
        t => t.amount >= minAmount
      );
    }

    if (maxAmount !== undefined) {
      filteredTransactions = filteredTransactions.filter(
        t => t.amount <= maxAmount
      );
    }

    // Apply pagination
    return filteredTransactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(offset, offset + limit);
  }

  async validateTransaction(
    dto: CreateTransactionDto
  ): Promise<{ isValid: boolean; errors: string[] }> {
    // LEGACY CODE - This service is deprecated
    throw new Error(
      "TransactionService.validateTransaction is deprecated. Use JournalEntryService for validation."
    );
  }
}
