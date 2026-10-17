import type { Response } from 'express';

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  [key: string]: unknown;
}

/** A 24-character hex string is a Mongo ObjectId. */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Recursively rewrites Mongo `_id` to `id`.
 *
 * Applied centrally at the response boundary so the contract is uniform
 * everywhere: clients read `id`, never `_id`. Resources that previously leaked
 * raw documents (the amenity master, requirements, admin listings, populated
 * references) broke any consumer reading `.id` — the marketplace amenity filter
 * was sending `undefined`.
 *
 * Only genuine ObjectIds are renamed. An aggregation grouping key such as
 * `{ _id: 'budget', count: 4 }` keeps its `_id`, because there `id` would be a
 * misleading name for a category.
 */
export const normaliseIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normaliseIds);
  if (value === null || typeof value !== 'object') return value;
  // Leave primitives-ish objects (Dates, Buffers) untouched.
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  /**
   * A mongoose ObjectId is an OBJECT, not a string — even after `.lean()` it
   * only *serialises* to hex. It is converted to its hex string here so the id
   * check below always sees the same shape.
   */
  if (typeof (value as { toHexString?: unknown }).toHexString === 'function') {
    return (value as unknown as { toHexString(): string }).toHexString();
  }

  /**
   * Controllers that skip `.lean()` hand us a mongoose Document. Its fields live
   * on an internal `_doc`, so iterating `Object.entries` would find nothing —
   * convert to a plain object first, otherwise every such endpoint leaks `_id`.
   */
  if (typeof (value as { toObject?: unknown }).toObject === 'function') {
    return normaliseIds((value as { toObject: () => unknown }).toObject());
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(source)) {
    // Normalise the value FIRST so an ObjectId becomes a hex string.
    const normalised = normaliseIds(val);
    if (key === '_id') {
      // A real ObjectId becomes `id`, and never shadows an existing id.
      if (typeof normalised === 'string' && OBJECT_ID.test(normalised)) {
        if (out.id === undefined && source.id === undefined) out.id = normalised;
        continue;
      }
      // An aggregation grouping key such as `{ _id: 'budget', count: 4 }` is
      // not a document, so it keeps its `_id`.
      out._id = normalised;
      continue;
    }
    out[key] = normalised;
  }
  return out;
};

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  meta?: Meta,
): Response => {
  const body: Record<string, unknown> = { success: true, message };
  if (data !== undefined) body.data = normaliseIds(data);
  if (meta !== undefined) body.meta = normaliseIds(meta);
  return res.status(statusCode).json(body);
};

export const sendOk = <T>(res: Response, message: string, data?: T, meta?: Meta): Response =>
  sendSuccess(res, 200, message, data, meta);

export const sendCreated = <T>(res: Response, message: string, data?: T, meta?: Meta): Response =>
  sendSuccess(res, 201, message, data, meta);

export const sendNoContent = (res: Response): Response => res.status(204).send();

/**
 * Normalises a Mongo document for the API surface.
 *
 * Every endpoint exposes resources as `{ id, ... }` rather than the raw
 * `{ _id, ... }`, so clients never have to know about the database's id field.
 * Resources that returned raw documents (the amenity master) broke every
 * consumer that read `.id` — the marketplace amenity filter silently sent
 * `undefined` ids.
 */
export const withId = <T extends Record<string, unknown>>(doc: T): T & { id: string } => {
  if (!doc) return doc as T & { id: string };
  const { _id, ...rest } = doc as T & { _id?: unknown };
  const id = _id ? String(_id) : ((doc as Record<string, unknown>).id as string);
  return { ...(rest as Record<string, unknown>), id } as T & { id: string };
};

/** Maps a list of Mongo documents through {@link withId}. */
export const withIds = <T extends Record<string, unknown>>(docs: T[]): Array<T & { id: string }> =>
  (docs ?? []).map((d) => withId(d));

export const paginationMeta = (page: number, limit: number, total: number): Meta => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  hasNext: page * limit < total,
  hasPrev: page > 1,
});