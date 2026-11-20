import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ErrorCode } from "@ddcrm/shared";
import { AppException } from "../common/errors/app.exception";
import { AppConfigService } from "../config/config.service";
import { loadEmbeddedFontCss } from "./load-fonts";
import {
  DEFAULT_PDF_MARGINS,
  DEFAULT_PDF_TIMEOUT_MS,
  type PdfFromHtmlOptions,
  type PdfMargins,
} from "./pdf.types";

// Keep this footer markup minimal — Chromium/Gotenberg silently drops
// more elaborate footer documents when index.html is large (embedded fonts).
const DEFAULT_FOOTER_HTML = `<html><head><style>
html,body{width:100%;margin:0;padding:0 12mm;font-family:Inter,sans-serif;font-size:10px;color:#6B7280}
</style></head><body><div style="text-align:right;padding-top:4mm">Страница <span class="pageNumber"></span> от <span class="totalPages"></span></div></body></html>`;

@Injectable()
export class PdfService implements OnModuleInit {
  private fontCss = "";
  private baseTemplate = "";
  private smokeContent = "";

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  onModuleInit(): void {
    this.fontCss = loadEmbeddedFontCss();
    this.baseTemplate = readFileSync(join(__dirname, "templates", "base.html"), "utf8");
    this.smokeContent = readFileSync(join(__dirname, "templates", "smoke.html"), "utf8");
  }

  renderTemplate(contentHtml: string): string {
    return this.baseTemplate
      .replace("{{FONTS}}", this.fontCss)
      .replace("{{CONTENT}}", contentHtml);
  }

  renderSmokeHtml(): string {
    return this.renderTemplate(this.smokeContent);
  }

  async fromHtml(html: string, options: PdfFromHtmlOptions = {}): Promise<Buffer> {
    const margins: PdfMargins = {
      ...DEFAULT_PDF_MARGINS,
      ...options.margins,
    };
    const timeoutMs = options.timeoutMs ?? DEFAULT_PDF_TIMEOUT_MS;
    const includeFooter = options.footer !== false;
    const footerHtml =
      typeof options.footer === "string" ? options.footer : DEFAULT_FOOTER_HTML;

    const form = new FormData();
    // Pass filename as the 3rd FormData arg (Blob) so Gotenberg recognizes
    // index.html / footer.html — File() alone was not enough in Node fetch.
    // Both file parts must be appended before other fields, otherwise
    // Gotenberg silently ignores the footer.
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    if (includeFooter) {
      // Footer runs in a separate Chromium document — embed fonts there too
      // so Cyrillic ("Страница X от Y") renders without system fonts.
      const footerWithFonts = footerHtml.includes("</head>")
        ? footerHtml.replace("</head>", `<style>${this.fontCss}</style></head>`)
        : `<style>${this.fontCss}</style>${footerHtml}`;
      form.append(
        "files",
        new Blob([footerWithFonts], { type: "text/html" }),
        "footer.html",
      );
    }
    form.append("paperWidth", "8.27");
    form.append("paperHeight", "11.7");
    form.append("marginTop", margins.top);
    form.append("marginRight", margins.right);
    form.append("marginBottom", margins.bottom);
    form.append("marginLeft", margins.left);
    form.append("printBackground", "true");

    const url = new URL("/forms/chromium/convert/html", this.config.gotenbergUrl);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AppException(
        ErrorCode.INTERNAL,
        "PDF generation failed: Gotenberg request error",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AppException(
        ErrorCode.INTERNAL,
        `PDF generation failed: Gotenberg HTTP ${response.status}`,
        detail.slice(0, 500),
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 5 || bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
      throw new AppException(ErrorCode.INTERNAL, "PDF generation failed: invalid PDF payload");
    }
    return bytes;
  }

  async smokePdf(): Promise<Buffer> {
    return this.fromHtml(this.renderSmokeHtml(), { footer: true });
  }
}
