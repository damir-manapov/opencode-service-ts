import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env["PORT"] ?? 3001;
  await app.listen(port);
  console.log(`OpenCode Service running on http://localhost:${String(port)}`);
}

bootstrap();
