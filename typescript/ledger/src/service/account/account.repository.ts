import { Injectable, Logger } from "@nestjs/common";
import { Model } from "mongoose";
import { Account, AccountDocument } from "./account.entity";
import {
  AccountType,
  CreateAccountDto,
  UpdateAccountDto,
  NormalBalance,
  Currency,
} from "../../common/types";

@Injectable()
export class AccountRepository {
  private readonly logger = new Logger(AccountRepository.name);

  constructor(private readonly accountModel: Model<AccountDocument>) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    this.logger.debug(
      `Creating account: ${dto.accountCode} - ${dto.accountName}`,
    );

    const account = new this.accountModel({
      ...dto,
      balance: 0,
      currency: dto.currency || Currency.USD,
    });

    return account.save();
  }

  async findByCode(
    accountCode: string,
    userId: string,
  ): Promise<Account | null> {
    return this.accountModel.findOne({ accountCode, userId }).exec();
  }

  async findById(accountId: string): Promise<Account | null> {
    return this.accountModel.findById(accountId).exec();
  }

  async findByUser(userId: string): Promise<Account[]> {
    return this.accountModel
      .find({ userId, isActive: true })
      .sort({ accountCode: 1 })
      .exec();
  }

  async findByType(
    userId: string,
    accountType: AccountType,
  ): Promise<Account[]> {
    return this.accountModel
      .find({ userId, accountType, isActive: true })
      .sort({ accountCode: 1 })
      .exec();
  }

  async updateBalance(accountId: string, newBalance: number): Promise<void> {
    await this.accountModel
      .updateOne(
        { _id: accountId },
        { balance: newBalance, updatedAt: new Date() },
      )
      .exec();
  }

  async incrementBalance(
    accountId: string,
    amount: number,
  ): Promise<Account | null> {
    return this.accountModel
      .findByIdAndUpdate(
        accountId,
        { $inc: { balance: amount }, updatedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async findOrCreateDefaultAccounts(userId: string): Promise<{
    cash: Account;
    equity: Account;
    revenue: Account;
    expense: Account;
  }> {
    // Find or create default accounts for user
    let cash = await this.findByCode("1001", userId);
    if (!cash) {
      cash = await this.create({
        accountCode: "1001",
        accountName: "Cash",
        accountType: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
        userId,
        description: "Primary cash account",
        currency: Currency.USD,
      });
    }

    let equity = await this.findByCode("3001", userId);
    if (!equity) {
      equity = await this.create({
        accountCode: "3001",
        accountName: "Owner's Equity",
        accountType: AccountType.EQUITY,
        normalBalance: NormalBalance.CREDIT,
        userId,
        description: "Owner equity account",
        currency: Currency.USD,
      });
    }

    let revenue = await this.findByCode("4001", userId);
    if (!revenue) {
      revenue = await this.create({
        accountCode: "4001",
        accountName: "Service Revenue",
        accountType: AccountType.REVENUE,
        normalBalance: NormalBalance.CREDIT,
        userId,
        description: "Revenue from services",
        currency: Currency.USD,
      });
    }

    let expense = await this.findByCode("5001", userId);
    if (!expense) {
      expense = await this.create({
        accountCode: "5001",
        accountName: "General Expense",
        accountType: AccountType.EXPENSE,
        normalBalance: NormalBalance.DEBIT,
        userId,
        description: "General business expenses",
        currency: Currency.USD,
      });
    }

    return { cash, equity, revenue, expense };
  }

  async update(
    accountId: string,
    updateDto: UpdateAccountDto,
  ): Promise<Account | null> {
    return this.accountModel
      .findByIdAndUpdate(
        accountId,
        { ...updateDto, updatedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async deactivate(accountId: string): Promise<void> {
    await this.accountModel
      .updateOne({ _id: accountId }, { isActive: false, updatedAt: new Date() })
      .exec();
  }

  async getTotalsByType(userId: string): Promise<Record<AccountType, number>> {
    const pipeline = [
      { $match: { userId, isActive: true } },
      {
        $group: {
          _id: "$accountType",
          totalBalance: { $sum: "$balance" },
        },
      },
    ];

    const results = await this.accountModel.aggregate(pipeline).exec();

    const totals: Record<AccountType, number> = {
      [AccountType.ASSET]: 0,
      [AccountType.LIABILITY]: 0,
      [AccountType.EQUITY]: 0,
      [AccountType.REVENUE]: 0,
      [AccountType.EXPENSE]: 0,
    };

    results.forEach((result) => {
      totals[result._id] = result.totalBalance;
    });

    return totals;
  }
}
