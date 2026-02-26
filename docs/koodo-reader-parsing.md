# Vitra Engine — 电子书格式解析与向量化渲染 技术指导手册

> 本文档是 Vitra 阅读器引擎开发的最高指导手册。
> 100% 自研，不依赖任何闭源渲染引擎。所有格式解析基于公开规范（IDPF EPUB 3.3、MOBI PDB/EXTH、PDF ISO 32000、FB2 XML Schema 等），底层仅集成开源协议友好的第三方库作为解压/转换层。

---

## 第一部分：工程架构

### 1.1 Parser 类层次设计

```
src/engine/
├── core/
│   ├── types.ts                 # 统一 Book/Section/TOC 接口
│   ├── BaseParser.ts            # 抽象基类
│   ├── FormatDetector.ts        # Magic Bytes 格式嗅探
│   └── SectionSplitter.ts       # 通用 HTML 章节分割器
├── parsers/
│   ├── EpubParser.ts            # EPUB 2/3
│   ├── MobiParser.ts            # MOBI/AZW3/AZW (PDB + KF8/MOBI6)
│   ├── PdfParser.ts             # PDF (pdfjs-dist 封装)
│   ├── DjvuParser.ts            # DJVU (djvu.js 封装)
│   ├── TxtParser.ts             # TXT (编码检测 + 章节启发式)
│   ├── Fb2Parser.ts             # FB2 (XML → HTML 转换)
│   ├── DocxParser.ts            # DOCX (mammoth 封装)
│   ├── MdParser.ts              # Markdown (marked 封装)
│   ├── HtmlParser.ts            # HTML/HTM/XHTML/XML/MHTML
│   └── ComicParser.ts           # CBZ/CBT/CBR/CB7
├── renderers/
│   ├── VectorRenderer.ts        # Vitra 向量化渲染核心
│   ├── PdfCanvasRenderer.ts     # PDF Canvas 渲染
│   └── ComicImageRenderer.ts    # 漫画图片渲染
├── cache/
│   └── BookCache.ts             # IndexedDB 缓存层
└── index.ts                     # 统一导出
```

### 1.2 统一接口定义 (types.ts)

```ts
// ═══════════════════════════════════════════════════════
// Vitra Book Model — 所有 Parser 的输出必须符合此接口
// ═══════════════════════════════════════════════════════

export type BookFormat =
  | "EPUB" | "MOBI" | "AZW3" | "AZW"
  | "PDF" | "DJVU"
  | "TXT" | "FB2" | "DOCX" | "MD"
  | "HTML" | "HTM" | "XML" | "XHTML" | "MHTML"
  | "CBZ" | "CBT" | "CBR" | "CB7";

export type LayoutMode = "reflowable" | "pre-paginated";

export interface BookMetadata {
  title: string;
  author: string[];
  publisher?: string;
  description?: string;
  language?: string;
  identifier?: string;       // ISBN / UUID / ASIN
  published?: string;
  cover?: Blob | null;       // 封面原始 Blob
  subject?: string[];
  rights?: string;
}

export interface BookSection {
  id: string | number;
  href: string;
  load: () => Promise<string>;     // 返回 HTML 字符串或 Blob URL
  unload: () => void;              // 释放 Blob URL
  size: number;                    // 未压缩字节数
  linear?: boolean;                // 是否在主阅读流中
  pageSpread?: "left" | "right" | "center";
}

export interface TOCItem {
  label: string;
  href: string;
  children?: TOCItem[];
}

export interface VitraBook {
  format: BookFormat;
  metadata: BookMetadata;
  sections: BookSection[];
  toc: TOCItem[];
  layout: LayoutMode;
  direction: "ltr" | "rtl" | "auto";
  resolveHref: (href: string) => { index: number; anchor?: string } | null;
  getCover: () => Promise<Blob | null>;
  destroy: () => void;             // 释放所有资源
}
```

### 1.3 抽象基类 (BaseParser.ts)

```ts
export abstract class BaseParser {
  protected buffer: ArrayBuffer;
  protected filename: string;

  constructor(buffer: ArrayBuffer, filename: string) {
    this.buffer = buffer;
    this.filename = filename;
  }

  abstract parse(): Promise<VitraBook>;

  // 子类可选覆盖
  async getMetadata(): Promise<BookMetadata> {
    const book = await this.parse();
    return book.metadata;
  }

  // 通用工具: 从 ArrayBuffer 读取字符串
  protected getString(buf: ArrayBuffer, offset = 0, length?: number): string {
    return new TextDecoder("ascii").decode(
      new Uint8Array(buf, offset, length)
    );
  }

  // 通用工具: Big-Endian 读取 uint32
  protected getUint32BE(buf: ArrayBuffer, offset: number): number {
    return new DataView(buf).getUint32(offset, false);
  }

  // 通用工具: Big-Endian 读取 uint16
  protected getUint16BE(buf: ArrayBuffer, offset: number): number {
    return new DataView(buf).getUint16(offset, false);
  }
}
```

### 1.4 格式嗅探器 (FormatDetector.ts)

```ts
export async function detectFormat(
  buffer: ArrayBuffer,
  filename: string
): Promise<BookFormat> {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512));
  const head8 = Array.from(bytes.slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");

  // ── 二进制签名检测 ──

  // ZIP 容器 (EPUB / DOCX / CBZ)
  if (head8.startsWith("504b0304")) {
    return await detectZipSubFormat(buffer, filename);
  }
  // PDF: %PDF
  if (head8.startsWith("25504446")) return "PDF";
  // RAR4: Rar!\x1a\x07\x00  RAR5: Rar!\x1a\x07\x01\x00
  if (head8.startsWith("526172211a07")) return "CBR";
  // 7z: 7z\xbc\xaf\x27\x1c
  if (head8.startsWith("377abcaf271c")) return "CB7";
  // DJVU: AT&TFORM
  if (head8.startsWith("41542654464f524d")) return "DJVU";

  // MOBI/AZW: PDB header, 偏移 60 处 "BOOKMOBI"
  if (buffer.byteLength > 68) {
    const magic = new TextDecoder("ascii").decode(new Uint8Array(buffer, 60, 8));
    if (magic === "BOOKMOBI") {
      // 区分 AZW3 vs MOBI: 读取 MOBI header version
      // Record 0 偏移 0x24 (相对 Record 0 起始) = 文件版本
      // version >= 8 → KF8 (AZW3), 否则 MOBI6
      const ext = filename.split(".").pop()?.toLowerCase();
      if (ext === "azw3") return "AZW3";
      if (ext === "azw") return "AZW";
      return "MOBI";
    }
  }

  // TAR: 偏移 257 处 "ustar"
  if (buffer.byteLength > 262) {
    const tar = new TextDecoder("ascii").decode(new Uint8Array(buffer, 257, 5));
    if (tar === "ustar") return "CBT";
  }

  // ── 文本类: 按后缀 ──
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const textMap: Record<string, BookFormat> = {
    txt: "TXT", fb2: "FB2", md: "MD",
    html: "HTML", htm: "HTM", xml: "XML",
    xhtml: "XHTML", mhtml: "MHTML",
  };
  return textMap[ext] ?? "TXT";
}

async function detectZipSubFormat(
  buffer: ArrayBuffer,
  filename: string
): Promise<BookFormat> {
  // 快速检查: 读取 ZIP 中央目录，查找特征文件名
  // 实际实现中用 fflate 的 unzipSync 或 JSZip 列出条目
  const { entries } = await listZipEntries(buffer);
  const names = entries.map(e => e.filename);

  // EPUB: 包含 mimetype 文件且内容为 "application/epub+zip"
  if (names.includes("mimetype")) {
    const mimeContent = await readZipEntry(buffer, "mimetype");
    if (mimeContent?.trim() === "application/epub+zip") return "EPUB";
  }
  // 也有不规范的 EPUB 没有 mimetype 但有 META-INF/container.xml
  if (names.includes("META-INF/container.xml")) return "EPUB";

  // DOCX: 包含 [Content_Types].xml 和 word/document.xml
  if (names.includes("[Content_Types].xml") && names.some(n => n.startsWith("word/"))) {
    return "DOCX";
  }

  // CBZ: ZIP 内全是图片
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "cbz") return "CBZ";

  // 降级按后缀
  return "CBZ";
}
```

---

## 第二部分：格式规范与解析实现

### 2.1 EPUB (IDPF/W3C EPUB 3.3)

#### 2.1.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | `50 4B 03 04` (ZIP) |
| 二次确认 | ZIP 内 `mimetype` = `application/epub+zip` 或存在 `META-INF/container.xml` |
| 规范 | EPUB 3.3 (W3C Recommendation 2023-05-25) |
| MIME | `application/epub+zip` |

#### 2.1.2 容器结构

```
book.epub (ZIP, OCF 容器)
├── mimetype                          # 必须是第一个条目，STORE 模式（不压缩、不加密）
│                                     # 内容固定: "application/epub+zip"（无换行无BOM）
├── META-INF/
│   ├── container.xml                 # OCF 入口文件（必须）
│   ├── encryption.xml                # 加密信息（可选）
│   ├── signatures.xml                # 数字签名（可选）
│   ├── metadata.xml                  # 容器级元数据（可选）
│   └── rights.xml                    # DRM 信息（可选）
├── OEBPS/                            # 内容目录（路径由 container.xml 指定，可以是任意名）
│   ├── content.opf                   # Package Document（核心）
│   ├── toc.ncx                       # EPUB 2 导航（EPUB 3 中可选保留兼容）
│   ├── nav.xhtml                     # EPUB 3 导航文档（EPUB 3 必须）
│   ├── chapter*.xhtml                # 内容文档
│   ├── css/
│   ├── images/
│   └── fonts/
```

#### 2.1.3 container.xml 解析

```xml
<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
```

命名空间: `urn:oasis:names:tc:opendocument:xmlns:container`
提取: `getElementsByTagNameNS(NS, "rootfile")` → `full-path` 属性 → OPF 路径

#### 2.1.4 OPF Package Document 完整解析

