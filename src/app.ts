import express from 'express';
import uploadRoutes from './routes/upload';
import jobRoutes from './routes/jobs';
import cors from "cors";
import { setupSwagger } from './configs/swagger';
import excelRoutes from './routes/excelFile';
import { connectMongo } from './db/mongo';
import ruleRoutes from "./routes/rules";
import templateRoutes from "./routes/excelTemplate";
import authRoutes from "./routes/auth";
import fileRoutes from "./routes/files";
import uploadByKeyRoutes from "./routes/uploadByKey";
import receiptRoutes from "./routes/receipts";
import planRoutes, { publicPlanRoutes } from "./routes/plans";
import homeSummaryRoutes from "./routes/homeSummary";
import userRoutes from "./routes/users";
import userPlanRoutes from "./routes/userPlans";
import purchaseRoutes from "./routes/purchasesRoutes";
import contactRoutes, { publicContactRoutes } from "./routes/contacts";
import notificationRoutes from "./routes/notifications";

import { requireAuth } from './middleware/authJwt';
import morgan from "morgan";
import { healthRouter } from './routes/health';
import iapRoutes from './routes/iapRoutes';
import supervisorRoutes from './routes/supervisorRoutes';
import config from './configs/config';

const app = express();
const allowedOrigins = [
  config.frontendUrl,
];

const corsOptions = {
  origin: [...allowedOrigins],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());


morgan(':method :url :status :res[content-length] - :response-time ms')
app.use(morgan('combined'));

console.log("Mongo starting...");
connectMongo().catch((e) => {
  console.error("Mongo connection error:", e);
  process.exit(1);
});

// public health check endpoints
app.use("/health-me", healthRouter);

// public auth endpoints
app.use("/auth", authRoutes);
app.use("/plans", publicPlanRoutes);
app.use("/contacts", publicContactRoutes);

// Secure these route groups
app.use('/image', requireAuth(), uploadRoutes);
app.use('/job', requireAuth(), jobRoutes);
app.use('/excel', requireAuth(), excelRoutes);
app.use("/rule", requireAuth(), ruleRoutes);
app.use("/template", requireAuth(), templateRoutes);
app.use("/file", requireAuth(), fileRoutes);
app.use("/upload", requireAuth(), uploadByKeyRoutes);
app.use("/receipts", requireAuth(), receiptRoutes);
app.use("/plans", requireAuth(), planRoutes);
app.use("/home", requireAuth(), homeSummaryRoutes);
app.use("/users", requireAuth(), userRoutes);
app.use("/user-plans", requireAuth(), userPlanRoutes);
app.use("/iap", requireAuth(), iapRoutes);
app.use("/purchases", requireAuth(), purchaseRoutes);
app.use("/contacts", requireAuth(), contactRoutes);
app.use("/supervisor", requireAuth(), supervisorRoutes);
app.use("/notifications", requireAuth(), notificationRoutes);

//  Setup Swagger API Docs
setupSwagger(app);

export default app;
