export type PdfMargins = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type PdfFromHtmlOptions = {
  /** Include page-number footer ("Страница X от Y" by default). */
  footer?: boolean | string;
  margins?: Partial<PdfMargins>;
  timeoutMs?: number;
};

/** Margins in inches as plain floats (Gotenberg Chromium form fields). */
export const DEFAULT_PDF_MARGINS: PdfMargins = {
  top: "0.6",
  right: "0.6",
  bottom: "0.9",
  left: "0.6",
};

export const DEFAULT_PDF_TIMEOUT_MS = 30_000;