```xml
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="uid" xml:lang="zh-CN">

  <!-- ═══ metadata: Dublin Core + OPF 扩展 ═══ -->
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier>
    <dc:title>书名</dc:title>
    <dc:creator id="creator1">作者名</dc:creator>
    <meta refines="#creator1" property="role" scheme="marc:relators">aut</meta>
    <meta refines="#creator1" property="file-as">姓, 名</meta>
    <dc:language>zh-CN</dc:language>
    <dc:publisher>出版社</dc:publisher>
    <dc:description>简介文本</dc:description>
    <dc:date>2024-01-01</dc:date>
    <dc:subject>分类标签</dc:subject>
    <dc:rights>版权声明</dc:rights>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
    <meta name="cover" content="cover-image"/>  <!-- EPUB 2 兼容封面指向 -->
  </metadata>

  <!-- ═══ manifest: 资源清单 ═══ -->
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"
          properties="cover-image"/>                    <!-- EPUB 3 封面 -->
    <item id="nav" href="nav.xhtml"
          media-type="application/xhtml+xml" properties="nav"/>  <!-- EPUB 3 导航 -->
    <item id="ncx" href="toc.ncx"
          media-type="application/x-dtbncx+xml"/>       <!-- EPUB 2 NCX -->
    <item id="style" href="css/main.css" media-type="text/css"/>
    <item id="font1" href="fonts/custom.otf"
          media-type="font/otf"/>                       <!-- 嵌入字体 -->
  </manifest>

  <!-- ═══ spine: 阅读顺序 ═══ -->
  <spine toc="ncx" page-progression-direction="ltr">
    <itemref idref="ch1" linear="yes"/>
    <itemref idref="ch2" linear="yes"/>
    <itemref idref="appendix" linear="no"/>  <!-- 非线性内容 -->
  </spine>

  <!-- ═══ guide: EPUB 2 导航指引（EPUB 3 已废弃，但仍需兼容） ═══ -->
  <guide>
    <reference type="cover" title="封面" href="cover.xhtml"/>
    <reference type="toc" title="目录" href="nav.xhtml"/>
  </guide>
</package>
```

#### 2.1.5 MARC Relator 角色码

OPF metadata 中 `<dc:creator>` 的 role 属性使用 MARC relator 码：

| 码 | 角色 | 码 | 角色 |
|----|------|----|------|
| aut | 作者 | edt | 编辑 |
| ill | 插画师 | trl | 翻译 |
| art | 艺术家 | clr | 上色师 |
| bkp | 制作人 | pbl | 出版商 |

#### 2.1.6 导航解析

EPUB 3 Navigation Document (nav.xhtml):
```xml
<nav epub:type="toc" id="toc">
  <h1>目录</h1>
  <ol>
    <li><a href="chapter1.xhtml">第一章</a>
      <ol>
        <li><a href="chapter1.xhtml#sec1">第一节</a></li>
      </ol>
    </li>
    <li><a href="chapter2.xhtml">第二章</a></li>
  </ol>
</nav>
<nav epub:type="page-list">  <!-- 页码列表 -->
  <ol>
    <li><a href="chapter1.xhtml#page1">1</a></li>
  </ol>
</nav>
<nav epub:type="landmarks">   <!-- 地标 -->
  <ol>
    <li><a epub:type="toc" href="nav.xhtml">目录</a></li>
    <li><a epub:type="bodymatter" href="chapter1.xhtml">正文开始</a></li>
  </ol>
</nav>
```

EPUB 2 NCX (toc.ncx):
```xml
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="ch1" playOrder="1">
      <navLabel><text>第一章</text></navLabel>
      <content src="chapter1.xhtml"/>
      <navPoint id="sec1" playOrder="2">  <!-- 嵌套子节点 -->
        <navLabel><text>第一节</text></navLabel>
        <content src="chapter1.xhtml#sec1"/>
      </navPoint>
    </navPoint>
  </navMap>
  <pageList>  <!-- 可选 -->
    <pageTarget type="normal" value="1">
      <navLabel><text>1</text></navLabel>
      <content src="chapter1.xhtml#page1"/>
    </pageTarget>
  </pageList>
</ncx>
```

解析优先级: nav.xhtml → toc.ncx → guide → 无目录

#### 2.1.7 封面提取策略（完整降级链）

```ts
function extractCover(resources: Resources): ManifestItem | null {
  return (
    // 1. EPUB 3: manifest properties="cover-image"
    resources.getItemByProperty("cover-image")
    // 2. EPUB 2: <meta name="cover" content="item-id"/>
    ?? resources.getItemByID(getMetaCoverID(resources.opf))
    // 3. 按 href 猜测
    ?? resources.getItemByHref(getMetaCoverID(resources.opf))
    // 4. 常见 ID 名
    ?? resources.getItemByID("cover.jpg")
    ?? resources.getItemByID("cover.png")
    ?? resources.getItemByID("cover.jpeg")
    // 5. guide 中 type="cover" 且为图片
    ?? resources.getItemByHref(
         resources.guide?.find(ref =>
           ref.type.includes("cover") && /\.(jpe?g|png|gif|webp)$/i.test(ref.href)
         )?.href
       )
    // 6. ID 包含 "cover" 的图片
    ?? resources.getItemByID("cover")
    ?? null
  );
}
```

#### 2.1.8 字体混淆 (Font Obfuscation)

EPUB 规范允许两种字体混淆算法，信息记录在 `META-INF/encryption.xml` 中：

```xml
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData>
      <enc:CipherReference URI="OEBPS/fonts/custom.otf"/>
    </enc:CipherData>
  </enc:EncryptedData>
</encryption>
```

两种算法:

| 算法 URI | 名称 | Key 来源 | XOR 长度 |
|----------|------|----------|----------|
| `http://www.idpf.org/2008/embedding` | IDPF 混淆 | SHA-1(unique-identifier 去空白) → 20 字节 | 前 1040 字节 |
| `http://ns.adobe.com/pdf/enc#RC` | Adobe 混淆 | UUID 去连字符 → 16 字节 hex→bytes | 前 1024 字节 |

解混淆实现:
```ts
function deobfuscate(key: Uint8Array, length: number, blob: Blob): Blob {
  // 仅对文件前 length 字节做 XOR，key 循环使用
  const header = new Uint8Array(await blob.slice(0, length).arrayBuffer());
  for (let i = 0; i < header.length; i++) {
    header[i] ^= key[i % key.length];
  }
  // 拼接: 解混淆的头部 + 原始的剩余部分
  return new Blob([header, blob.slice(length)]);
}

// IDPF key 生成
async function idpfKey(opf: Document): Promise<Uint8Array> {
  const id = getUniqueIdentifier(opf).replaceAll(/[\u0020\u0009\u000d\u000a]/g, "");
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(id));
  return new Uint8Array(hash);  // 20 字节
}

// Adobe key 生成
function adobeKey(opf: Document): Uint8Array {
  const uuid = getUUID(opf).replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, i) =>
    parseInt(uuid.slice(i * 2, i * 2 + 2), 16)
  );
}
```

#### 2.1.9 EPUB 资源加载器 (Loader)

EPUB 内容文档引用的 CSS/图片/字体等资源需要递归加载并替换 URL：

```ts
class EpubResourceLoader {
  private cache = new Map<string, string>();      // href → Blob URL
  private refCount = new Map<string, number>();    // 引用计数
  private children = new Map<string, string[]>();  // 父 → 子资源列表

  // 加载 manifest item，递归替换内部资源引用
  async loadItem(item: ManifestItem, parents: string[] = []): Promise<string> {
    const { href, mediaType } = item;
    if (this.cache.has(href)) return this.ref(href, parents.at(-1));

    // 需要替换内部引用的类型: XHTML, HTML, CSS, SVG
    const needsReplace = [MIME.XHTML, MIME.HTML, MIME.CSS, MIME.SVG].includes(mediaType);
    if (needsReplace && !parents.includes(href)) {  // 防循环引用
      return this.loadAndReplace(item, parents);
    }

    // 二进制资源: 直接创建 Blob URL
    const blob = await this.loadBlob(href);
    return this.createURL(href, blob, mediaType, parents.at(-1));
  }

  // 替换 HTML/CSS 中的资源引用为 Blob URL
  private async loadAndReplace(item: ManifestItem, parents: string[]): Promise<string> {
    const str = await this.loadText(item.href);
    if ([MIME.XHTML, MIME.HTML, MIME.SVG].includes(item.mediaType)) {
      // DOM 解析 → 遍历 src/href/url() → 递归 loadItem → 替换为 Blob URL
      const doc = new DOMParser().parseFromString(str, item.mediaType);
      await this.replaceDocumentResources(doc, item.href, parents);
      const replaced = new XMLSerializer().serializeToString(doc);
      return this.createURL(item.href, new Blob([replaced], { type: item.mediaType }));
    }
    if (item.mediaType === MIME.CSS) {
      // 正则替换 url(...) 引用
      const replaced = await this.replaceCSSUrls(str, item.href, parents);
      return this.createURL(item.href, new Blob([replaced], { type: "text/css" }));
    }
    return "";
  }

  // 卸载: 引用计数归零时释放 Blob URL
  unload(href: string): void {
    const count = (this.refCount.get(href) ?? 1) - 1;
    if (count <= 0) {
      URL.revokeObjectURL(this.cache.get(href)!);
      this.cache.delete(href);
      this.refCount.delete(href);
      // 递归释放子资源
      this.children.get(href)?.forEach(child => this.unload(child));
      this.children.delete(href);
    } else {
      this.refCount.set(href, count);
    }
  }
}
```

#### 2.1.10 XML 解析容错

实际 EPUB 文件常有 XML 不规范问题，解析前需预处理：

```ts
function sanitizeXML(str: string): string {
  return str
    .replace(/^\uFEFF/, "")                                    // 移除 BOM
    .replace(/<!--([\s\S]*?)-->/g, (_, c) =>                   // 修复注释中 --
      `<!--${c.replace(/--/g, "- -")}-->`)
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, "&amp;")  // 转义裸 &
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")        // 移除控制字符
    .replace(/opf:scheme/g, "scheme");                          // 非标准命名空间
}
```

XHTML 解析失败时降级为 HTML 模式:
```ts
let doc = new DOMParser().parseFromString(str.trim(), "application/xhtml+xml");
if (doc.querySelector("parsererror")) {
  doc = new DOMParser().parseFromString(str.trim(), "text/html");
}
```

