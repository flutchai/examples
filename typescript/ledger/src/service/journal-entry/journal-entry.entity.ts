import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { JournalEntryStatus, Currency } from "../../common/types";

@Schema({ _id: false })
export class JournalEntryLine {
  // Reference to Account document
  // Required for POSTED entries, optional for DRAFT (uses pendingAccountData instead)
  @Prop({ type: Types.ObjectId, ref: "Account", required: false })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, default: 0 })
  debitAmount: number;

  @Prop({ required: true, default: 0 })
  creditAmount: number;

  @Prop({ required: true })
  lineNumber: number;

  @Prop({ enum: Currency, default: Currency.USD })
  currency: Currency;

  // For DRAFT entries: data needed to create account when confirmed
  // Contains full account details since Account document doesn't exist yet
  @Prop({ type: Object, required: false })
  pendingAccountData?: {
    code: string;
    name: string;
    type: string;
    currency: string;
    parentCode?: string;
  };

  // Helper methods
  get amount(): number {
    return this.debitAmount || this.creditAmount;
  }

  get isDebit(): boolean {
    return this.debitAmount > 0;
  }

  get isCredit(): boolean {
    return this.creditAmount > 0;
  }
}

@Schema({ timestamps: true })
export class JournalEntry extends Document {
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ required: true, unique: true })
  journalEntryId: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  description: string;

  @Prop()
  reference?: string;

  @Prop({ required: true })
  userId: string;

  @Prop({
    required: true,
    enum: JournalEntryStatus,
    default: JournalEntryStatus.DRAFT,
  })
  status: JournalEntryStatus;

  @Prop({ required: true })
  totalDebit: number;

  @Prop({ required: true })
  totalCredit: number;

  @Prop({ type: [JournalEntryLine], required: true })
  entries: JournalEntryLine[];

  @Prop()
  reversedFromId?: Types.ObjectId;

  @Prop()
  reversedById?: Types.ObjectId;

  @Prop()
  postedAt?: Date;

  @Prop()
  reversedAt?: Date;

  @Prop({ enum: Currency, default: Currency.USD })
  currency: Currency;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // Virtual methods
  get isBalanced(): boolean {
    return Math.abs(this.totalDebit - this.totalCredit) < 0.01; // Allow for floating point precision
  }

  get isDraft(): boolean {
    return this.status === JournalEntryStatus.DRAFT;
  }

  get isPosted(): boolean {
    return this.status === JournalEntryStatus.POSTED;
  }

  get isReversed(): boolean {
    return this.status === JournalEntryStatus.REVERSED;
  }

  // Helper methods
  calculateTotals(): { totalDebit: number; totalCredit: number } {
    const totalDebit = this.entries.reduce(
      (sum, entry) => sum + entry.debitAmount,
      0
    );
    const totalCredit = this.entries.reduce(
      (sum, entry) => sum + entry.creditAmount,
      0
    );
    return { totalDebit, totalCredit };
  }

  validateEntry(): string[] {
    const errors: string[] = [];

    if (this.entries.length === 0) {
      errors.push("Journal entry must have at least one line");
    }

    if (this.entries.length === 1) {
      errors.push(
        "Journal entry must have at least two lines (debit and credit)"
      );
    }

    if (!this.isBalanced) {
      errors.push(
        `Journal entry is not balanced: Debit=${this.totalDebit}, Credit=${this.totalCredit}`
      );
    }

    // Check for duplicate line numbers
    const lineNumbers = this.entries.map(e => e.lineNumber);
    const uniqueLineNumbers = new Set(lineNumbers);
    if (lineNumbers.length !== uniqueLineNumbers.size) {
      errors.push("Duplicate line numbers found");
    }

    // Validate individual entries
    this.entries.forEach((entry, index) => {
      if (entry.debitAmount > 0 && entry.creditAmount > 0) {
        errors.push(
          `Line ${index + 1}: Entry cannot have both debit and credit amounts`
        );
      }
      if (entry.debitAmount === 0 && entry.creditAmount === 0) {
        errors.push(
          `Line ${index + 1}: Entry must have either debit or credit amount`
        );
      }
      if (entry.debitAmount < 0 || entry.creditAmount < 0) {
        errors.push(`Line ${index + 1}: Amounts cannot be negative`);
      }
    });

    return errors;
  }
}

export const JournalEntryLineSchema =
  SchemaFactory.createForClass(JournalEntryLine);
export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);
export type JournalEntryDocument = JournalEntry & Document;

// Add indexes for performance
JournalEntrySchema.index({ userId: 1, date: -1 });
JournalEntrySchema.index({ userId: 1, status: 1 });
JournalEntrySchema.index({ journalEntryId: 1 }, { unique: true });
JournalEntrySchema.index({ reference: 1 });
