/**
 * Minimal ambient type declarations for `pdfkit`.
 *
 * pdfkit does not ship its own TypeScript types and `@types/pdfkit` is not a
 * project dependency, so we declare just the surface this codebase uses. This
 * keeps the build self-contained (no extra packages to install) while still
 * giving us typed access in `services/pdf.ts`.
 */
declare module 'pdfkit' {
  import { Readable } from 'node:stream';

  type PDFKitColor = string | number[];

  interface PDFDocumentOptions {
    size?: string | [number, number];
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      [key: string]: string | undefined;
    };
    bufferPages?: boolean;
    [key: string]: unknown;
  }

  interface PDFKitTextOptions {
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
    height?: number;
    indent?: number;
    lineGap?: number;
    characterSpacing?: number;
    continued?: boolean;
    ellipsis?: boolean;
    link?: string;
    underline?: boolean;
    [key: string]: unknown;
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);

    /** Current cursor / page geometry. */
    x: number;
    y: number;
    page: {
      width: number;
      height: number;
      margins: { top: number; bottom: number; left: number; right: number };
    };

    registerFont(name: string, src: string | Buffer, family?: string): this;
    font(src: string): this;
    fontSize(size: number): this;
    fillColor(color: PDFKitColor): this;
    strokeColor(color: PDFKitColor): this;
    lineWidth(width: number): this;
    lineCap(cap: 'butt' | 'round' | 'square'): this;

    text(text: string | number, options?: PDFKitTextOptions): this;
    text(text: string | number, x?: number, y?: number, options?: PDFKitTextOptions): this;

    moveDown(lines?: number): this;
    moveUp(lines?: number): this;

    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    closePath(): this;

    addPage(options?: PDFDocumentOptions): this;
    switchToPage(index: number): this;
    bufferedPageRange(): { start: number; count: number };

    end(): this;
    flushPages(): this;
  }

  export = PDFDocument;
}