#### 2.1.11 EPUB CFI (Canonical Fragment Identifier)

IDPF 标准的精确内容定位格式:

```
epubcfi(/6/4!/4/2/1:0)
         │ │  │ │ │ └─ 字符偏移 (CharacterOffset)
         │ │  │ │ └─── 元素步进 (ElementStep)
         │ │  │ └───── 元素步进
         │ │  └─────── 文档内路径 (LocalPath, ! 分隔)
         │ └────────── spine itemref 步进 (/6 = package 第3子元素 spine, /4 = 第2个 itemref)
         └──────────── package 步进 (/6 = 第3子元素)
```

步进规则: `/N` 中 N 为偶数表示元素节点（N/2 = 从1开始的索引），奇数表示文本节点。

#### 2.1.12 第三方库选型

| 库 | 许可证 | 大小 | Vitra 用途 |
|---|---|---|---|
| fflate | MIT | ~29KB | ZIP 解压（首选，最快纯 JS 实现） |
| JSZip | MIT/GPLv3 | ~100KB | ZIP 解压（备选，API 更友好） |
| zip.js | BSD-3 | ~45KB | ZIP 解压（需 Worker 场景） |

Vitra 推荐: fflate 作为默认 ZIP 引擎，仅在需要加密 ZIP 时降级到 zip.js。

---

### 2.2 MOBI / AZW3 / AZW (PDB + MOBI Header + EXTH)

#### 2.2.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | 偏移 60-67: `424F4F4B4D4F4249` ("BOOKMOBI") |
| 规范 | 无公开官方规范，基于逆向工程社区文档 (MobileRead Wiki) |
| 后缀区分 | `.mobi` = 通用, `.azw3` = KF8 格式, `.azw` = 旧版 Amazon 格式 |

#### 2.2.2 PDB Header (78 字节)

```
偏移   长度  类型     字段
0x00   32    ASCII    数据库名称（null-padded，通常为书名截断）
0x20   2     uint16   属性标志
0x22   2     uint16   版本
0x24   4     uint32   创建时间（PalmOS epoch: 1904-01-01 00:00:00 UTC 起算的秒数）
0x28   4     uint32   修改时间
0x2C   4     uint32   备份时间
0x30   4     uint32   修改计数
0x34   4     uint32   AppInfo 偏移
0x38   4     uint32   SortInfo 偏移
0x3C   4     ASCII    Type: "BOOK"
0x40   4     ASCII    Creator: "MOBI"
0x44   4     uint32   UniqueID Seed
0x48   4     uint32   Next Record List ID
0x4C   2     uint16   Record 数量 (N)
0x4E   N×8            Record 列表:
                        每条 8 字节 = [4字节偏移(uint32) + 1字节属性 + 3字节唯一ID]
```

Record 偏移指向文件中的绝对位置。Record 的大小 = 下一条的偏移 - 当前偏移。

#### 2.2.3 Record 0 — PalmDOC Header (前 16 字节)

```
偏移(相对Record0)  长度  类型     字段
0x00   2     uint16   压缩方式:
                        1     = 无压缩
                        2     = PalmDOC (LZ77 变体)
                        17480 = HUFF/CDIC (Huffman 字典压缩)
0x02   2     uint16   保留 (0)
0x04   4     uint32   未压缩文本总长度
0x08   2     uint16   文本 Record 数量
0x0A   2     uint16   Record 最大大小（通常 4096）
0x0C   2     uint16   加密方式: 0=无, 1=旧MOBIPocket, 2=MOBIPocket
0x0E   2     uint16   保留 (0)
```

#### 2.2.4 MOBI Header (紧跟 PalmDOC Header，偏移 0x10)

```
偏移(相对Record0)  长度  类型     字段
0x10   4     ASCII    标识: "MOBI"（必须校验）
0x14   4     uint32   Header 长度（从 0x10 开始计算）
0x18   4     uint32   MOBI 类型: 2=Book, 3=PalmDoc, 4=Audio, 257=News, 258=News_Feed
0x1C   4     uint32   文本编码: 1252=CP1252(Windows Latin-1), 65001=UTF-8
0x20   4     uint32   UniqueID
0x24   4     uint32   文件版本: ≤6=MOBI6, 8=KF8(AZW3)
0x28   4     uint32   Orthographic Index (-1 = 无)
0x2C   4     uint32   Inflection Index
0x30   4     uint32   Index Names
0x34   4     uint32   Index Keys
0x38   24    uint32×6 Extra Index 0-5
0x50   4     uint32   First Non-Book Index
0x54   4     uint32   Full Name 偏移（相对 Record 0 起始）
0x58   4     uint32   Full Name 长度
0x5C   4     uint32   语言代码（MOBI 语言表索引）
0x60   4     uint32   Input Language
0x64   4     uint32   Output Language
0x68   4     uint32   Min Version
0x6C   4     uint32   First Image Index
0x70   4     uint32   Huffman Record Offset (huffcdic)
0x74   4     uint32   Huffman Record Count (numHuffcdic)
0x78   4     uint32   Huffman Table Offset
0x7C   4     uint32   Huffman Table Length
0x80   4     uint32   EXTH 标志（bit 6 = 存在 EXTH header）
0xB0   4     uint32   DRM Offset (-1 = 无 DRM)
0xB4   4     uint32   DRM Count
0xC0   4     uint32   INDX Record 偏移（NCX 目录索引）
0xC4   4     uint32   resourceStart（第一个非文本 record 索引）
0xF2   2     uint16   Extra Data Flags (trailing entry flags)
```

#### 2.2.5 EXTH Header

当 MOBI Header 偏移 0x80 的 bit 6 置位时，EXTH 紧跟 MOBI Header 之后:

```
偏移(相对EXTH起始)  长度  字段
0x00   4     ASCII    标识: "EXTH"
0x04   4     uint32   Header 总长度（含标识）
0x08   4     uint32   Record 数量 (M)
0x0C   M×var          Record 列表:
                        每条: [type(uint32) + length(uint32) + data(length-8 字节)]
```

完整 EXTH Record Type 表:

| Type | 名称 | 类型 | 多值 | 说明 |
|------|------|------|------|------|
| 100 | creator | string | 是 | 作者（可多个） |
| 101 | publisher | string | 否 | 出版社 |
| 103 | description | string | 否 | 简介 |
| 104 | isbn | string | 否 | ISBN |
| 105 | subject | string | 是 | 分类标签 |
| 106 | date | string | 否 | 出版日期 |
| 108 | contributor | string | 是 | 贡献者 |
| 109 | rights | string | 否 | 版权 |
| 110 | subjectCode | string | 是 | 分类代码 |
| 112 | source | string | 是 | 来源 |
| 113 | asin | string | 否 | Amazon ASIN |
| 121 | boundary | uint32 | 否 | KF8 boundary record（combo 格式分界点） |
| 122 | fixedLayout | string | 否 | "true" = 固定布局 |
| 125 | numResources | uint32 | 否 | 资源数量 |
| 126 | originalResolution | string | 否 | "WxH" 原始分辨率 |
| 129 | coverURI | string | 否 | 封面 URI |
| 201 | coverOffset | uint32 | 否 | 封面图片偏移（相对第一个 image record） |
| 202 | thumbnailOffset | uint32 | 否 | 缩略图偏移 |
| 503 | title | string | 否 | 更新后的标题（优先于 PDB 名称） |
| 524 | language | string | 是 | 语言代码 |
| 527 | pageProgressionDirection | string | 否 | "rtl" / "ltr" |

#### 2.2.6 PalmDOC LZ77 压缩算法

```ts
function decompressPalmDOC(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;
  while (i < data.length) {
    const byte = data[i++];
    if (byte === 0) {
      // 0x00: 输出 null 字节
      output.push(0);
    } else if (byte >= 0x01 && byte <= 0x08) {
      // 0x01-0x08: 后续 N 个字节直接复制
      for (let j = 0; j < byte && i < data.length; j++) {
        output.push(data[i++]);
      }
    } else if (byte >= 0x09 && byte <= 0x7F) {
      // 0x09-0x7F: 直接输出该字节
      output.push(byte);
    } else if (byte >= 0x80 && byte <= 0xBF) {
      // 0x80-0xBF: LZ77 回引（2字节编码）
      const next = data[i++];
      const distance = ((byte << 8 | next) >> 3) & 0x7FF;
      const length = (next & 0x07) + 3;
      const start = output.length - distance;
      for (let j = 0; j < length; j++) {
        output.push(output[start + j]);  // 注意: 可能引用刚输出的字节
      }
    } else {
      // 0xC0-0xFF: 输出空格 + (byte XOR 0x80)
      output.push(0x20);
      output.push(byte ^ 0x80);
    }
  }
  return new Uint8Array(output);
}
```

#### 2.2.7 HUFF/CDIC 压缩算法

用于较新的 MOBI 文件，基于 Huffman 编码 + 字典查表:

```
HUFF Record 结构:
  0x00  4  "HUFF" 标识
  0x08  4  offset1 → Table1 起始（256 × 4 字节，按字节值索引）
  0x0C  4  offset2 → Table2 起始（32 × 8 字节，按码长索引）

Table1[byte_value] = uint32:
  bit 7     = found (是否直接命中)
  bit 0-4   = codeLength
  bit 8-31  = value

Table2[code_length] = [minCode(uint32), baseValue(uint32)]

CDIC Record 结构:
  0x00  4  "CDIC" 标识
  0x04  4  header 长度
  0x08  4  总条目数（跨所有 CDIC record）
  0x0C  4  codeLength（每个 CDIC 最多 2^codeLength 条目）
  之后: 偏移表 + 字典数据
    每条: [uint16 偏移] → [uint16: bit15=已解压标志, bit0-14=长度] + [数据]
```

解压流程:
```
1. 逐 bit 读取压缩数据
2. 取前 8 bit 查 Table1:
   - found=1 → 直接得到 codeLength 和 value
   - found=0 → 用 Table2 按码长逐步匹配
3. value → 查 CDIC 字典得到字节序列
4. 若字典条目的 "已解压" 标志为 0 → 递归解压该条目
5. 输出解压后的字节
```

#### 2.2.8 Trailing Entries 处理

