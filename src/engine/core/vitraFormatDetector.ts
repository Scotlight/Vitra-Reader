import type { VitraBookFormat } from '../types/vitraBook';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const RAR_MAGIC_PREFIX = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
const SEVEN_Z_MAGIC = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const DJVU_MAGIC = [0x41, 0x54, 0x26, 0x54, 0x46, 0x4f, 0x52, 0x4d];
const TAR_USTAR_OFFSET = 257;
const MOBI_MAGIC_OFFSET = 60;
const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_ENTRY_SCAN = 768;
const MIN_HEADER_SIZE = 30;
const MAX_MIMETYPE_LENGTH = 96;

const TEXT_FALLBACK_MAP: Record<string, VitraBookFormat> = {
  txt: 'TXT',
  fb2: 'FB2',
  md: 'MD',
  html: 'HTML',
  htm: 'HTM',
  xml: 'XML',
  xhtml: 'XHTML',
  mhtml: 'MHTML',
  docx: 'DOCX',
  djvu: 'DJVU',
  cbz: 'CBZ',
  cbt: 'CBT',
  cbr: 'CBR',
  cb7: 'CB7',
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'MOBI',
  azw3: 'AZW3',
  azw: 'AZW',
};

interface ZipLocalEntry {
  readonly name: string;
  readonly compression: number;
  readonly dataOffset: number;
  readonly compressedSize: number;
}

export async function detectVitraFormat(
  buffer: ArrayBuffer,
  filename: string,
): Promise<VitraBookFormat> {
  const binaryDetected = detectBinaryFormat(buffer, filename);
  if (binaryDetected) {
    return binaryDetected;
  }
  if (startsWithMagic(buffer, ZIP_MAGIC)) {
    return detectZipSubFormat(buffer, filename);
  }
  return detectByExtension(filename);
}

function detectBinaryFormat(
  buffer: ArrayBuffer,
  filename: string,
): VitraBookFormat | null {
  if (startsWithMagic(buffer, PDF_MAGIC)) return 'PDF';
  if (startsWithMagic(buffer, RAR_MAGIC_PREFIX)) return 'CBR';
  if (startsWithMagic(buffer, SEVEN_Z_MAGIC)) return 'CB7';
  if (startsWithMagic(buffer, DJVU_MAGIC)) return 'DJVU';
  if (isMobiLike(buffer)) return resolveMobiFamily(filename);
  if (isTarArchive(buffer)) return 'CBT';
  return null;
}

function detectZipSubFormat(buffer: ArrayBuffer, filename: string): VitraBookFormat {
  const entries = listZipLocalEntries(buffer, MAX_ZIP_ENTRY_SCAN);
  const names = entries.map((entry) => normalizeZipName(entry.name));
  if (isEpubContainer(buffer, entries, names)) return 'EPUB';
  if (isDocxContainer(names)) return 'DOCX';
  if (isLikelyComicArchive(names, filename)) return 'CBZ';
  return detectByExtension(filename, 'CBZ');
}

function isEpubContainer(
  buffer: ArrayBuffer,
  entries: readonly ZipLocalEntry[],
  names: readonly string[],
): boolean {
  if (names.includes('meta-inf/container.xml')) {
    return true;
  }
  const mimeEntry = entries.find((entry) => normalizeZipName(entry.name) === 'mimetype');
  if (!mimeEntry || mimeEntry.compression !== 0) {
    return false;
  }
  if (mimeEntry.compressedSize <= 0 || mimeEntry.compressedSize > MAX_MIMETYPE_LENGTH) {
    return false;
  }
  const mimeText = readAscii(buffer, mimeEntry.dataOffset, mimeEntry.compressedSize).trim();
  return mimeText === 'application/epub+zip';
}

function isDocxContainer(names: readonly string[]): boolean {
  const hasContentTypes = names.includes('[content_types].xml');
  const hasWordEntries = names.some((name) => name.startsWith('word/'));
  return hasContentTypes && hasWordEntries;
}

function isLikelyComicArchive(names: readonly string[], filename: string): boolean {
  const ext = getExtension(filename);
  if (ext === 'cbz') return true;
  if (names.length === 0) return false;
  return names.every((name) => {
    if (name.endsWith('/')) return true;
    return /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(name);
  });
}

function listZipLocalEntries(buffer: ArrayBuffer, maxEntries: number): ZipLocalEntry[] {
  const view = new DataView(buffer);
  const result: ZipLocalEntry[] = [];
  let offset = 0;

  while (offset + MIN_HEADER_SIZE <= buffer.byteLength && result.length < maxEntries) {
    const signature = view.getUint32(offset, true);
    if (signature !== ZIP_LOCAL_HEADER_SIGNATURE) break;

    const generalFlags = view.getUint16(offset + 6, true);
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameOffset = offset + MIN_HEADER_SIZE;
    const dataOffset = nameOffset + filenameLength + extraLength;
    const entryName = readAscii(buffer, nameOffset, filenameLength);

    result.push({ name: entryName, compression, dataOffset, compressedSize });

    if ((generalFlags & 0x08) !== 0 || compressedSize === 0) break;
    offset = dataOffset + compressedSize;
  }
  return result;
}

function startsWithMagic(buffer: ArrayBuffer, magic: readonly number[]): boolean {
  if (buffer.byteLength < magic.length) return false;
  const bytes = new Uint8Array(buffer, 0, magic.length);
  return magic.every((value, index) => bytes[index] === value);
}

function isTarArchive(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength <= TAR_USTAR_OFFSET + 5) return false;
  return readAscii(buffer, TAR_USTAR_OFFSET, 5) === 'ustar';
}

function isMobiLike(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength <= MOBI_MAGIC_OFFSET + 8) return false;
  return readAscii(buffer, MOBI_MAGIC_OFFSET, 8) === 'BOOKMOBI';
}

function resolveMobiFamily(filename: string): VitraBookFormat {
  const ext = getExtension(filename);
  if (ext === 'azw3') return 'AZW3';
  if (ext === 'azw') return 'AZW';
  return 'MOBI';
}

function detectByExtension(
  filename: string,
  fallback: VitraBookFormat = 'TXT',
): VitraBookFormat {
  const ext = getExtension(filename);
  return TEXT_FALLBACK_MAP[ext] ?? fallback;
}

function getExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf('.');
  if (index < 0 || index === normalized.length - 1) return '';
  return normalized.slice(index + 1);
}

function normalizeZipName(name: string): string {
  return name.replace(/\\/g, '/').toLowerCase();
}

function readAscii(buffer: ArrayBuffer, offset: number, length: number): string {
  if (offset < 0 || length <= 0 || offset >= buffer.byteLength) {
    return '';
  }
  const size = Math.min(length, buffer.byteLength - offset);
  return new TextDecoder('ascii').decode(new Uint8Array(buffer, offset, size));
}

