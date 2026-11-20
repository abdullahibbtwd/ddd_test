import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getLiveness() {
    return this.healthService.liveness();
  }

  @Public()
  @Get("ready")
  getReadiness() {
    return this.healthService.readiness();
  }
}