MOBI 文本 record 末尾可能有额外数据（trailing entries），需要在解压前移除:

```ts
function removeTrailingEntries(data: Uint8Array, flags: number): Uint8Array {
  let result = data;
  const multibyte = flags & 1;
  const numEntries = countBitsSet(flags >>> 1);

  // 移除 trailing entries（从末尾读取变长长度）
  for (let i = 0; i < numEntries; i++) {
    const length = getVarLenFromEnd(result);
    result = result.subarray(0, result.length - length);
  }

  // 移除 multibyte 额外字节
  if (multibyte) {
    const extra = (result[result.length - 1] & 0b11) + 1;
    result = result.subarray(0, result.length - extra);
  }
  return result;
}
```

#### 2.2.9 KF8 (AZW3) 内部结构

KF8 使用 Skeleton + Fragment 架构:

```
SKEL Table (骨架表):
  每条: { name, numFrag, offset, length }
  骨架 = HTML 文档的外壳结构

FRAG Table (片段表):
  每条: { insertOffset, selector, index, offset, length }
  片段 = 插入到骨架中的内容块

FDST Table (Flow Data Section Table):
  记录文本流的分段偏移: [start, end] 对

RESC Record:
  类似 OPF 的 XML，包含 spine 信息和 page-spread 属性
  格式: XML 声明 + <package> 包裹的 spine/itemref

加载一个 section:
  1. 读取 SKEL 骨架 HTML
  2. 读取该骨架关联的所有 FRAG 片段
  3. 按 insertOffset 将片段插入骨架
  4. 替换 kindle:embed/kindle:flow 资源引用为实际 Blob URL
```

#### 2.2.10 MOBI6 章节分割

MOBI6 没有结构化 TOC，通过以下方式识别章节:
1. `<mbp:pagebreak>` 标签 → 分页符
2. `filepos` 属性 → 锚点位置（`<a filepos="12345">`）
3. NCX 索引（INDX record）→ 结构化目录（如果存在）

#### 2.2.11 嵌入字体 (FONT Record)

KF8 支持嵌入字体，存储在 resource record 中:

```
FONT Record Header:
  0x00  4  "FONT" 标识
  0x08  4  flags (bit 0 = zlib 压缩, bit 1 = XOR 混淆)
  0x0C  4  dataStart (字体数据起始偏移)
  0x10  4  keyLength (XOR key 长度)
  0x14  4  keyStart (XOR key 起始偏移)

解码流程:
  1. 若 flags bit 1 → 用 key 对数据做 XOR 解混淆
  2. 若 flags bit 0 → zlib 解压
  3. 得到 OTF/TTF 字体文件
```

#### 2.2.12 封面提取

```ts
async function getMobiCover(mobi: MobiFile): Promise<Blob | null> {
  const { exth } = mobi.headers;
  // 优先 coverOffset，降级 thumbnailOffset
  const offset = (exth.coverOffset < 0xFFFFFFFF) ? exth.coverOffset
               : (exth.thumbnailOffset < 0xFFFFFFFF) ? exth.thumbnailOffset
               : null;
  if (offset != null) {
    const buf = await mobi.loadResource(offset);
    return new Blob([buf]);
  }
  return null;
}
```

#### 2.2.13 第三方库选型

| 库 | 许可证 | 说明 |
|---|---|---|
| fflate | MIT | MOBI 内部 zlib 解压（HUFF/CDIC、字体） |
| foliate-js | GPL-3.0 | 参考实现（GNOME Foliate 的 JS MOBI 解析器，最完整） |

Vitra 策略: 自研 PDB/MOBI/KF8 解析器（参考 foliate-js 架构），仅依赖 fflate 做 zlib。

---

### 2.3 PDF (ISO 32000-2:2020)

#### 2.3.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | `25 50 44 46 2D` ("%PDF-") + 版本号 (如 "1.7", "2.0") |
| 规范 | ISO 32000-2:2020 (PDF 2.0) |
| MIME | `application/pdf` |

#### 2.3.2 PDF 内部结构概览

```
%PDF-1.7                          ← Header (版本声明)
%âãÏÓ                             ← 二进制标记（提示传输层这是二进制文件）

1 0 obj                           ← 间接对象 (对象号 生成号 obj)
<< /Type /Catalog                 ← 字典对象
   /Pages 2 0 R >>               ← 引用对象 2
endobj

2 0 obj
<< /Type /Pages
   /Kids [3 0 R 4 0 R]           ← 页面树
   /Count 2 >>
endobj

3 0 obj                           ← 页面对象
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 612 792]       ← 页面尺寸 (Letter: 8.5×11 inch, 72 DPI)
   /Contents 5 0 R               ← 内容流引用
   /Resources << /Font << /F1 6 0 R >> >> >>
endobj

5 0 obj                           ← 内容流
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj

xref                              ← 交叉引用表
0 7
0000000000 65535 f               ← 空闲对象
0000000009 00000 n               ← 对象 1 的字节偏移
...

trailer                           ← 尾部
<< /Size 7
   /Root 1 0 R                   ← Catalog 对象引用
   /Info 7 0 R >>                ← 文档信息字典
startxref
1234                              ← xref 表的字节偏移
%%EOF
```

#### 2.3.3 关键对象类型

| 对象 | 说明 |
|------|------|
| Catalog (/Type /Catalog) | 文档根节点，指向 Pages 树、Outlines(目录)、Metadata |
| Pages (/Type /Pages) | 页面树根，/Kids 数组包含子 Pages 或 Page |
| Page (/Type /Page) | 单个页面，/MediaBox 定义尺寸，/Contents 指向内容流 |
| Font (/Type /Font) | 字体定义，/Subtype 区分 Type1/TrueType/CIDFont |
| XObject (/Subtype /Image) | 嵌入图片 |
| Outline | 书签/目录树 |

#### 2.3.4 内容流操作符（部分）

| 操作符 | 含义 | 示例 |
|--------|------|------|
| BT / ET | 开始/结束文本块 | `BT ... ET` |
| Tf | 设置字体和大小 | `/F1 12 Tf` |
| Td | 移动文本位置 | `100 700 Td` |
| Tj | 显示文本字符串 | `(Hello) Tj` |
| TJ | 显示文本数组（带字距调整） | `[(H) -10 (ello)] TJ` |
| cm | 设置变换矩阵 | `1 0 0 1 0 0 cm` |
| re | 矩形路径 | `0 0 100 100 re` |
| f / S | 填充 / 描边 | |
| Do | 绘制 XObject | `/Im1 Do` |
| q / Q | 保存/恢复图形状态 | |

#### 2.3.5 pdfjs-dist 集成架构

```
Vitra PdfParser
  │
  ├─ pdfjsLib.getDocument({ data: ArrayBuffer, password?: string })
  │    → PDFDocumentProxy
  │
  ├─ 元数据提取:
  │    doc.getMetadata() → { info: { Title, Author, Subject, Creator, Producer } }
  │    doc.getOutline()  → [{ title, dest, items[] }]  (递归目录树)
  │
  ├─ 按页渲染 (VirtualScroll 调度):
  │    doc.getPage(pageNum) → PDFPageProxy
  │      page.getViewport({ scale, rotation })  → { width, height, transform }
  │      page.render({ canvasContext, viewport }) → RenderTask (Promise)
  │      page.getTextContent() → { items: [{ str, transform, width, height }] }
  │
  └─ Worker 配置:
       pdfjsLib.GlobalWorkerOptions.workerSrc = "/lib/pdfjs/pdf.worker.min.mjs";
       // 或使用 workerPort 自定义 Worker
```

#### 2.3.6 PDF 渲染要点

- Worker 隔离: 解析在 Worker 线程，主线程只做 Canvas 绑定
- 虚拟滚动: 只渲染可见页 ± 预加载页，IntersectionObserver 触发
- viewport 缩放: `scale = containerWidth / page.getViewport({scale:1}).width`
- 双页模式: 前端布局层实现，两个 canvas 并排，gap 计算
- 密码保护: `getDocument({ data, password })` 传入密码
- 大文件: 支持 Range Request (`pdfjsLib.getDocument({ url, rangeChunkSize })`)
- Text Layer: 透明 div 覆盖 canvas，用于文本选择和搜索
- Annotation Layer: 渲染超链接、表单字段、批注

#### 2.3.7 第三方库选型

| 库 | 许可证 | 大小 | 适用场景 |
|---|---|---|---|
| pdfjs-dist | Apache-2.0 | ~2.5MB (含 Worker) | 渲染 + 文本提取（首选） |
| pdf-lib | MIT | ~400KB | 创建/修改 PDF 结构（不能渲染） |
| pdfium.js (pdfium-wasm) | BSD-3 | ~10MB | Chrome PDFium 的 WASM 版，渲染精度极高 |
| mupdf.js | AGPL-3.0 | ~8MB | MuPDF WASM 版，渲染质量好但许可证严格 |

Vitra 策略: pdfjs-dist 作为唯一 PDF 引擎，Apache-2.0 许可证友好。

---

### 2.4 DJVU (AT&T DjVu)

#### 2.4.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | `41 54 26 54 46 4F 52 4D` ("AT&TFORM") + 4字节大小 + "DJVU"(单页)/"DJVM"(多页) |
| 规范 | DjVu3 Specification (Lizardtech/AT&T) |
| MIME | `image/vnd.djvu` |

#### 2.4.2 IFF85 Chunk 结构

DjVu 使用 IFF85 (Interchange File Format) 容器:

```
每个 chunk:
  ID:   4 字节 ASCII 标识 (如 "FORM", "INFO", "Sjbz")
  Size: 4 字节 Big-Endian 无符号整数（数据长度，不含 ID 和 Size 本身）
  Data: Size 字节
  Pad:  Size 为奇数时补 1 字节 0x00 对齐

FORM chunk 是容器 chunk:
  ID:   "FORM"
  Size: 内部总大小
  Type: 4 字节子类型 ("DJVU", "DJVM", "DJVI", "THUM")
  Data: 嵌套的 chunk 序列
```

#### 2.4.3 多页文档结构

