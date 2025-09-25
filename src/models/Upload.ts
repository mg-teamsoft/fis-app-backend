import { Request } from 'express';
import { Multer } from 'multer';

interface UploadRequest extends Request {
  file: Express.Multer.File;
}