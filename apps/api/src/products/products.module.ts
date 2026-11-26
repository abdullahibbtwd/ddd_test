import { Module } from "@nestjs/common";
import { PdfModule } from "../pdf/pdf.module";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ServiceReportController } from "./service-report.controller";
import { ServiceReportService } from "./service-report.service";
import { VisitProductsController } from "./visit-products.controller";
import { VisitProductsService } from "./visit-products.service";

@Module({
  imports: [PdfModule],
  controllers: [
    ProductsController,
    VisitProductsController,
    MonitoringController,
    ServiceReportController,
  ],
  providers: [
    ProductsService,
    VisitProductsService,
    MonitoringService,
    ServiceReportService,
  ],
  exports: [ProductsService, VisitProductsService, MonitoringService, ServiceReportService],
})
export class ProductsModule {}
