import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { useContainer } from "class-validator";
import { Logger } from "nestjs-pino";

import { SocketIoAdapter } from "./adapters/socket-io.adapter";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import { getPinoLogger } from "./logging/utils/get-pino-logger";

let isShuttingDown = false;

async function gracefulShutdown(
    app: INestApplication,
    signal: string,
    shutdownTimeout: number,
    logger: Logger,
) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.log(`Received ${signal}, starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
        logger.warn("Shutdown timeout exceeded, forcing exit");
        process.exit(1);
    }, shutdownTimeout);

    try {
        await app.close();
        clearTimeout(forceExitTimer);
        logger.log("Graceful shutdown completed");
        process.exit(0);
    } catch (error) {
        logger.error(error, "Error during shutdown");
        clearTimeout(forceExitTimer);
        process.exit(1);
    }
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    const configService = app.get(ConfigService);
    const logger = app.get(Logger);

    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    app.useLogger(logger);
    app.enableCors({ origin: configService.corsOrigins, credentials: true });
    app.useWebSocketAdapter(new SocketIoAdapter(app));

    app.enableShutdownHooks();

    const shutdownTimeout = configService.shutdownTimeoutMs;

    process.on("SIGTERM", () => gracefulShutdown(app, "SIGTERM", shutdownTimeout, logger));
    process.on("SIGINT", () => gracefulShutdown(app, "SIGINT", shutdownTimeout, logger));

    await app.listen(3000);
    logger.log("Application started on port 3000");
}

bootstrap().catch((err) => {
    getPinoLogger().error(err);
    process.exit(1);
});
