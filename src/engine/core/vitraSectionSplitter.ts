import { isChapterTitle, EMPTY_SECTION_HTML, DEFAULT_SECTION_LABEL } from '../render/chapterTitleDetector';

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,title';
const MARKER_TAG = 'vitra-marker';

export interface SectionChunk {
  readonly label: string;
  readonly html: string;
  readonly index: number;
}

export class VitraSectionSplitter {
  static split(html: string): SectionChunk[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = this.getHeadingElements(doc);
    if (headings.length === 0) {
      return [{
        label: this.extractTitle(doc.body.innerHTML),
        html: doc.body.innerHTML || EMPTY_SECTION_HTML,
        index: 0,
      }];
    }

    this.injectMarkers(headings, doc);
    const parts = doc.body.innerHTML
      .split(`<${MARKER_TAG}></${MARKER_TAG}>`)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    return parts.map((part, index) => ({
      label: this.extractTitle(part),
      html: part,
      index,
    }));
  }

  private static getHeadingElements(doc: Document): Element[] {
    const headings = Array.from(doc.querySelectorAll(HEADING_SELECTOR));
    if (headings.length > 0) {
      return headings;
    }
    return this.detectImplicitHeadings(doc);
  }

  private static detectImplicitHeadings(doc: Document): Element[] {
    const detected: Element[] = [];
    const candidates = Array.from(doc.body.querySelectorAll('p,div,span,strong,b,li,dt,blockquote'));
    candidates.forEach((candidate) => {
      if (candidate.children.length > 0) return;
      const text = (candidate.textContent || '').trim();
      if (!isChapterTitle(text)) return;

      const heading = doc.createElement('h2');
      heading.textContent = text;
      candidate.replaceWith(heading);
      detected.push(heading);
    });
    return detected;
  }

  private static injectMarkers(headings: Element[], doc: Document): void {
    headings.forEach((heading) => {
      const marker = doc.createElement(MARKER_TAG);
      heading.parentNode?.insertBefore(marker, heading);
    });
  }

  private static extractTitle(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector(HEADING_SELECTOR);
    const raw = heading?.textContent?.trim() ?? '';
    if (raw.length > 0) return raw;
    return DEFAULT_SECTION_LABEL;
  }
}

