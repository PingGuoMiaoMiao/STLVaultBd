import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { diskStorage } from 'multer';

/** 上传根目录，默认 server/uploads；可用 UPLOAD_DIR 覆盖 */
export const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

const MODEL_EXTS = new Set(['.glb', '.gltf']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/**
 * multipart 上传配置：
 * - model 字段 → uploads/models/
 * - image 字段 → uploads/covers/
 * 文件名统一用 UUID，避免中文/重名把磁盘搞乱。
 */
export const modelUploadOptions = {
  storage: diskStorage({
    destination: (_req, file, cb) => {
      const sub =
        file.fieldname === 'image'
          ? 'covers'
          : file.fieldname === 'avatar'
            ? 'avatars'
            : 'models';
      const dir = join(UPLOAD_ROOT, sub);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 单个文件上限 100MB
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    if (file.fieldname === 'model' && MODEL_EXTS.has(ext)) {
      return cb(null, true);
    }
    if (file.fieldname === 'image' && IMAGE_EXTS.has(ext)) {
      return cb(null, true);
    }
    if (file.fieldname === 'avatar' && IMAGE_EXTS.has(ext)) {
      return cb(null, true);
    }
    cb(new BadRequestException('文件格式不支持'), false);
  },
};

/** 头像只收单张图片 */
export const avatarUploadOptions = {
  ...modelUploadOptions,
  limits: { fileSize: 5 * 1024 * 1024 }, // 头像 5MB 上限
};
