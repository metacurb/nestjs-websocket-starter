import { NestFactory } from "@nestjs/core";
import { useContainer } from "class-validator";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { getPinoLogger } from "./logging/utils/get-pino-logger";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    app.useLogger(app.get(Logger));
    app.enableCors({ origin: "*" });

    await app.listen(3000);
}
bootstrap().catch((err) => {
    getPinoLogger().error(err);
    process.exit(1);
});
