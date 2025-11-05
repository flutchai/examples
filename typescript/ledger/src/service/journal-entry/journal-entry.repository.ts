import { Injectable, Logger } from "@nestjs/common";
import { Model } from "mongoose";
import { JournalEntry, JournalEntryDocument } from "./journal-entry.entity";
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  JournalEntryStatus,
  Currency,
} from "../../common/types";

@Injectable()
export class JournalEntryRepository {
  private readonly logger = new Logger(JournalEntryRepository.name);

  constructor(
    private readonly journalEntryModel: Model<JournalEntryDocument>,
  ) {}

  async create(dto: CreateJournalEntryDto): Promise<JournalEntry> {
    this.logger.debug(`Creating journal entry for user: ${dto.userId}`);

    // Generate unique journal entry ID
    const journalEntryId = await this.generateJournalEntryId(dto.userId);

    // Calculate totals
    const totalDebit = dto.entries.reduce(
      (sum, entry) => sum + entry.debitAmount,
      0,
    );
    const totalCredit = dto.entries.reduce(
      (sum, entry) => sum + entry.creditAmount,
      0,
    );

    const journalEntry = new this.journalEntryModel({
      journalEntryId,
      date: dto.date || new Date(),
      description: dto.description,
      reference: dto.reference,
      userId: dto.userId,
      status: dto.status || JournalEntryStatus.DRAFT,
      totalDebit,
      totalCredit,
      currency: dto.currency || Currency.USD,
      entries: dto.entries.map((entry, index) => ({
        ...entry,
        lineNumber: index + 1,
        currency: entry.currency || dto.currency || Currency.USD,
      })),
    });

    return journalEntry.save();
  }

  async findById(journalEntryId: string): Promise<JournalEntry | null> {
    return this.journalEntryModel.findById(journalEntryId).exec();
  }

  async findByIds(journalEntryIds: string[]): Promise<JournalEntry[]> {
    return this.journalEntryModel
      .find({ journalEntryId: { $in: journalEntryIds } })
      .select("journalEntryId status description amount createdAt")
      .lean<JournalEntry[]>()
      .exec();
  }

  async findByJournalEntryId(
    journalEntryId: string,
  ): Promise<JournalEntry | null> {
    return this.journalEntryModel
      .findOne({ journalEntryId })
      .populate(
        "entries.accountId",
        "accountCode accountName accountType normalBalance currency",
      )
      .exec();
  }

  async update(
    journalEntryId: string,
    updateDto: UpdateJournalEntryDto,
  ): Promise<JournalEntry | null> {
    const updateData: any = { ...updateDto };

    // If entries are being updated, recalculate totals
    if (updateDto.entries) {
      const totalDebit = updateDto.entries.reduce(
        (sum, entry) => sum + entry.debitAmount,
        0,
      );
      const totalCredit = updateDto.entries.reduce(
        (sum, entry) => sum + entry.creditAmount,
        0,
      );

      updateData.totalDebit = totalDebit;
      updateData.totalCredit = totalCredit;
    }

    return this.journalEntryModel
      .findByIdAndUpdate(
        journalEntryId,
        { ...updateData, updatedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async findByUser(
    userId: string,
    status?: JournalEntryStatus,
    limit: number = 50,
    offset: number = 0,
  ): Promise<JournalEntry[]> {
    const query: any = { userId };
    if (status) {
      query.status = status;
    }

    return this.journalEntryModel
      .find(query)
      .populate(
        "entries.accountId",
        "accountCode accountName accountType normalBalance currency",
      )
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .exec();
  }

  async findByReference(reference: string): Promise<JournalEntry[]> {
    return this.journalEntryModel
      .find({ reference })
      .populate(
        "entries.accountId",
        "accountCode accountName accountType normalBalance currency",
      )
      .exec();
  }

  async findByDateRange(
    userId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<JournalEntry[]> {
    return this.journalEntryModel
      .find({
        userId,
        date: { $gte: fromDate, $lte: toDate },
      })
      .populate(
        "entries.accountId",
        "accountCode accountName accountType normalBalance currency",
      )
      .sort({ date: -1 })
      .exec();
  }

  async post(journalEntryId: string): Promise<JournalEntry | null> {
    this.logger.debug(`Posting journal entry: ${journalEntryId}`);

    return this.journalEntryModel
      .findByIdAndUpdate(
        journalEntryId,
        {
          status: JournalEntryStatus.POSTED,
          postedAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async reverse(
    journalEntryId: string,
    reversalReason: string,
  ): Promise<{ original: JournalEntry; reversal: JournalEntry }> {
    this.logger.debug(`Reversing journal entry: ${journalEntryId}`);

    const original = await this.journalEntryModel
      .findById(journalEntryId)
      .exec();
    if (!original) {
      throw new Error("Journal entry not found");
    }

    if (original.status !== JournalEntryStatus.POSTED) {
      throw new Error("Can only reverse posted journal entries");
    }

    // Create reversal entry with opposite amounts
    const reversalEntries = original.entries.map((entry) => ({
      accountId: entry.accountId,
      description: `REVERSAL: ${entry.description}`,
      debitAmount: entry.creditAmount, // Swap amounts
      creditAmount: entry.debitAmount,
      lineNumber: entry.lineNumber,
      currency: entry.currency,
    }));

    const reversalJournalEntryId = await this.generateJournalEntryId(
      original.userId,
    );

    const reversal = new this.journalEntryModel({
      journalEntryId: reversalJournalEntryId,
      date: new Date(),
      description: `REVERSAL: ${original.description} - ${reversalReason}`,
      reference: original.reference,
      userId: original.userId,
      status: JournalEntryStatus.POSTED,
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      currency: original.currency,
      entries: reversalEntries,
      reversedFromId: original._id,
      postedAt: new Date(),
    });

    await reversal.save();

    // Mark original as reversed
    original.status = JournalEntryStatus.REVERSED;
    original.reversedById = reversal._id as any;
    original.reversedAt = new Date();
    await original.save();

    return { original, reversal };
  }

  async getDraftCount(userId: string): Promise<number> {
    return this.journalEntryModel
      .countDocuments({ userId, status: JournalEntryStatus.DRAFT })
      .exec();
  }

  async getAccountActivity(
    userId: string,
    accountCode: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<JournalEntry[]> {
    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = fromDate;
    if (toDate) dateFilter.$lte = toDate;

    // First get the account to find its _id
    const account = await this.journalEntryModel.db
      .collection("accounts")
      .findOne({
        userId,
        accountCode,
      });

    if (!account) {
      return [];
    }

    const query: any = {
      userId,
      status: JournalEntryStatus.POSTED,
      "entries.accountId": account._id,
    };

    if (Object.keys(dateFilter).length > 0) {
      query.date = dateFilter;
    }

    return this.journalEntryModel
      .find(query)
      .populate(
        "entries.accountId",
        "accountCode accountName accountType normalBalance currency",
      )
      .sort({ date: -1 })
      .exec();
  }

  private async generateJournalEntryId(userId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;

    // Find the highest number for this year and user
    const lastEntry = await this.journalEntryModel
      .findOne({
        userId,
        journalEntryId: { $regex: `^${prefix}` },
      })
      .sort({ journalEntryId: -1 })
      .exec();

    let nextNumber = 1;
    if (lastEntry) {
      const lastNumber = parseInt(
        lastEntry.journalEntryId.split("-").pop() || "0",
      );
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(6, "0")}`;
  }
}