```
FORM:DJVM (多页文档容器)
├── DIRM                    # 目录 chunk
│   flags(1): bit 7 = bundled(1) / indirect(0)
│   nfiles(2): 页面/组件数量
│   offsets[]: 每个组件的偏移（bundled 模式）
│   strings: 组件 ID、名称、标题（BZZ 压缩）
│
├── NAVM                    # 可选: 书签/导航
│   BZZ 压缩的书签数据
│
├── FORM:DJVU               # 第 1 页
│   ├── INFO (10 字节)      # 页面信息
│   │   width(2), height(2), minor_version(1), major_version(1),
│   │   dpi(2), gamma(1), flags(1: bit0-2=rotation)
│   ├── Sjbz                # JB2 前景掩码（文字/线条二值图）
│   ├── FGbz                # JB2 前景颜色调色板
│   ├── BG44                # IW44 背景图（可多个，渐进式）
│   ├── FG44                # IW44 前景颜色层
│   ├── TXTz                # BZZ 压缩的隐藏文本层
│   ├── ANTz                # BZZ 压缩的注释（超链接、高亮等）
│   └── INCL                # 引用共享字典的 ID
│
├── FORM:DJVI               # 共享数据组件
│   └── Djbz                # JB2 共享形状字典
│
├── FORM:DJVU               # 第 2 页 ...
└── ...
```

#### 2.4.4 三层分离压缩模型

DjVu 的核心创新是将扫描页面分为三层独立压缩:

```
┌─────────────────────────────┐
│     前景掩码 (Mask)          │  JB2 二值图压缩
│     1-bit: 文字/线条轮廓     │  → Sjbz chunk
├─────────────────────────────┤
│     前景颜色 (Foreground)    │  IW44 有损压缩（低分辨率）
│     文字/线条的颜色           │  → FG44 chunk
├─────────────────────────────┤
│     背景图像 (Background)    │  IW44 有损压缩（中分辨率）
│     纸张纹理/插图             │  → BG44 chunk（可多个，渐进式）
└─────────────────────────────┘

渲染合成: background × (1 - mask) + foreground × mask
```

#### 2.4.5 压缩算法详解

| 算法 | Chunk | 原理 |
|------|-------|------|
| JB2 | Sjbz/Djbz/FGbz | JBIG2 变体。将文字分割为独立形状(blit)，建立形状字典，相同字形只存一次+位置偏移。共享字典(Djbz)跨页复用 |
| IW44 | FG44/BG44 | 基于 CDF 9/7 小波变换的有损压缩。支持渐进式解码：多个 BG44 chunk 逐步提高质量（类似 JPEG 2000 的质量层） |
| BZZ | TXTz/ANTz/DIRM | 基于 Burrows-Wheeler Transform (BWT) 的通用无损压缩，压缩率优于 gzip |

#### 2.4.6 隐藏文本层 (TXTz)

BZZ 解压后的文本层格式:
```
version(1): 文本格式版本
page_zone: 递归区域结构
  type(1): 1=page, 2=column, 3=region, 4=paragraph, 5=line, 6=word, 7=character
  x(2), y(2), w(2), h(2): 边界框
  text_length(3): 文本长度
  children_count(3): 子区域数量
  text: UTF-8 文本内容
```

#### 2.4.7 第三方库

| 库 | 许可证 | 大小 | 说明 |
|---|---|---|---|
| djvu.js | GPL-3.0 | ~500KB | 纯 JS 实现，支持 Worker，完整渲染+文本提取 |

Vitra 策略: djvu.js 封装，注意 GPL 许可证影响。如需商用可考虑自研 WASM 解码器。

---

### 2.5 TXT (纯文本)

#### 2.5.1 文件识别

无固定 magic bytes。纯文本文件，核心挑战是编码检测。

#### 2.5.2 BOM 检测

```ts
function detectBOM(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return "utf-8";
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    if (bytes[2] === 0x00 && bytes[3] === 0x00) return "utf-32le";
    return "utf-16le";
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return "utf-16be";
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF) {
    return "utf-32be";
  }
  return null;
}
```

#### 2.5.3 统计编码检测

无 BOM 时需要统计分析。采样策略: 取文件前 4-8KB（足够统计特征，避免全文扫描）。

| 库 | 许可证 | 大小 | 准确度 | 说明 |
|---|---|---|---|---|
| chardet | MIT | ~200KB | 最高 | Mozilla universalchardet 移植，30+ 编码 |
| jschardet | LGPL-2.1 | ~150KB | 中高 | Python chardet 的 JS 移植 |
| TextDecoder | 原生 | 0 | — | 不做检测，需已知编码名 |

Vitra 推荐: chardet 检测 → TextDecoder 解码。

常见中文编码优先级: UTF-8 > GBK > GB18030 > GB2312 > Big5

#### 2.5.4 章节启发式识别算法

```ts
// ═══ Vitra TXT 章节识别引擎 ═══

// 中文数字字符集（含大写数字）
const ZH_NUM = /^[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4ebf\u5146\u58f9\u8d30\u53c1\u8086\u4f0d\u9646\u67d2\u634c\u7396\u4e24\u842c\u5169]+$/;

// 章节关键词
const CHAPTER_KEYWORDS = ["章","节","回","節","卷","部","輯","辑","話","集","话","篇"];

// 特殊章节开头
const SPECIAL_STARTS = [
  "CHAPTER", "Chapter", "Prologue", "Epilogue",
  "序章","前言","声明","写在前面的话","后记","楔子","后序",
  "章节目录","尾声","聲明","寫在前面的話","後記","後序","章節目錄","尾聲",
];

// 正文标点（出现则不是标题）
const BODY_PUNCTUATION = /[。；;，,！!？?…—]/;

function isChapterTitle(line: string, customRegex?: string): boolean {
  // 0. 自定义正则优先
  if (customRegex) return new RegExp(customRegex).test(line);

  const cleaned = line.trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/[=\-_+]/g, "")
    .substring(0, 100);

  if (!cleaned || cleaned.length >= 40) return false;
  if (BODY_PUNCTUATION.test(cleaned)) return false;

  // 1. 特殊开头匹配
  if (SPECIAL_STARTS.some(s => cleaned.startsWith(s))) return true;

  // 2. "第X章/节/回..." 格式
  if (cleaned.startsWith("第")) {
    for (const kw of CHAPTER_KEYWORDS) {
      const kwIndex = cleaned.indexOf(kw);
      if (kwIndex > 1) {
        const mid = cleaned.substring(1, kwIndex).trim();
        if (ZH_NUM.test(mid) || /^\d+$/.test(mid)) return true;
      }
    }
  }

  // 3. "卷X" 格式
  if (cleaned.startsWith("卷")) {
    const spaceIdx = cleaned.indexOf(" ");
    const rest = cleaned.substring(1, spaceIdx > 0 ? spaceIdx : undefined).trim();
    if (ZH_NUM.test(rest) || /^\d+$/.test(rest)) return true;
  }

  return false;
}
```

#### 2.5.5 大文件分窗策略

超过 10000 行的 TXT 不应一次性全部转 HTML:

```ts
function txtToHtmlWindowed(
  text: string,
  currentPosition: { text: string; chapterIndex: number },
  parserRegex?: string
): string {
  const lines = text.split(/\n|\r\n?/);

  if (lines.length <= 10000) {
    return txtToHtmlFull(lines, parserRegex);
  }

  // 定位当前阅读位置
  let targetLine = lines.findIndex(l => l.trim() === currentPosition.text.trim());
  if (targetLine === -1) targetLine = 0;

  // 取 ±3000 行窗口
  const start = Math.max(targetLine - 3000, 0);
  const end = Math.min(targetLine + 3000, lines.length);
  const window = lines.slice(start, end);

  return txtToHtmlFull(window, parserRegex);
}

function txtToHtmlFull(lines: string[], parserRegex?: string): string {
  const parts: string[] = [];
  for (const line of lines) {
    const cleaned = line.trim().replace(/[\r\n\t]/g, "").substring(0, 100);
    if (cleaned && isChapterTitle(cleaned, parserRegex)) {
      parts.push(`<h1>${escapeHtml(cleaned)}</h1>`);
    } else {
      parts.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  const html = parts.join("");
  // 若无章节标题，添加隐藏标题确保至少有一个 section
  if (!html.includes("<h1>")) {
    return `<h1 style="opacity:0;font-size:1px">_</h1>${html}`;
  }
  return html;
}
```

---

### 2.6 漫画格式 (CBZ/CBT/CBR/CB7)

#### 2.6.1 文件识别

| 格式 | 容器 | Magic Bytes | 偏移 |
|------|------|-------------|------|
| CBZ | ZIP | `50 4B 03 04` | 0 |
| CBT | TAR | `75 73 74 61 72` ("ustar") | 257 |
| CBR | RAR4 | `52 61 72 21 1A 07 00` | 0 |
| CBR | RAR5 | `52 61 72 21 1A 07 01 00` | 0 |
| CB7 | 7z | `37 7A BC AF 27 1C` | 0 |

#### 2.6.2 内部结构约定

漫画归档文件没有强制规范，但社区约定:
- 容器内直接存放图片文件（可嵌套一层目录）
- 支持的图片: `.jpg/.jpeg/.png/.gif/.bmp/.webp/.svg`
- 文件名自然排序 = 页面顺序（`001.jpg`, `002.jpg`...）
- 可选 `ComicInfo.xml`（ComicRack 元数据标准）

#### 2.6.3 ComicInfo.xml (ComicRack 标准)

```xml
<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>漫画标题</Title>
  <Series>系列名</Series>
  <Number>3</Number>
  <Volume>1</Volume>
  <Summary>简介</Summary>
  <Writer>编剧</Writer>
  <Penciller>铅笔画师</Penciller>
  <Inker>墨线画师</Inker>
  <Colorist>上色师</Colorist>
  <Publisher>出版社</Publisher>
  <Year>2024</Year>
  <PageCount>120</PageCount>
  <LanguageISO>zh</LanguageISO>
  <Manga>Yes</Manga>                    <!-- Yes = 从右到左阅读 -->
  <Pages>
    <Page Image="0" Type="FrontCover"/>
    <Page Image="1" Type="Story"/>
    <Page Image="2" Type="Story" DoublePage="true"/>
  </Pages>
</ComicInfo>
```

Page Type 枚举: FrontCover, InnerCover, Roundup, Story, Advertisement, Editorial, Letters, Preview, BackCover, Other, Deleted

