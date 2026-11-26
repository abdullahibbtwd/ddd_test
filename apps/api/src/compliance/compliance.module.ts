import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { AgreementsController } from "./agreements.controller";
import { AgreementsService } from "./agreements.service";
import { CertifiedEmployeesController } from "./certified-employees.controller";
import { ClientEmployeesController } from "./client-employees.controller";
import { ClientEmployeesService } from "./client-employees.service";
import {
  FoodRecordsController,
  FoodSchedulesController,
} from "./food-sampling.controller";
import { FoodSamplingService } from "./food-sampling.service";
import { HealthCertificatesController } from "./health-certificates.controller";
import { HealthCertificatesService } from "./health-certificates.service";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [
    ClientEmployeesController,
    HealthCertificatesController,
    AgreementsController,
    FoodSchedulesController,
    FoodRecordsController,
    CertifiedEmployeesController,
  ],
  providers: [
    ClientEmployeesService,
    HealthCertificatesService,
    AgreementsService,
    FoodSamplingService,
  ],
  exports: [
    ClientEmployeesService,
    HealthCertificatesService,
    AgreementsService,
    FoodSamplingService,
  ],
})
export class ComplianceModule {}
