import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env, hasCloudinary } from '../config/env';
import { ApiError } from './ApiError';
import { detectFileType, safeStoredName, type DetectedFile, type DetectedKind } from './fileSniff';

export type UploadKind = 'image' | 'document' | 'floor_plan' | 'brochure';

export interface StoredFile {
  url: string;
  publicId: string;
  format: string;
  size: number;
  kind: UploadKind;
  /** 'cloudinary' | 's3' | 'local' */
  provider: 'cloudinary' | 's3' | 'local';
}

let configured = false;

const configureCloudinary = (): boolean => {
  if (!hasCloudinary()) return false;
  if (!configured) {
    cloudinary.config({
      secure: true,
      url: env.cloudinaryUrl,
    });
    configured = true;
  }
  return true;
};

const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Development fallback: files are written to ./uploads and served statically.
 * Production always requires Cloudinary (or an S3-compatible adapter) so that
 * binaries are never stored in MongoDB.
 */
const storeLocally = (file: Express.Multer.File, kind: UploadKind): StoredFile => {
  const bucket = kind === 'image' ? 'images' : kind === 'document' ? 'documents' : kind;
  const dir = path.join(LOCAL_UPLOAD_DIR, bucket);
  fs.mkdirSync(dir, { recursive: true });
  const safeName = crypto.randomBytes(12).toString('hex');
  // The extension comes from the detected content, NEVER from the client
  // filename — otherwise an .html/.svg payload would be written into a
  // web-served directory and execute on the API origin.
  const detected = detectFileType(file.buffer);
  const filename = safeStoredName(detected, safeName);
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return {
    url: `/uploads/${bucket}/${filename}`,
    publicId: `local/${bucket}/${filename}`,
    format: path.extname(filename).replace('.', '') || 'bin',
    size: file.size,
    kind,
    provider: 'local',
  };
};

/** MIME types accepted for each upload kind, derived from the real content. */
const ALLOWED_BY_KIND: Record<UploadKind, DetectedKind[]> = {
  image: ['image'],
  document: ['pdf', 'doc', 'image'],
  floor_plan: ['pdf', 'image'],
  brochure: ['pdf', 'doc', 'image'],
};

/**
 * Single validation choke point for every upload in the application.
 *
 * Even though routes already filter on the declared MIME type, the decisive
 * check happens here against the actual bytes, so no code path can write a
 * disguised HTML/SVG/executable payload to storage.
 */
const assertAllowedContent = (buffer: Buffer, kind: UploadKind): DetectedFile => {
  const detected = detectFileType(buffer);
  if (!ALLOWED_BY_KIND[kind].includes(detected.kind)) {
    throw ApiError.badRequest(
      `Unsupported file content for ${kind.replace('_', ' ')} uploads (detected ${detected.mime}). ` +
        `Allowed: ${ALLOWED_BY_KIND[kind].join(', ')}.`,
    );
  }
  return detected;
};

export const uploadBuffer = async (
  buffer: Buffer,
  options: { filename: string; kind: UploadKind; mimetype: string },
): Promise<StoredFile> => {
  const detected = assertAllowedContent(buffer, options.kind);
  if (configureCloudinary()) {
    const folder = `flattown/${options.kind === 'image' ? 'images' : 'documents'}`;
    // public_id is server-generated: a client-supplied name could inject
    // traversal segments or collide with an existing asset.
    const publicId = `${detected.ext.replace('.', '')}-${crypto.randomBytes(10).toString('hex')}`;
    return new Promise<StoredFile>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: options.kind === 'image' ? 'image' : 'raw',
          public_id: publicId,
          ...(options.kind === 'image' ? { quality: 'auto', fetch_format: 'auto' } : {}),
        },
        (error, result) => {
          if (error || !result) return reject(ApiError.internal('Image upload failed'));
          return resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            size: result.bytes,
            kind: options.kind,
            provider: 'cloudinary',
          });
        },
      );
      (stream as NodeJS.WritableStream).end(buffer);
    });
  }

  if (env.isProd) {
    throw ApiError.internal('File storage is not configured (set CLOUDINARY_URL)');
  }

  return storeLocally(
    { buffer, originalname: options.filename, size: buffer.length } as Express.Multer.File,
    options.kind,
  );
};

export const deleteStoredFile = async (publicId: string | undefined): Promise<void> => {
  if (!publicId) return;
  if (publicId.startsWith('local/')) {
    const rel = publicId.replace('local/', '');
    const target = path.join(LOCAL_UPLOAD_DIR, rel);
    // Guard against path traversal.
    if (!path.resolve(target).startsWith(LOCAL_UPLOAD_DIR)) return;
    fs.promises.unlink(target).catch(() => undefined);
    return;
  }
  if (configureCloudinary()) {
    await cloudinary.uploader.destroy(publicId).catch(() => undefined);
  }
};

export const localUploadsDir = LOCAL_UPLOAD_DIR;
export const storageMode = (): 'cloudinary' | 's3' | 'local' =>
  hasCloudinary() ? 'cloudinary' : env.awsBucket ? 's3' : 'local';