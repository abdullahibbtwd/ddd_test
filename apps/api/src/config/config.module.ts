import { Global, Module } from "@nestjs/common";
import { AppConfigService } from "./config.service";
import { parseEnv } from "./env.schema";
import { loadEnvFiles } from "./load-env";

@Global()
@Module({
  providers: [
    {
      provide: AppConfigService,
      useFactory: () => {
        loadEnvFiles();
        return new AppConfigService(parseEnv());
      },
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