#### 2.6.4 解压库选型

| 库 | 许可证 | 格式 | 实现 | 大小 | 加载策略 |
|---|---|---|---|---|---|
| fflate | MIT | ZIP | 纯 JS | ~29KB | 始终加载 |
| js-untar | MIT | TAR | 纯 JS | ~5KB | 始终加载 |
| libunrar.js | MIT | RAR | WASM+Worker | ~300KB | 按需懒加载 |
| 7z-wasm | MIT | 7z | WASM | ~800KB | 按需懒加载 |
| libarchive.js | MIT | 全格式 | WASM | ~1.5MB | 备选: 一个库覆盖全部 |

Vitra 策略: CBZ(fflate) + CBT(js-untar) 始终内置；CBR/CB7 按需动态 import。

#### 2.6.5 通用漫画 Book 构建

```ts
interface ArchiveLoader {
  entries: { filename: string }[];
  loadBlob: (name: string) => Promise<Blob>;
  getSize: (name: string) => number;
}

function buildComicBook(loader: ArchiveLoader, readerMode: "single" | "double"): VitraBook {
  const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];

  // 过滤图片 + 自然排序
  const files = loader.entries
    .map(e => e.filename)
    .filter(name => IMAGE_EXTS.some(ext => name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  // 双页模式: 每两张合并为一个 section
  const sections: BookSection[] = files
    .map((name, i) => ({
      id: name,
      href: name,
      load: async () => {
        const blob = await loader.loadBlob(name);
        const src = URL.createObjectURL(blob);
        if (readerMode === "double" && files[i + 1]) {
          const blob2 = await loader.loadBlob(files[i + 1]);
          const src2 = URL.createObjectURL(blob2);
          return URL.createObjectURL(new Blob([
            `<div style="display:flex;width:100%;height:100%">` +
            `<img src="${src}" style="max-width:50%;object-fit:contain">` +
            `<img src="${src2}" style="max-width:50%;object-fit:contain">` +
            `</div>`
          ], { type: "text/html" }));
        }
        return URL.createObjectURL(new Blob([
          `<div style="width:100%;height:100%"><img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain"></div>`
        ], { type: "text/html" }));
      },
      unload: () => {},
      size: loader.getSize(name),
    }))
    .filter((_, i) => readerMode === "double" ? i % 2 === 0 : true);

  return {
    format: "CBZ",  // 由调用方覆盖
    metadata: { title: "", author: [] },
    sections,
    toc: files.map(name => ({ label: name, href: name })),
    layout: "pre-paginated",
    direction: "ltr",
    resolveHref: (href) => ({ index: sections.findIndex(s => s.id === href) }),
    getCover: () => loader.loadBlob(files[0]),
    destroy: () => {},
  };
}
```

---

### 2.7 FB2 (FictionBook 2.0)

#### 2.7.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | 无固定签名（纯 XML） |
| 根元素 | `<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">` |
| 常见编码 | UTF-8, Windows-1251 (俄语) |
| MIME | `application/x-fictionbook+xml` |

#### 2.7.2 完整 XML Schema

```xml
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"
             xmlns:l="http://www.w3.org/1999/xlink">

  <!-- ═══ description: 元数据 ═══ -->
  <description>
    <title-info>
      <genre match="100">fiction</genre>
      <author>
        <first-name>名</first-name>
        <middle-name>中间名</middle-name>
        <last-name>姓</last-name>
        <nickname>笔名</nickname>
        <id>author-uuid</id>
      </author>
      <book-title>书名</book-title>
      <annotation><p>简介段落</p></annotation>
      <keywords>关键词1, 关键词2</keywords>
      <date value="2024-01-01">2024年</date>
      <coverpage><image l:href="#cover.jpg"/></coverpage>
      <lang>zh</lang>
      <src-lang>en</src-lang>
      <translator><first-name>译者名</first-name><last-name>译者姓</last-name></translator>
      <sequence name="系列名" number="3"/>
    </title-info>
    <document-info>
      <author><nickname>制作者</nickname></author>
      <program-used>FictionBook Editor</program-used>
      <date value="2024-01-01">制作日期</date>
      <id>document-uuid</id>
      <version>1.0</version>
    </document-info>
    <publish-info>
      <book-name>出版书名</book-name>
      <publisher>出版社</publisher>
      <city>出版城市</city>
      <year>2024</year>
      <isbn>978-xxx-xxx</isbn>
    </publish-info>
  </description>

  <!-- ═══ body: 正文（可多个） ═══ -->
  <body>
    <title><p>正文</p></title>
    <epigraph>
      <p>题词内容</p>
      <text-author>题词作者</text-author>
    </epigraph>
    <section>
      <title><p>第一章</p></title>
      <p>正文段落，带<strong>加粗</strong>和<emphasis>斜体</emphasis></p>
      <p>带<strikethrough>删除线</strikethrough>和<code>代码</code></p>
      <p>上标<sup>2</sup>和下标<sub>i</sub></p>
      <empty-line/>
      <image l:href="#img1.png"/>
      <poem>
        <title><p>诗名</p></title>
        <epigraph><p>诗题词</p></epigraph>
        <stanza>
          <v>诗行一</v>
          <v>诗行二</v>
        </stanza>
        <text-author>诗人</text-author>
        <date>2024</date>
      </poem>
      <cite>
        <p>引用内容</p>
        <text-author>引用来源</text-author>
      </cite>
      <table>
        <tr><th>表头</th></tr>
        <tr><td>单元格</td></tr>
      </table>
      <subtitle>小标题</subtitle>
      <a l:href="#note1" type="note">[1]</a>
      <section><!-- 嵌套子章节 --></section>
    </section>
  </body>

  <body name="notes">
    <title><p>注释</p></title>
    <section id="note1"><title><p>1</p></title><p>脚注内容</p></section>
  </body>

  <!-- ═══ binary: 内嵌二进制资源 ═══ -->
  <binary id="cover.jpg" content-type="image/jpeg">/9j/4AAQ...</binary>
  <binary id="img1.png" content-type="image/png">iVBORw0KGgo...</binary>
</FictionBook>
```

#### 2.7.3 FB2 → HTML 转换映射

| FB2 元素 | HTML 输出 | CSS 类 | 说明 |
|----------|-----------|--------|------|
| `<body>` | `<div class="fb2-body">` | — | 正文容器 |
| `<section>` | `<section>` | — | 章节，递归嵌套 |
| `<title>` | `<h1>`~`<h3>` | — | 按嵌套深度映射标题级别 |
| `<subtitle>` | `<h4>` | — | 小标题 |
| `<p>` | `<p>` | — | 段落 |
| `<emphasis>` | `<em>` | — | 斜体 |
| `<strong>` | `<strong>` | — | 加粗 |
| `<strikethrough>` | `<s>` | — | 删除线 |
| `<code>` | `<code>` | — | 等宽代码 |
| `<sub>` / `<sup>` | `<sub>` / `<sup>` | — | 上下标 |
| `<poem>` | `<blockquote class="poem">` | `.poem` | 诗歌容器 |
| `<stanza>` | `<div class="stanza">` | `.stanza` | 诗节 |
| `<v>` | `<p class="verse">` | `.verse` | 诗行 |
| `<cite>` | `<blockquote class="cite">` | `.cite` | 引用 |
| `<epigraph>` | `<blockquote class="epigraph">` | `.epigraph` | 题词 |
| `<text-author>` | `<p class="text-author">` | `.text-author { text-align: right }` | 署名 |
| `<image>` | `<img>` | — | 图片 |
| `<table>` | `<table>` | — | 表格 |
| `<a>` | `<a>` | — | 链接 |
| `<empty-line/>` | `<br>` | — | 空行 |

#### 2.7.4 图片资源解析

```ts
function resolveFb2Images(doc: Document): Map<string, string> {
  const imageMap = new Map<string, string>();
  const binaries = doc.getElementsByTagName("binary");
  for (const binary of binaries) {
    const id = binary.getAttribute("id");
    const contentType = binary.getAttribute("content-type") || "image/jpeg";
    const base64 = binary.textContent?.trim() || "";
    if (id && base64) {
      imageMap.set(`#${id}`, `data:${contentType};base64,${base64}`);
    }
  }
  return imageMap;
}

