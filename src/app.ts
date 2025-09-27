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
import { requireAuth } from './middleware/authJwt';
import morgan from "morgan";
import { healthRouter } from './routes/health';

const app = express();
app.use(cors())
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

// Secure these route groups
app.use('/image', requireAuth(), uploadRoutes);
app.use('/job', requireAuth(), jobRoutes);
app.use('/excel', requireAuth(), excelRoutes);
app.use("/rule", requireAuth(), ruleRoutes);
app.use("/template", requireAuth(), templateRoutes);
app.use("/file", requireAuth(), fileRoutes);
app.use("/upload", requireAuth(), uploadByKeyRoutes);

//  Setup Swagger API Docs
setupSwagger(app);

export default app;