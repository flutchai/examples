import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { AccountType, NormalBalance, Currency } from "../../common/types";

@Schema({ timestamps: true })
export class Account extends Document {
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ required: true })
  accountCode: string;

  @Prop({ required: true })
  accountName: string;

  @Prop({ required: true, enum: AccountType })
  accountType: AccountType;

  @Prop({ required: true, enum: NormalBalance })
  normalBalance: NormalBalance;

  @Prop({ type: String, default: null })
  parentAccount?: string;

  @Prop({ required: true, default: 0 })
  balance: number;

  @Prop({ required: true })
  userId: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  @Prop({ enum: Currency, default: Currency.USD })
  currency: Currency;

  // Virtual for formatted account display
  get displayName(): string {
    return `${this.accountCode} - ${this.accountName}`;
  }

  // Helper methods
  isDebitAccount(): boolean {
    return this.normalBalance === NormalBalance.DEBIT;
  }

  isCreditAccount(): boolean {
    return this.normalBalance === NormalBalance.CREDIT;
  }

  canBeDebited(): boolean {
    return [AccountType.ASSET, AccountType.EXPENSE].includes(this.accountType);
  }

  canBeCredited(): boolean {
    return [
      AccountType.LIABILITY,
      AccountType.EQUITY,
      AccountType.REVENUE,
    ].includes(this.accountType);
  }
}

export const AccountSchema = SchemaFactory.createForClass(Account);
export type AccountDocument = Account & Document;

// Add virtual fields
AccountSchema.virtual("displayName").get(function () {
  return `${this.accountCode} - ${this.accountName}`;
});

// Add indexes for performance
AccountSchema.index({ userId: 1, accountCode: 1 }, { unique: true });
AccountSchema.index({ userId: 1, accountType: 1 });
AccountSchema.index({ userId: 1, isActive: 1 });
