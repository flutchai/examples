import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  PendingAccountPlan,
  PendingAccountPlanDocument,
  PendingAccountPlanStatus,
} from "./pending-account-plan.entity";

@Injectable()
export class PendingAccountPlanRepository {
  constructor(
    @InjectModel(PendingAccountPlan.name)
    private model: Model<PendingAccountPlanDocument>
  ) {}

  async create(data: Partial<PendingAccountPlan>): Promise<PendingAccountPlan> {
    const plan = new this.model(data);
    return plan.save();
  }

  async findById(id: string): Promise<PendingAccountPlan | null> {
    return this.model.findById(id).exec();
  }

  async findByConversationId(
    conversationId: string,
    status?: PendingAccountPlanStatus
  ): Promise<PendingAccountPlan[]> {
    const query: any = { conversationId };
    if (status) {
      query.status = status;
    }
    return this.model.find(query).sort({ createdAt: -1 }).exec();
  }

  async findPendingByUserId(userId: string): Promise<PendingAccountPlan[]> {
    return this.model
      .find({ userId, status: PendingAccountPlanStatus.PENDING })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateStatus(
    id: string,
    status: PendingAccountPlanStatus,
    createdJournalEntryId?: Types.ObjectId
  ): Promise<PendingAccountPlan | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { status, ...(createdJournalEntryId && { createdJournalEntryId }) },
        { new: true }
      )
      .exec();
  }

  async deleteById(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
