import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { detectFileType } from '../utils/fileSniff';
import type { UploadKind } from '../utils/storage';

const MAX_BYTES = env.maxUploadMb * 1024 * 1024;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Rejects any upload whose real content is not on the allowlist.
 *
 * The declared `Content-Type` is only used as an early, cheap filter; the
 * decisive check is the magic-byte signature, because a client can label an
 * HTML or SVG payload as `image/png`.
 */
export const enforceRealContentType =
  (allowed: DetectedKind[]) =>
  (_req: Request, _res: Response, next: NextFunction): void => {
    const files = [...((_req.files as Express.Multer.File[] | undefined) ?? []), ...(_req.file ? [_req.file] : [])];
    for (const file of files) {
      const detected = detectFileType(file.buffer);
      if (!allowed.includes(detected.kind)) {
        return next(
          ApiError.badRequest(
            `Unsupported file content${detected.mime ? ` (${detected.mime})` : ''}. ` +
              (allowed.includes('image') ? 'Allowed images: JPG, PNG, WEBP, AVIF.' : 'Allowed documents: PDF, images, DOC/DOCX.'),
          ),
        );
      }
      // Store the MIME we detected rather than the one the client claimed.
      file.mimetype = detected.mime;
    }
    return next();
  };

type DetectedKind = 'image' | 'pdf' | 'doc' | 'unknown';

/** Images only — property/project galleries and avatars. */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG, WEBP or AVIF images are allowed'));
    }
    return cb(null, true);
  },
});

/** Documents only — RERA proofs, KYC, floor plans, brochures, buyer KYC docs. */
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only PDF, JPG, PNG, WEBP or DOC/DOCX files are allowed'));
    }
    return cb(null, true);
  },
});

/** Rejects a request that carries a file larger than the configured limit. */
export const enforceFileSize = (req: Request, _res: Response, next: NextFunction): void => {
  const files = [
    ...((req.files as Express.Multer.File[] | undefined) ?? []),
    ...(req.file ? [req.file] : []),
  ];
  const oversized = files.find((f) => f.size > MAX_BYTES);
  if (oversized) {
    return next(ApiError.badRequest(`File exceeds the ${env.maxUploadMb}MB upload limit`));
  }
  return next();
};

export const mapUploadKind = (fieldName: string): UploadKind => {
  if (['images', 'avatar', 'image'].includes(fieldName)) return 'image';
  if (['floorPlans', 'floorPlan'].includes(fieldName)) return 'floor_plan';
  if (fieldName === 'brochure') return 'brochure';
  return 'document';
};