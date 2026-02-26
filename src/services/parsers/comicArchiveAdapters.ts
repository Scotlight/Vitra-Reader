import { unzipSync } from 'fflate';

// ═══════════════════════════════════════════════════════
// 归档解压适配器 — 统一 ArchiveLoader 接口
// ═══════════════════════════════════════════════════════

export interface ArchiveEntry {
  readonly filename: string;
  readonly size: number;
}

export interface ArchiveLoader {
  readonly entries: readonly ArchiveEntry[];
  loadBlob(filename: string): Promise<Blob>;
  destroy(): void;
}

// ───────────────────────── ZIP (CBZ) ─────────────────────────

export function createZipLoader(buffer: ArrayBuffer): ArchiveLoader {
  const data = new Uint8Array(buffer);
  const unzipped = unzipSync(data);

  const entryMap = new Map<string, Uint8Array>();
  const entries: ArchiveEntry[] = [];

  for (const [name, content] of Object.entries(unzipped)) {
    // 跳过目录（fflate 中目录内容为空 Uint8Array 且以 / 结尾）
    if (name.endsWith('/') && content.length === 0) continue;
    entryMap.set(name, content);
    entries.push({ filename: name, size: content.length });
  }

  return {
    entries,
    async loadBlob(filename: string): Promise<Blob> {
      const content = entryMap.get(filename);
      if (!content) throw new Error(`ZIP entry not found: ${filename}`);
      return new Blob([content]);
    },
    destroy() {
      entryMap.clear();
    },
  };
}

// ───────────────────────── TAR (CBT) ─────────────────────────

const TAR_BLOCK_SIZE = 512;

export function createTarLoader(buffer: ArrayBuffer): ArchiveLoader {
  const data = new Uint8Array(buffer);
  const entryMap = new Map<string, Uint8Array>();
  const entries: ArchiveEntry[] = [];

  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= data.length) {
    const header = data.subarray(offset, offset + TAR_BLOCK_SIZE);

    // 空头部 = 归档结尾
    if (header.every((b) => b === 0)) break;

    // 文件名：前 100 字节，null 终止
    const nameBytes = header.subarray(0, 100);
    const nullIdx = nameBytes.indexOf(0);
    const filename = new TextDecoder().decode(
      nullIdx >= 0 ? nameBytes.subarray(0, nullIdx) : nameBytes,
    );

    // 文件大小：字节 124-135，八进制 ASCII
    const sizeOctal = new TextDecoder().decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
    const fileSize = parseInt(sizeOctal, 8) || 0;

    // 类型标志：字节 156，'0' 或 null = 普通文件
    const typeFlag = header[156];
    const isFile = typeFlag === 0 || typeFlag === 0x30; // '0'

    offset += TAR_BLOCK_SIZE;

    if (isFile && fileSize > 0 && filename) {
      const content = data.slice(offset, offset + fileSize);
      entryMap.set(filename, new Uint8Array(content));
      entries.push({ filename, size: fileSize });
    }

    // 跳过文件数据（对齐到 512 字节边界）
    offset += Math.ceil(fileSize / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return {
    entries,
    async loadBlob(filename: string): Promise<Blob> {
      const content = entryMap.get(filename);
      if (!content) throw new Error(`TAR entry not found: ${filename}`);
      return new Blob([content]);
    },
    destroy() {
      entryMap.clear();
    },
  };
}

// ───────────────────────── RAR (CBR) — 占位 ─────────────────────────

export function createRarLoader(_buffer: ArrayBuffer): ArchiveLoader {
  throw new Error(
    'CBR (RAR) 格式需要 WASM 解压库，当前尚未集成。\n'
    + '请将文件转换为 CBZ (ZIP) 格式后重试。',
  );
}

// ───────────────────────── 7z (CB7) — 占位 ─────────────────────────

export function create7zLoader(_buffer: ArrayBuffer): ArchiveLoader {
  throw new Error(
    'CB7 (7z) 格式需要 WASM 解压库，当前尚未集成。\n'
    + '请将文件转换为 CBZ (ZIP) 格式后重试。',
  );
}
