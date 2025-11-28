import { NestFactory } from "@nestjs/core";
import { useContainer } from "class-validator";
import { Logger } from "nestjs-pino";

import { SocketIoAdapter } from "./adapters/socket-io.adapter";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import { getPinoLogger } from "./logging/utils/get-pino-logger";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    app.useLogger(app.get(Logger));
    app.enableCors({ origin: configService.corsOrigins, credentials: true });
    app.useWebSocketAdapter(new SocketIoAdapter(app));

    await app.listen(3000);
}
bootstrap().catch((err) => {
    getPinoLogger().error(err);
    process.exit(1);
});
