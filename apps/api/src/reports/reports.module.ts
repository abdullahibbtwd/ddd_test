import { Module } from "@nestjs/common";
import { PdfModule } from "../pdf/pdf.module";
import { ReportsController } from "./reports.controller";
import { ReportsExportService } from "./reports-export.service";
import { ReportsQueryService } from "./reports-query.service";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PdfModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsQueryService, ReportsExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
