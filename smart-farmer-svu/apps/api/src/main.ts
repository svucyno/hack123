import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, "0.0.0.0");
  console.log(`Smart Farmer API listening on http://0.0.0.0:${port}`);
}

bootstrap();
