import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { diskStorage } from 'multer';

import { env } from '../common/utils/env';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function safeStem(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'file';
}

export const cropUploadOptions = {
  storage: diskStorage({
    destination: (_request: any, _file: any, callback: any) => {
      callback(null, env.uploadsRoot);
    },
    filename: (_request: any, file: any, callback: any) => {
      const extension = path.extname(file.originalname || '').toLowerCase().slice(0, 10) || '.bin';
      callback(null, `${Date.now()}-${safeStem(file.originalname)}-${randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_request: any, file: any, callback: any) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return callback(new Error('Only JPG, PNG, WEBP, and PDF uploads are allowed'), false);
    }
    callback(null, true);
  },
};
