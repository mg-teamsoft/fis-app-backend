import express from 'express';
import * as dotenv from 'dotenv';
import config from './configs/config';
import appRoutes from './app';
import { connectMongo } from './db/mongo';
import { apiRateLimiter } from './middleware/rateLimitMiddleware';

dotenv.config();

async function bootstrap() {
  await connectMongo();

  const app = express();
  const PORT = config.port;

  app.use(express.json());
  app.use('/api', apiRateLimiter, appRoutes);

  app.listen(PORT, () => {
    console.log(`🔧 Async OCR API running at http://localhost:${PORT}`);
    console.log(`📚 Swagger UI available at http://localhost:${PORT}/api-docs`);
  });
}

bootstrap();

