import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { DatabaseModule } from "../common/database.module";

// Service components
import { ServiceController } from "./service.controller";
import { AccountService } from "./account/account.service";
import { JournalEntryService } from "./journal-entry/journal-entry.service";
import { TransactionService } from "./transaction/transaction.service";
import { AccountRepository } from "./account/account.repository";
import { JournalEntryRepository } from "./journal-entry/journal-entry.repository";
import { ExchangeRateService } from "../common/exchange-rate.service";

// Entities
import { Account, AccountSchema } from "./account/account.entity";
import {
  JournalEntry,
  JournalEntrySchema,
} from "./journal-entry/journal-entry.entity";
import {
  PendingAccountPlan,
  PendingAccountPlanSchema,
} from "./pending-account-plan/pending-account-plan.entity";
import { PendingAccountPlanRepository } from "./pending-account-plan/pending-account-plan.repository";
import { PendingAccountPlanService } from "./pending-account-plan/pending-account-plan.service";

@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [ServiceController],
  providers: [
    // Model providers for repositories
    {
      provide: "ACCOUNT_MODEL",
      useFactory: (connection: any) =>
        connection.model(Account.name, AccountSchema),
      inject: ["MONGO_CONNECTION"],
    },
    {
      provide: "JOURNAL_ENTRY_MODEL",
      useFactory: (connection: any) =>
        connection.model(JournalEntry.name, JournalEntrySchema),
      inject: ["MONGO_CONNECTION"],
    },
    {
      provide: "PENDING_ACCOUNT_PLAN_MODEL",
      useFactory: (connection: any) =>
        connection.model(PendingAccountPlan.name, PendingAccountPlanSchema),
      inject: ["MONGO_CONNECTION"],
    },

    // Repositories
    {
      provide: AccountRepository,
      useFactory: (model: any) => new AccountRepository(model),
      inject: ["ACCOUNT_MODEL"],
    },
    {
      provide: JournalEntryRepository,
      useFactory: (model: any) => new JournalEntryRepository(model),
      inject: ["JOURNAL_ENTRY_MODEL"],
    },
    {
      provide: PendingAccountPlanRepository,
      useFactory: (model: any) => new PendingAccountPlanRepository(model),
      inject: ["PENDING_ACCOUNT_PLAN_MODEL"],
    },

    // Services
    AccountService,
    JournalEntryService,
    TransactionService,
    ExchangeRateService,
    PendingAccountPlanService,
  ],
  exports: [
    AccountService,
    JournalEntryService,
    TransactionService,
    AccountRepository,
    JournalEntryRepository,
    ExchangeRateService,
    PendingAccountPlanService,
    PendingAccountPlanRepository,
  ],
})
export class ServiceModule {}

/**
 * Service Module
 *
 * Business logic for double-entry accounting system.
 * All business operations, data access, and REST API.
 */