// 转换 <image l:href="#id"/> → <img src="data:..."/>
function convertImage(el: Element, imageMap: Map<string, string>): HTMLElement {
  const href = el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
  const img = document.createElement("img");
  img.src = imageMap.get(href) || href;
  img.alt = el.getAttribute("alt") || "";
  return img;
}
```

#### 2.7.5 章节分割

以顶层 `<body>` 下的直接子 `<section>` 为章节边界。
每个 section 的 `<title>` 作为 TOC 标签。嵌套 section 生成子目录。

---

### 2.8 DOCX (ECMA-376 Open XML)

#### 2.8.1 文件识别

| 项目 | 值 |
|------|-----|
| Magic Bytes | `50 4B 03 04` (ZIP) |
| 二次确认 | ZIP 内含 `[Content_Types].xml` + `word/document.xml` |
| 规范 | ECMA-376 5th Edition / ISO/IEC 29500 |
| MIME | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

#### 2.8.2 ZIP 内部结构

```
document.docx (ZIP)
├── [Content_Types].xml          # MIME 类型映射
│   <Types>
│     <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
│     <Override PartName="/word/document.xml"
│               ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
│   </Types>
│
├── _rels/.rels                  # 顶层关系
│   <Relationships>
│     <Relationship Type="...officeDocument" Target="word/document.xml"/>
│     <Relationship Type="...core-properties" Target="docProps/core.xml"/>
│   </Relationships>
│
├── word/
│   ├── document.xml             # 主文档内容
│   ├── styles.xml               # 样式定义（Heading1, Normal 等）
│   ├── numbering.xml            # 列表编号定义
│   ├── footnotes.xml            # 脚注
│   ├── endnotes.xml             # 尾注
│   ├── header1.xml              # 页眉
│   ├── footer1.xml              # 页脚
│   ├── _rels/document.xml.rels  # 文档内部关系（图片 rId → 文件路径）
│   ├── media/                   # 嵌入图片
│   │   ├── image1.png
│   │   └── image2.jpg
│   └── theme/theme1.xml         # 主题（颜色、字体方案）
│
├── docProps/
│   ├── core.xml                 # Dublin Core 元数据
│   │   <dc:title>标题</dc:title>
│   │   <dc:creator>作者</dc:creator>
│   │   <dcterms:created>2024-01-01T00:00:00Z</dcterms:created>
│   └── app.xml                  # 应用属性
│       <Pages>10</Pages>
│       <Words>5000</Words>
```

#### 2.8.3 document.xml 核心元素

```xml
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <!-- 段落 -->
    <w:p>
      <w:pPr>                              <!-- 段落属性 -->
        <w:pStyle w:val="Heading1"/>       <!-- 样式引用 → mammoth 映射为 <h1> -->
        <w:jc w:val="center"/>             <!-- 对齐: left/center/right/both -->
        <w:numPr>                          <!-- 列表编号 -->
          <w:ilvl w:val="0"/>
          <w:numId w:val="1"/>
        </w:numPr>
      </w:pPr>
      <w:r>                                <!-- Run: 文本运行 -->
        <w:rPr>                            <!-- Run 属性 -->
          <w:b/>                           <!-- 加粗 -->
          <w:i/>                           <!-- 斜体 -->
          <w:u w:val="single"/>            <!-- 下划线 -->
          <w:strike/>                      <!-- 删除线 -->
          <w:sz w:val="28"/>               <!-- 字号: 半磅单位, 28 = 14pt -->
          <w:color w:val="FF0000"/>        <!-- 颜色 -->
          <w:rFonts w:ascii="Arial"/>      <!-- 字体 -->
        </w:rPr>
        <w:t xml:space="preserve">文本内容</w:t>
      </w:r>
      <w:hyperlink r:id="rId5">           <!-- 超链接 -->
        <w:r><w:t>链接文字</w:t></w:r>
      </w:hyperlink>
    </w:p>

    <!-- 表格 -->
    <w:tbl>
      <w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>单元格</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- 图片 -->
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <a:graphic>
              <a:graphicData>
                <pic:pic>
                  <pic:blipFill>
                    <a:blip r:embed="rId6"/>  <!-- 引用 _rels 中的图片 -->
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>
```

#### 2.8.4 转换库对比

| 库 | 许可证 | 大小 | 方向 | 特点 |
|---|---|---|---|---|
| mammoth | BSD-2 | ~50KB | DOCX→HTML | 语义化转换: Heading1→h1, Normal→p。忽略视觉样式，输出干净 HTML。阅读器首选 |
| docx-preview | MIT | ~200KB | DOCX→DOM | 高保真渲染，保留样式/布局/页眉页脚。适合预览场景 |

Vitra 策略: mammoth（语义化输出适合重排阅读）。

---

### 2.9 Markdown

#### 2.9.1 解析库对比

| 库 | 许可证 | 大小 | 速度 | 特点 |
|---|---|---|---|---|
| marked | MIT | ~40KB | 最快 | 轻量，GFM 支持，可扩展 tokenizer/renderer |
| markdown-it | MIT | ~100KB | 快 | 插件生态丰富（脚注、任务列表、数学公式、容器），CommonMark 严格兼容 |
| remark (unified) | MIT | ~200KB+ | 中 | AST 驱动，可做复杂转换，体积大 |

Vitra 推荐: marked（轻量快速，阅读器场景足够）。

#### 2.9.2 解析流程

```
buffer → TextDecoder("utf-8").decode() → marked.parse(text) → HTML
  → SectionSplitter.split(html)  // 以 h1-h6 为章节边界
  → VitraBook
```

---

### 2.10 HTML / HTM / XML / XHTML / MHTML

#### 2.10.1 MIME 类型映射

| 后缀 | MIME Type | DOMParser 模式 |
|------|-----------|----------------|
| .html / .htm | `text/html` | `text/html` |
| .xhtml | `application/xhtml+xml` | `application/xhtml+xml` (严格) |
| .xml | `application/xml` | `application/xml` |
| .mhtml | `multipart/related` | 先 MIME 解析再 `text/html` |

#### 2.10.2 MHTML 格式结构

```
MIME-Version: 1.0
Content-Type: multipart/related; type="text/html"; boundary="----=_Part_001"

------=_Part_001
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: https://example.com/page.html

<html>...<img src="image.png">...</html>

------=_Part_001
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Location: https://example.com/image.png

iVBORw0KGgo...

------=_Part_001--
```

解析库: `mhtml2html` (MIT, ~15KB) — 解析 MIME boundary，提取 HTML 部分，将内联资源转为 data URL。

#### 2.10.3 安全过滤

所有 HTML 内容必须经过 DOMPurify 过滤:

```ts
import DOMPurify from "dompurify";

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOW_UNKNOWN_PROTOCOLS: true,   // 保留 epub:/kindle: 等协议
    FORBID_TAGS: ["script", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}
```

DOMPurify: MIT 许可证, ~20KB, 是 XSS 过滤的事实标准。

---

## 第三部分：通用章节分割器

### 3.1 HTML → Book 统一转换 (SectionSplitter)

所有非结构化格式（TXT/HTML/DOCX/MD/FB2）最终都产出 HTML，需要统一的章节分割:

```ts
export class SectionSplitter {
  /**
   * 将 HTML 字符串分割为章节列表
   * 策略:
   *   1. DOMParser 解析 HTML
   *   2. 查找所有 h1-h6 标签作为章节标记
   *   3. 若无标题标签 → 启发式识别（单行文本 + isChapterTitle）
   *   4. 在每个标题前插入 <vitra-marker> 标签
   *   5. 按 marker 分割 innerHTML → 章节列表
   */
  static split(html: string): { label: string; html: string; index: number }[] {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // 查找标题元素
    let headings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6,title"));

    // 无标题时启发式识别
    if (headings.length === 0) {
      headings = this.detectImplicitHeadings(doc);
    }

    // 插入 marker
    for (const heading of headings) {
      const marker = doc.createElement("vitra-marker");
      heading.parentNode?.insertBefore(marker, heading);
    }

    // 按 marker 分割
    const chunks = doc.body.innerHTML
      .split("<vitra-marker></vitra-marker>")
      .filter(s => s.trim());

    return chunks.map((html, index) => ({
      label: this.extractTitle(html),
      html,
      index,
    }));
  }

  private static detectImplicitHeadings(doc: Document): Element[] {
    // 查找: 单行文本节点 + 看起来像标题的内容
    const candidates: Element[] = [];
    const elements = doc.getElementsByTagName("*");
    for (const el of elements) {
      if (el.childNodes.length === 1
          && el.childNodes[0].nodeType === Node.TEXT_NODE
          && isChapterTitle(el.textContent?.trim() || "")) {
        // 替换为 h1
        const h1 = doc.createElement("h1");
        h1.textContent = el.textContent;
        el.parentNode?.replaceChild(h1, el);
        candidates.push(h1);
      }
    }
    return candidates;
  }

  private static extractTitle(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const heading = doc.querySelector("h1,h2,h3,h4,h5,h6,title");
    return heading?.textContent?.trim() || "";
  }
}
```

### 3.2 Section → Blob URL 加载

```ts
function createSections(chunks: { label: string; html: string; index: number }[]): BookSection[] {
  const urls = new Map<number, string>();

  return chunks.map(chunk => ({
    id: chunk.index,
    href: `section-${chunk.index}`,
    label: chunk.label,
    load: async () => {
      if (urls.has(chunk.index)) return urls.get(chunk.index)!;
      const url = URL.createObjectURL(new Blob([chunk.html], { type: "text/html" }));
      urls.set(chunk.index, url);
      return url;
    },
    unload: () => {
      const url = urls.get(chunk.index);
      if (url) {
        URL.revokeObjectURL(url);
        urls.delete(chunk.index);
      }
    },
    size: new Blob([chunk.html]).size,
  }));
}
```

---

## 第四部分：Vitra 向量化渲染引擎

### 4.1 设计理念

传统阅读器渲染管线: `HTML → iframe → CSS column 分页`
Vitra 向量化渲染: `HTML → DOM 测量 → 虚拟分页模型 → 精确渲染`

核心差异:
- 不依赖 CSS multi-column 的浏览器实现（各浏览器行为不一致）
- 自研分页算法，精确控制每页内容边界
- 支持渐进式水合（Progressive Hydration）: 先渲染骨架，再填充细节
- 支持向量化批处理: 多个 section 的 DOM 测量并行化

### 4.2 渲染管线

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vitra Vector Render Pipeline                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: Parse                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│  │ 文件导入  │ →  │ Parser   │ →  │ VitraBook│                   │
│  │ ArrayBuf  │    │ 格式解析  │    │ 统一模型 │                  │
│  └──────────┘    └──────────┘    └──────────┘                   │
│                                                                 │
│  Stage 2: Measure (Worker 线程)                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│  │ Section  │ →  │ 离屏 DOM │ →  │ 块级元素 │                    │
│  │ HTML     │    │ 注入+测量 │    │ 尺寸表   │                   │
│  └──────────┘    └──────────┘    └──────────┘                   │
│                                                                 │
│  Stage 3: Paginate (纯计算)                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│  │ 尺寸表   │ →  │ 分页算法  │ →  │ PageMap  │                    │
│  │ + 视口   │    │ 贪心装箱  │    │ 页面映射  │                    │
│  └──────────┘    └──────────┘    └──────────┘                  │ 
│                                                                 │
│  Stage 4: Render (主线程)                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ PageMap  │ →  │ 虚拟滚动 │ →  │ iframe   │                  │
│  │ 当前页    │    │ 按需渲染  │    │ 精确定位 │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│                                                                 │
│  Stage 5: Hydrate (异步)                                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ 骨架渲染 │ →  │ 高亮注入 │ →  │ 交互绑定 │                  │
│  │ 先显示   │    │ 搜索索引  │    │ 手势/选择│                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 分页算法

```ts
interface BlockMetrics {
  element: string;       // 元素标识 (CSS selector path)
  offsetTop: number;     // 相对文档顶部的偏移
  height: number;        // 元素高度（含 margin）
  isBreakable: boolean;  // 是否可在内部断行（<p> 可以，<img> 不可以）
}

