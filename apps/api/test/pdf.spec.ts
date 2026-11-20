import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { INestApplicationContext } from "@nestjs/common";
import { extractText, getDocumentProxy } from "unpdf";
import { AppConfigModule } from "../src/config/config.module";
import { loadEnvFiles } from "../src/config/load-env";
import { PdfModule } from "../src/pdf/pdf.module";
import { PdfService } from "../src/pdf/pdf.service";

describe("pdf", () => {
  let app: INestApplicationContext;
  let pdf: PdfService;

  beforeAll(async () => {
    loadEnvFiles();
    process.env.NODE_ENV = "test";
    app = await Test.createTestingModule({
      imports: [AppConfigModule, PdfModule],
    }).compile();
    await app.init();
    pdf = app.get(PdfService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("renders a multi-page smoke PDF with Cyrillic text", async () => {
    const bytes = await pdf.smokePdf();
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(5_000);

    const document = await getDocumentProxy(new Uint8Array(bytes));
    expect(document.numPages).toBeGreaterThanOrEqual(2);

    const { text } = await extractText(document, { mergePages: true });
    const joined = Array.isArray(text) ? text.join(" ") : text;
    expect(joined).toContain("Ресторант");
  }, 60_000);
});
