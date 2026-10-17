/**
 * Content-based file type detection.
 *
 * The `Content-Type` a client sends is attacker-controlled, so uploads are
 * validated against the file's actual magic bytes. The detected type — not the
 * client-supplied filename — decides the stored extension, which prevents a
 * `.html`/`.svg` payload from being written and later served from the API
 * origin (stored XSS).
 */

export type DetectedKind = 'image' | 'pdf' | 'doc' | 'unknown';

export interface DetectedFile {
  kind: DetectedKind;
  /** Safe, server-derived extension including the leading dot. */
  ext: string;
  /** Canonical MIME type derived from the bytes. */
  mime: string;
}

const startsWith = (buf: Buffer, signature: number[], offset = 0): boolean =>
  signature.every((byte, i) => buf[offset + i] === byte);

export const detectFileType = (buf: Buffer): DetectedFile => {
  // --- Images -------------------------------------------------------------
  // JPEG: FF D8 FF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', ext: '.jpg', mime: 'image/jpeg' };

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', ext: '.png', mime: 'image/png' };
  }

  // GIF: "GIF8" (not in the image allowlist, but detected so it is rejected cleanly)
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return { kind: 'unknown', ext: '.gif', mime: 'image/gif' };

  // WEBP: "RIFF" .... "WEBP" at offset 8
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    return { kind: 'image', ext: '.webp', mime: 'image/webp' };
  }

  // AVIF/HEIF: "ftyp" box at offset 4, brand at offset 8
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', ext: '.avif', mime: 'image/avif' };
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand === 'mif1') {
      return { kind: 'image', ext: '.heic', mime: 'image/heic' };
    }
  }

  // --- Documents ----------------------------------------------------------
  // PDF: "%PDF-"
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') {
    return { kind: 'pdf', ext: '.pdf', mime: 'application/pdf' };
  }

  // Legacy DOC (OLE2 compound file): D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { kind: 'doc', ext: '.doc', mime: 'application/msword' };
  }

  // DOCX (and any other OOXML/zip container): "PK\x03\x04"
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    return { kind: 'doc', ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  return { kind: 'unknown', ext: '', mime: 'application/octet-stream' };
};

/** Extensions that must never be written to a web-served directory. */
const NEVER_SERVED = new Set([
  '.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.php', '.phtml', '.shtml',
]);

/**
 * Derives a safe stored filename from the detected content.
 * The client filename is used only as an opaque prefix, never as the extension.
 */
export const safeStoredName = (detected: DetectedFile, randomPrefix: string): string => {
  const ext = NEVER_SERVED.has(detected.ext.toLowerCase()) ? '.bin' : detected.ext || '.bin';
  return `${randomPrefix}${ext}`;
};