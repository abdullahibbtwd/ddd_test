import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { createApp } from "../src/create-app";

async function main(): Promise<void> {
  const app = await createApp({ enableSwagger: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DD CRM API")
    .setDescription("DD CRM backend API")
    .setVersion("0.0.0")
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
  const outPath = resolve(__dirname, "../openapi.json");
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  await app.close();
  console.log(`Wrote ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
