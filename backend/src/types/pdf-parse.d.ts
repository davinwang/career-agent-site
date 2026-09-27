/**
 * Minimal ambient type declarations for `pdf-parse`.
 *
 * pdf-parse does not ship its own TypeScript types and `@types/pdf-parse` is
 * not a project dependency, so we declare just the surface this codebase uses
 * (see `tools/knowledge.ts`). This keeps the build self-contained.
 */
declare module 'pdf-parse' {
  interface PdfParseInfo {
    PDFFormatVersion?: string;
    Title?: string;
    Author?: string;
    [key: string]: unknown;
  }

  interface PdfParseResult {
    /** Extracted text content. */
    text: string;
    /** Number of pages in the document. */
    numpages: number;
    /** Number of pages actually rendered/parsed. */
    numrender: number;
    /** Document info dictionary. */
    info: PdfParseInfo;
    /** Document metadata (or null). */
    metadata: unknown;
    /** pdf.js version used for parsing. */
    version: string;
  }

  interface PdfParseOptions {
    /** Custom page-render callback. */
    pagerender?: (pageData: unknown) => string | Promise<string>;
    /** Maximum number of pages to parse (0 = all). */
    max?: number;
    /** Version of the parser to use. */
    version?: string;
    [key: string]: unknown;
  }

  function pdfParse(
    data: Buffer | Uint8Array,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;

  export default pdfParse;
}
