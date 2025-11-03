import { Injectable, Logger, Inject } from "@nestjs/common";
import { Connection, Types } from "mongoose";
import { AccountService } from "../account/account.service";
import { JournalEntryService } from "../journal-entry/journal-entry.service";
import {
  AccountType,
  NormalBalance,
  JournalEntryStatus,
} from "../../common/types";
import {
  PendingAccountPlan,
  PendingAccountPlanStatus,
  PendingAccountData,
  TransactionData,
} from "./pending-account-plan.entity";
import { PendingAccountPlanRepository } from "./pending-account-plan.repository";

@Injectable()
export class PendingAccountPlanService {
  private readonly logger = new Logger(PendingAccountPlanService.name);

  constructor(
    private readonly repository: PendingAccountPlanRepository,
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService,
    @Inject("MONGO_CONNECTION") private readonly connection: Connection
  ) {}

  async createPlan(
    userId: string,
    conversationId: string,
    accountsToCreate: PendingAccountData[],
    transactionToCreate: TransactionData
  ): Promise<PendingAccountPlan> {
    this.logger.log({
      message: "Creating pending account plan",
      userId,
      conversationId,
      accountsCount: accountsToCreate.length,
    });

    return this.repository.create({
      userId,
      conversationId,
      accountsToCreate,
      transactionToCreate,
      status: PendingAccountPlanStatus.PENDING,
    });
  }

  async confirmPlan(planId: string): Promise<Types.ObjectId> {
    this.logger.log({
      message: "Confirming pending account plan",
      planId,
    });

    const plan = await this.repository.findById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.status !== PendingAccountPlanStatus.PENDING) {
      throw new Error(
        `Plan ${planId} is not in PENDING status (current: ${plan.status})`
      );
    }

    // Execute in MongoDB transaction
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Create accounts
      for (const accountData of plan.accountsToCreate) {
        // Determine normal balance based on account type
        const normalBalance = this.determineNormalBalance(accountData.type);

        await this.accountService.createAccount({
          accountCode: accountData.code,
          accountName: accountData.name,
          accountType: accountData.type,
          normalBalance,
          userId: plan.userId,
          parentAccount: accountData.parentCode,
          currency: accountData.currency,
        });
      }

      // 2. Create journal entry
      const journalEntry = await this.journalEntryService.createJournalEntry({
        userId: plan.userId,
        description: plan.transactionToCreate.description,
        reference: plan.transactionToCreate.reference,
        date: plan.transactionToCreate.date,
        currency: plan.transactionToCreate.currency,
        status: JournalEntryStatus.POSTED, // Accounts created, post immediately
        entries: plan.transactionToCreate.entries,
      });

      // 3. Update plan status
      await this.repository.updateStatus(
        planId,
        PendingAccountPlanStatus.CONFIRMED,
        journalEntry._id as Types.ObjectId
      );

      await session.commitTransaction();

      this.logger.log({
        message: "Pending account plan confirmed successfully",
        planId,
        journalEntryId: journalEntry._id,
      });

      return journalEntry._id as Types.ObjectId;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error({
        message: "Failed to confirm pending account plan",
        planId,
        error: error.message,
      });
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async rejectPlan(planId: string): Promise<void> {
    this.logger.log({
      message: "Rejecting pending account plan",
      planId,
    });

    await this.repository.updateStatus(
      planId,
      PendingAccountPlanStatus.REJECTED
    );
  }

  async getPendingPlansByConversation(
    conversationId: string
  ): Promise<PendingAccountPlan[]> {
    return this.repository.findByConversationId(
      conversationId,
      PendingAccountPlanStatus.PENDING
    );
  }

  async getPlanById(planId: string): Promise<PendingAccountPlan | null> {
    return this.repository.findById(planId);
  }

  /**
   * Determine normal balance based on account type
   * Assets and Expenses have DEBIT balance
   * Liabilities, Equity, and Revenue have CREDIT balance
   */
  private determineNormalBalance(accountType: AccountType): NormalBalance {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return NormalBalance.DEBIT;
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return NormalBalance.CREDIT;
      default:
        return NormalBalance.DEBIT;
    }
  }
}
