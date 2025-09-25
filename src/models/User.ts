import { Schema, model, models, Document } from "mongoose";

export interface UserDoc extends Document {
  userId: string;        // your internal id (string)
  userName: string;      // display/login name
  email?: string | null;
  passwordHash: string;  // bcrypt hash
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>({
  userId:   { type: String, required: true, unique: true, index: true },
  userName: { type: String, required: true, unique: true, index: true },
  email:    { type: String, default: null },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

export const UserModel = (models.User as any) || model<UserDoc>("User", UserSchema);