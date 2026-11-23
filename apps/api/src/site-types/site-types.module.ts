import { Module } from "@nestjs/common";
import { SiteTypesController } from "./site-types.controller";
import { SiteTypesService } from "./site-types.service";

@Module({
  controllers: [SiteTypesController],
  providers: [SiteTypesService],
  exports: [SiteTypesService],
})
export class SiteTypesModule {}
