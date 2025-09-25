import { Schema, model, models } from "mongoose";

export interface UserRulesDoc {
  userId: string;                 // who owns these rules
  rulesString: string;            // raw: "K=V;K2=V2"
  rules: Record<string, any>;     // parsed JSON for convenience
  updatedAt: Date;
  createdAt: Date;
}

const UserRulesSchema = new Schema<UserRulesDoc>(
  {
    userId: { type: String, index: true, required: true, unique: true },
    rulesString: { type: String, required: true },
    rules: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const UserRulesModel =
  models.UserRules || model<UserRulesDoc>("UserRules", UserRulesSchema);