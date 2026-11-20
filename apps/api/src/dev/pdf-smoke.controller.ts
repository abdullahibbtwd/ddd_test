import { Controller, Get, Inject, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Can } from "../auth/decorators/can.decorator";
import { PdfService } from "../pdf/pdf.service";

@ApiTags("dev")
@Controller("dev")
export class PdfSmokeController {
  constructor(@Inject(PdfService) private readonly pdf: PdfService) {}

  @Can("manage", "Setting")
  @Get("pdf-smoke")
  async pdfSmoke(): Promise<StreamableFile> {
    const pdf = await this.pdf.smokePdf();
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: 'inline; filename="pdf-smoke.pdf"',
    });
  }
}
