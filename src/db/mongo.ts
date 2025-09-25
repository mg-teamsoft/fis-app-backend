import mongoose from "mongoose";

export async function connectMongo(uri = process.env.MONGODB_URI as string) {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (mongoose.connection.readyState === 1) return; // already connected
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  // Optional: log
  // console.log("Mongo connected");
}