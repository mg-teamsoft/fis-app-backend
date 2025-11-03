import { Multer } from 'multer';

declare global {
  namespace Express {
    interface Request {
      remainingQuota?: number;
      activePlans?: UserPlanModel[];
      file?: Multer.File;
      files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
    }
  }
}

export {};