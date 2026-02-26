import type { VitraBook, VitraBookMetadata } from '../types/vitraBook';

interface StringReadOptions {
  readonly buffer?: ArrayBuffer;
  readonly offset?: number;
  readonly length?: number;
  readonly encoding?: string;
}

export abstract class VitraBaseParser {
  protected readonly buffer: ArrayBuffer;
  protected readonly filename: string;

  constructor(buffer: ArrayBuffer, filename: string) {
    this.buffer = buffer;
    this.filename = filename;
  }

  abstract parse(): Promise<VitraBook>;

  async getMetadata(): Promise<VitraBookMetadata> {
    const parsed = await this.parse();
    return parsed.metadata;
  }

  protected readString(options: StringReadOptions = {}): string {
    const target = options.buffer ?? this.buffer;
    const offset = options.offset ?? 0;
    const limit = options.length ?? Math.max(0, target.byteLength - offset);
    const encoding = options.encoding ?? 'ascii';
    return new TextDecoder(encoding).decode(new Uint8Array(target, offset, limit));
  }

  protected readUint32BE(offset: number, buffer: ArrayBuffer = this.buffer): number {
    return new DataView(buffer).getUint32(offset, false);
  }

  protected readUint16BE(offset: number, buffer: ArrayBuffer = this.buffer): number {
    return new DataView(buffer).getUint16(offset, false);
  }
}

