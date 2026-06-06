# Vitra Reader

[中文](./README.md) | [English](./README.en.md)

Vitra Reader is a desktop EPUB reader focused on **local-first data ownership, reading experience, and controllable sync**.  
Built with Electron + React + TypeScript, it aims to be a practical long-term reading app for daily use.

## License Notice

- This project is licensed under the `GNU AGPL-3.0-only`, an OSI-approved free and open source license.
- You are free to use, modify, and redistribute it, including for commercial purposes.
- However, any derivative work, and any deployment that offers it over a network, must make the complete corresponding source code available under AGPL-3.0.
- See [LICENSE](./LICENSE).

---

## Screenshot

![Vitra Reader Main UI](./docs/showcase-main.png)


---

## Why Vitra Reader

### Local-first, fully offline-capable
- Book files (multiple formats), progress, highlights/notes, and settings are stored locally.
- No account dependency for core reading workflows.

### Highly customizable reading experience
- Themes: Light / Dark / Sepia / Green + custom colors.
- Typography: font, size, line-height, letter-spacing, paragraph spacing, alignment.
- Reading modes: single-page / double-page / continuous scroll, in an immersive fullscreen UI.

### Sync and backup under your control
- WebDAV support for private cloud / self-hosted servers.
- Backup modes: Full / Data-only / Files-only.
- Connection test, restore strategy, and automated sync pipeline.

### Practical library management
- Category views: All books, Favorites, Notes, Highlights, Trash.
- Group system: create, rename, dissolve, and move books between groups.
- Grouped browsing in main content area via group cards.

---

## Core Features

### 1) Library & Import
- Multi-format import with metadata parsing (title, author, cover)
- Search, sorting, and group management
- Reading progress visualization
- Context menu actions (favorite, add to group, trash, restore, permanent delete)

### 2) Reader
- Multi-format content unified behind a ContentProvider interface via Vitra Pipeline (EPUB internally based on epub.js), rendered by ShadowRenderer
- Immersive fullscreen UI; three reading modes: single-page / double-page / continuous scroll
- TOC navigation
- Full-text search and result jump
- Keyboard navigation (Arrow keys / PageUp / PageDown)
- Text selection menu (copy, highlight, note, search, web search, read-aloud, translate)

### 3) Reading Styles
- System font selection
- Font size / line-height / letter-spacing / paragraph spacing / page width / brightness
- Text alignment (left / justify / center)
- Custom foreground/background colors

### 4) Translation & Read-aloud
- Inline translation with multiple engines: OpenAI-compatible (incl. Gemini / Ollama compatible endpoints), DeepL, DeepLX
- Translation requests proxied through the main process; API keys and endpoints configured locally
- Read-aloud via system speech synthesis (Web Speech), one click from the selection menu

### 5) Reading Stats
- Tracks reading time and activity, aggregated by book / period
- Dedicated reading statistics panel

### 6) Sync & Restore
- WebDAV connection testing
- Upload sync and download restore
- Sync modes (full/data/files)
- Restore modes (auto/full/data/files)
- Auto sync flow (startup pull + interval sync + pre-exit sync)

---

## Supported Formats

- Text / documents: `EPUB` `PDF` `TXT` `MOBI` `AZW` `AZW3` `MD` `HTML` `HTM` `XHTML` `XML` `FB2` `DOCX`
- Comics / archives: `CBZ` `CBT` `CBR` `CB7` (detected by content magic bytes and extension)
- Note: `DJVU` is recognized, but parsing relies on an optional GPL-3.0 component and is not enabled by default.

---

## Quick Start

### Requirements
- Node.js 18+
- npm 9+
- Windows 10/11 (current primary development platform)

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## Project Structure

```text
.
├─ electron/                  # Main process and preload
├─ src/
│  ├─ components/             # UI components (Library / Reader / Settings)
│  ├─ stores/                 # Zustand state stores
│  ├─ services/               # Storage, sync, and EPUB services
│  ├─ assets/                 # Icons and static resources
│  └─ styles/                 # Theme variables and global styles
├─ dist/                      # Frontend build output
└─ dist-electron/             # Electron build output
```

---

## Tech Stack

- Electron
- React 18
- TypeScript
- Vite
- Zustand
- Dexie.js (IndexedDB)
- epub.js (EPUB parsing and resource extraction)
- @lingo-reader/mobi-parser
- pdfjs-dist
- Mammoth (DOCX)
- Marked (Markdown)
- fflate
- Framer Motion

---

## Current Stage & Roadmap

Current stage: **Alpha (active iteration)**

Next:
- Read-aloud enhancements (voice/rate config, offline / online engines)
- Dictionary support (offline or online)
- Performance optimization for large documents (Worker-based, scroll smoothing)
- Translation engine and caching improvements
- Automated testing for critical paths (parsing, sync, reading state)

---

## Contributing & Feedback

Issues and PRs are welcome.  
Suggestions on reading stability, sync compatibility, and UI interaction are especially appreciated.

### Third-party open source acknowledgements

Vitra Reader uses and thanks these major GitHub open source projects. The complete dependency list is tracked in `package.json` and `package-lock.json`, and each dependency keeps its own license terms:

- [Electron](https://github.com/electron/electron) (MIT): desktop app runtime.
- [React](https://github.com/facebook/react) (MIT): UI components and rendering foundation.
- [Vite](https://github.com/vitejs/vite) (MIT): development server and frontend build tooling.
- [TypeScript](https://github.com/microsoft/TypeScript) (Apache-2.0): static typing and compilation toolchain.
- [Zustand](https://github.com/pmndrs/zustand) (MIT): frontend state management.
- [Dexie.js](https://github.com/dexie/Dexie.js) (Apache-2.0): IndexedDB data access.
- [epub.js](https://github.com/futurepress/epub.js) (BSD-2-Clause): EPUB package, TOC, chapter, and resource extraction.
- [@lingo-reader/mobi-parser](https://github.com/hhk-png/lingo-reader) (MIT): primary parser path for MOBI / AZW / AZW3 / KF8.
- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0): PDF rendering foundation.
- [fflate](https://github.com/101arrowz/fflate) (MIT): ZIP, Deflate, and Zlib decompression.
- [Framer Motion](https://github.com/motiondivision/motion) (MIT): UI motion effects.
- [Mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause): DOCX to HTML conversion.
- [Marked](https://github.com/markedjs/marked) (MIT): Markdown to HTML conversion.