interface PageBoundary {
  sectionIndex: number;
  startBlock: number;    // 起始块索引
  endBlock: number;      // 结束块索引
  startOffset: number;   // 起始块内的像素偏移（用于跨页段落）
  endOffset: number;     // 结束块内的像素偏移
}

function paginate(
  blocks: BlockMetrics[],
  viewportHeight: number,
  gap: number = 0
): PageBoundary[] {
  const pages: PageBoundary[] = [];
  let currentPage: PageBoundary = {
    sectionIndex: 0, startBlock: 0, endBlock: 0, startOffset: 0, endOffset: 0
  };
  let remainingHeight = viewportHeight;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.height <= remainingHeight) {
      // 整块放入当前页
      currentPage.endBlock = i;
      currentPage.endOffset = block.height;
      remainingHeight -= block.height;
    } else if (block.isBreakable && remainingHeight > viewportHeight * 0.2) {
      // 可断行块: 部分放入当前页，剩余放入下一页
      currentPage.endBlock = i;
      currentPage.endOffset = remainingHeight;
      pages.push({ ...currentPage });

      // 新页从断点继续
      currentPage = {
        sectionIndex: 0,
        startBlock: i,
        endBlock: i,
        startOffset: remainingHeight,
        endOffset: block.height,
      };
      remainingHeight = viewportHeight - (block.height - remainingHeight);
    } else {
      // 不可断行或剩余空间太少: 整块放入下一页
      pages.push({ ...currentPage });
      currentPage = {
        sectionIndex: 0,
        startBlock: i,
        endBlock: i,
        startOffset: 0,
        endOffset: block.height,
      };
      remainingHeight = viewportHeight - block.height;
    }
  }
  pages.push(currentPage);
  return pages;
}
```

### 4.4 渲染模式

| 模式 | 适用格式 | 实现 |
|------|----------|------|
| 流式单页 | EPUB/TXT/FB2/DOCX/MD/HTML | iframe + CSS `column-width` 或 Vitra 自研分页 |
| 流式双页 | 同上 | 两个 iframe 并排，或 `column-count: 2` |
| 连续滚动 | 同上 | iframe 自然文档流，外层 overflow-y: auto |
| 固定布局 | PDF/DJVU | Canvas 渲染 (pdfjs/djvujs) |
| 图片翻页 | CBZ/CBT/CBR/CB7 | `<img>` + 翻页动画 |

### 4.5 渐进式水合 (Progressive Hydration)

大章节（>100KB HTML）的渲染策略:

```
Phase 1 (0ms):    骨架渲染 — 仅注入 HTML 到 iframe，不做任何后处理
Phase 2 (16ms):   样式注入 — 注入自定义 CSS（字体、字号、行高、主题色）
Phase 3 (50ms):   分页计算 — 测量 DOM 尺寸，计算页面映射
Phase 4 (100ms):  位置恢复 — 滚动到上次阅读位置
Phase 5 (idle):   高亮渲染 — 注入用户标注的高亮
Phase 6 (idle):   搜索索引 — 建立全文搜索索引
Phase 7 (idle):   预加载   — 预加载相邻章节
```

使用 `requestIdleCallback` 调度低优先级任务，确保首屏渲染不被阻塞。

### 4.6 CSS 注入模板

```ts
function buildReaderCSS(config: ReaderConfig): string {
  return `
    html, body {
      margin: 0; padding: 0;
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${config.textColor};
      background: ${config.bgColor};
      text-align: justify;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    /* 流式分页模式 */
    body {
      column-width: ${config.columnWidth}px;
      column-gap: ${config.columnGap}px;
      column-fill: auto;
      height: 100vh;
      overflow: hidden;
    }
    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
    }
    p { text-indent: ${config.textIndent ? "2em" : "0"}; margin: 0.5em 0; }
    h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
    /* 暗色模式反转图片 */
    ${config.isDark ? "img { filter: brightness(0.8); }" : ""}
  `;
}
```

---

## 第五部分：缓存与性能

### 5.1 IndexedDB 缓存策略

```
首次打开:
  原始文件 → Parser.parse() → VitraBook
  → 序列化 sections HTML 为 zip (fflate)
  → 存入 IndexedDB: key = "cache-{md5}", value = zip ArrayBuffer

再次打开:
  检查 IndexedDB 中 "cache-{md5}" 是否存在
  → 存在: fflate 解压 → 直接构建 VitraBook（跳过格式解析，快 5-10x）
  → 不存在: 走正常解析流程

例外:
  PDF/DJVU: 按页渲染，不预缓存（pdfjs 自带页面缓存）
  漫画: 图片已压缩，缓存收益低
```

### 5.2 内存管理

```ts
// Section 引用计数 + LRU 淘汰
class SectionManager {
  private loaded = new Map<number, string>();  // index → Blob URL
  private maxLoaded = 5;  // 最多同时保持 5 个 section 的 Blob URL

  async load(section: BookSection): Promise<string> {
    if (this.loaded.has(section.id as number)) {
      return this.loaded.get(section.id as number)!;
    }
    // LRU 淘汰
    if (this.loaded.size >= this.maxLoaded) {
      const oldest = this.loaded.keys().next().value;
      const url = this.loaded.get(oldest)!;
      URL.revokeObjectURL(url);
      this.loaded.delete(oldest);
    }
    const url = await section.load();
    this.loaded.set(section.id as number, url);
    return url;
  }
}
```

### 5.3 Worker 调度

```
主线程                          Worker 线程
  │                               │
  ├─ 用户翻页 ──────────────────→ │
  │                               ├─ 加载 section HTML
  │                               ├─ DOMPurify 过滤
  │                               ├─ 离屏 DOM 测量
  │                               ├─ 分页计算
  │  ←─────── PageMap 结果 ──────┤
  ├─ 渲染到 iframe                │
  ├─ 恢复阅读位置                  │
  │                               ├─ 预加载下一章节 (idle)
  │  ←─────── 预加载完成 ─────────┤
```

---

## 第六部分：第三方库总览

| 库 | 许可证 | 大小 | 用途 | 加载策略 |
|---|---|---|---|---|
| fflate | MIT | ~29KB | ZIP 解压 (EPUB/CBZ/DOCX/缓存) | 始终加载 |
| chardet | MIT | ~200KB | TXT 编码检测 | 按需 |
| pdfjs-dist | Apache-2.0 | ~2.5MB | PDF 渲染 | 按需懒加载 |
| djvu.js | GPL-3.0 | ~500KB | DJVU 渲染 | 按需懒加载 |
| mammoth | BSD-2 | ~50KB | DOCX→HTML | 按需 |
| marked | MIT | ~40KB | Markdown→HTML | 按需 |
| mhtml2html | MIT | ~15KB | MHTML→HTML | 按需 |
| DOMPurify | Apache-2.0 | ~20KB | HTML XSS 过滤 | 始终加载 |
| js-untar | MIT | ~5KB | TAR 解包 (CBT) | 按需 |
| libunrar.js | MIT | ~300KB | RAR 解压 (CBR) | 按需懒加载 |
| 7z-wasm | MIT | ~800KB | 7z 解压 (CB7) | 按需懒加载 |

始终加载总计: fflate(29KB) + DOMPurify(20KB) ≈ 49KB
全格式加载总计: ≈ 3.7MB（大部分是 pdfjs）

---

## 附录 A：Magic Bytes 速查表

| 格式 | Hex 签名 | ASCII | 偏移 |
|------|----------|-------|------|
| ZIP (EPUB/DOCX/CBZ) | `50 4B 03 04` | `PK..` | 0 |
| PDF | `25 50 44 46 2D` | `%PDF-` | 0 |
| RAR4 | `52 61 72 21 1A 07 00` | `Rar!...` | 0 |
| RAR5 | `52 61 72 21 1A 07 01 00` | `Rar!....` | 0 |
| 7z | `37 7A BC AF 27 1C` | `7z¼¯'.` | 0 |
| DJVU | `41 54 26 54 46 4F 52 4D` | `AT&TFORM` | 0 |
| MOBI/AZW | `42 4F 4F 4B 4D 4F 42 49` | `BOOKMOBI` | 60 |
| TAR (ustar) | `75 73 74 61 72` | `ustar` | 257 |
| GZ | `1F 8B` | — | 0 |
| BZ2 | `42 5A 68` | `BZh` | 0 |

## 附录 B：MOBI 语言代码表（部分）

| 代码 | 语言 | 代码 | 语言 |
|------|------|------|------|
| 1 | ar (阿拉伯语) | 9 | en (英语) |
| 2 | bg (保加利亚语) | 10 | es (西班牙语) |
| 3 | ca (加泰罗尼亚语) | 12 | fr (法语) |
| 4 | zh (中文): zh-TW, zh-CN, zh-HK, zh-SG | 16 | it (意大利语) |
| 5 | cs (捷克语) | 17 | ja (日语) |
| 6 | da (丹麦语) | 18 | ko (韩语) |
| 7 | de (德语) | 21 | nl (荷兰语) |
| 8 | el (希腊语) | 25 | pt (葡萄牙语) |

## 附录 C：EPUB 命名空间常量

```ts
const NS = {
  CONTAINER: "urn:oasis:names:tc:opendocument:xmlns:container",
  OPF:       "http://www.idpf.org/2007/opf",
  DC:        "http://purl.org/dc/elements/1.1/",
  DCTERMS:   "http://purl.org/dc/terms/",
  ENC:       "http://www.w3.org/2001/04/xmlenc#",
  DSIG:      "http://www.w3.org/2000/09/xmldsig#",
  XHTML:     "http://www.w3.org/1999/xhtml",
  NCX:       "http://www.daisy.org/z3986/2005/ncx/",
  EPUB:      "http://www.idpf.org/2007/ops",
  SMIL:      "http://www.w3.org/ns/SMIL",
  XLINK:     "http://www.w3.org/1999/xlink",
  FB2:       "http://www.gribuser.ru/xml/fictionbook/2.0",
};

const MIME = {
  XHTML: "application/xhtml+xml",
  HTML:  "text/html",
  CSS:   "text/css",
  SVG:   "image/svg+xml",
  NCX:   "application/x-dtbncx+xml",
  XML:   "application/xml",
  JS:    /\/(x-)?javascript/,
};
```
