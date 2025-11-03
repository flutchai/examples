import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { Currency, AccountType } from "../../common/types";

export type PendingAccountPlanDocument = PendingAccountPlan & Document;

export enum PendingAccountPlanStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  REJECTED = "REJECTED",
}

export interface PendingAccountData {
  code: string;
  name: string;
  type: AccountType;
  currency: Currency;
  parentCode?: string;
}

export interface TransactionData {
  description: string;
  date: Date;
  reference?: string;
  currency: Currency;
  entries: Array<{
    accountCode: string;
    description: string;
    debitAmount: number;
    creditAmount: number;
    currency: Currency;
  }>;
}

@Schema({ timestamps: true })
export class PendingAccountPlan extends Document {
  _id: Types.ObjectId;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  conversationId: string;

  @Prop({ type: [Object], required: true })
  accountsToCreate: PendingAccountData[];

  @Prop({ type: Object, required: true })
  transactionToCreate: TransactionData;

  @Prop({
    type: String,
    enum: Object.values(PendingAccountPlanStatus),
    default: PendingAccountPlanStatus.PENDING,
  })
  status: PendingAccountPlanStatus;

  @Prop({ type: Types.ObjectId, ref: "JournalEntry" })
  createdJournalEntryId?: Types.ObjectId;
}

export const PendingAccountPlanSchema =
  SchemaFactory.createForClass(PendingAccountPlan);
