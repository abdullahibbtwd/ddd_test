import "reflect-metadata";
import { createApp } from "./create-app";
import { AppConfigService } from "./config/config.service";

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);
  await app.listen(config.apiPort, "0.0.0.0");
}

void bootstrap();
