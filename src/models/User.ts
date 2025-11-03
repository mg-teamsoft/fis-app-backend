import { Schema, model, models, Document } from "mongoose";

export interface UserDoc extends Document {
  userId: string;        // your internal id (string)
  userName: string;      // display/login name
  email?: string | null;
  passwordHash: string;  // bcrypt hash
  emailVerified: boolean;
  verificationToken?: string | null;
  verificationTokenExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>({
  userId:   { type: String, required: true, unique: true, index: true },
  userName: { type: String, required: true, unique: true, index: true },
  email:    { type: String, required: true, unique: true, index: true, default: null },
  passwordHash: { type: String, required: true },
  emailVerified: { type: Boolean, default: false },
  verificationToken: { type: String, index: true },
  verificationTokenExpires: { type: Date },
  passwordResetToken: { type: String, index: true, default: null },
  passwordResetExpires: { type: Date, default: null },
}, { timestamps: true });


export const UserModel = (models.User as any) || model<UserDoc>("User", UserSchema);
