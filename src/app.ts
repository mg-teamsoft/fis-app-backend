import express from 'express';
import uploadRoutes from './routes/upload';
import jobRoutes from './routes/jobs';
import cors from "cors";
import { setupSwagger } from './configs/swagger';

const app = express();
app.use(cors())
app.use(express.json());

app.use('/upload', uploadRoutes);
app.use('/', jobRoutes);

//  Setup Swagger API Docs
setupSwagger(app);

export default app;