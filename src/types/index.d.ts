import type { UserPlanModel } from '../models/UserPlanModel';

declare module 'express-serve-static-core' {
  interface Request {
    remainingQuota?: number;
    activePlans?: UserPlanModel[];
    file?: Express.Multer.File;
    files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  }
}

