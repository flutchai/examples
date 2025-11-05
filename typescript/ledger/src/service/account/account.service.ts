import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { AccountRepository } from "./account.repository";
import { Account } from "./account.entity";
import {
  AccountType,
  CreateAccountDto,
  UpdateAccountDto,
  AccountBalance,
  ValidationResult,
} from "../../common/types";

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly accountRepository: AccountRepository) {}

  async createAccount(dto: CreateAccountDto): Promise<Account> {
    this.logger.debug(
      `Creating account: ${dto.accountCode} - ${dto.accountName}`,
    );

    // Validate account code format
    if (!this.isValidAccountCode(dto.accountCode)) {
      throw new BadRequestException("Invalid account code format");
    }

    // Check if account already exists
    const existing = await this.accountRepository.findByCode(
      dto.accountCode,
      dto.userId,
    );
    if (existing) {
      throw new BadRequestException(
        `Account with code ${dto.accountCode} already exists`,
      );
    }

    return this.accountRepository.create(dto);
  }

  async getAccount(accountCode: string, userId: string): Promise<Account> {
    const account = await this.accountRepository.findByCode(
      accountCode,
      userId,
    );
    if (!account) {
      throw new NotFoundException(`Account ${accountCode} not found`);
    }
    return account;
  }

  async getUserAccounts(userId: string): Promise<Account[]> {
    return this.accountRepository.findByUser(userId);
  }

  async getAccountsByType(
    userId: string,
    accountType: AccountType,
  ): Promise<Account[]> {
    return this.accountRepository.findByType(userId, accountType);
  }

  async getAccountBalances(userId: string): Promise<AccountBalance[]> {
    const accounts = await this.accountRepository.findByUser(userId);

    return accounts.map((account) => ({
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      balance: account.balance,
      lastUpdated: account.updatedAt || account.createdAt,
    }));
  }

  async setupDefaultAccounts(userId: string): Promise<{
    cash: Account;
    equity: Account;
    revenue: Account;
    expense: Account;
  }> {
    this.logger.debug(`Setting up default accounts for user: ${userId}`);
    return this.accountRepository.findOrCreateDefaultAccounts(userId);
  }

  async updateAccountBalance(
    accountId: string,
    newBalance: number,
  ): Promise<void> {
    await this.accountRepository.updateBalance(accountId, newBalance);
  }

  async adjustAccountBalance(
    accountId: string,
    amount: number,
  ): Promise<Account> {
    const account = await this.accountRepository.incrementBalance(
      accountId,
      amount,
    );
    if (!account) {
      throw new NotFoundException("Account not found");
    }
    return account;
  }

  async validateTransaction(
    fromAccountCode: string,
    toAccountCode: string,
    amount: number,
    userId: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (amount <= 0) {
      errors.push("Transaction amount must be positive");
    }

    // Validate from account
    const fromAccount = await this.accountRepository.findByCode(
      fromAccountCode,
      userId,
    );
    if (!fromAccount) {
      errors.push(`From account ${fromAccountCode} not found`);
    } else {
      // Check if account can be debited (for withdrawals)
      if (
        ![AccountType.ASSET, AccountType.EXPENSE].includes(
          fromAccount.accountType,
        )
      ) {
        warnings.push(
          `Account ${fromAccountCode} is typically credited, not debited`,
        );
      }

      // Check sufficient funds for asset accounts
      if (
        fromAccount.accountType === AccountType.ASSET &&
        fromAccount.balance < amount
      ) {
        errors.push(`Insufficient funds in account ${fromAccountCode}`);
      }
    }

    // Validate to account
    const toAccount = await this.accountRepository.findByCode(
      toAccountCode,
      userId,
    );
    if (!toAccount) {
      errors.push(`To account ${toAccountCode} not found`);
    } else {
      // Check if account can be credited
      if (
        ![
          AccountType.LIABILITY,
          AccountType.EQUITY,
          AccountType.REVENUE,
        ].includes(toAccount.accountType)
      ) {
        warnings.push(
          `Account ${toAccountCode} is typically debited, not credited`,
        );
      }
    }

    // Check for same account transfer
    if (fromAccountCode === toAccountCode) {
      errors.push("Cannot transfer to the same account");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getTrialBalance(userId: string): Promise<{
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
    revenue: AccountBalance[];
    expenses: AccountBalance[];
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  }> {
    const accounts = await this.accountRepository.findByUser(userId);

    const categorized = {
      assets: accounts.filter((a) => a.accountType === AccountType.ASSET),
      liabilities: accounts.filter(
        (a) => a.accountType === AccountType.LIABILITY,
      ),
      equity: accounts.filter((a) => a.accountType === AccountType.EQUITY),
      revenue: accounts.filter((a) => a.accountType === AccountType.REVENUE),
      expenses: accounts.filter((a) => a.accountType === AccountType.EXPENSE),
    };

    const mapToBalance = (accounts: Account[]): AccountBalance[] =>
      accounts.map((account) => ({
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        balance: account.balance,
        lastUpdated: account.updatedAt || account.createdAt,
      }));

    const assets = mapToBalance(categorized.assets);
    const liabilities = mapToBalance(categorized.liabilities);
    const equity = mapToBalance(categorized.equity);
    const revenue = mapToBalance(categorized.revenue);
    const expenses = mapToBalance(categorized.expenses);

    // Calculate totals (using normal balance conventions)
    const totalDebits =
      assets.reduce((sum, acc) => sum + acc.balance, 0) +
      expenses.reduce((sum, acc) => sum + acc.balance, 0);

    const totalCredits =
      liabilities.reduce((sum, acc) => sum + acc.balance, 0) +
      equity.reduce((sum, acc) => sum + acc.balance, 0) +
      revenue.reduce((sum, acc) => sum + acc.balance, 0);

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      assets,
      liabilities,
      equity,
      revenue,
      expenses,
      totalDebits,
      totalCredits,
      isBalanced,
    };
  }

  private isValidAccountCode(accountCode: string): boolean {
    // Account code should be 4 digits, starting with account type prefix
    // 1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity, 4xxx = Revenue, 5xxx = Expenses
    const codePattern = /^[1-5]\d{3}$/;
    return codePattern.test(accountCode);
  }

  async updateAccount(
    accountCode: string,
    userId: string,
    updateDto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.getAccount(accountCode, userId);

    return this.accountRepository.update(account._id.toString(), updateDto);
  }

  async deactivateAccount(accountCode: string, userId: string): Promise<void> {
    const account = await this.getAccount(accountCode, userId);

    if (account.balance !== 0) {
      throw new BadRequestException(
        "Cannot deactivate account with non-zero balance",
      );
    }

    await this.accountRepository.deactivate(account._id.toString());
  }
}
