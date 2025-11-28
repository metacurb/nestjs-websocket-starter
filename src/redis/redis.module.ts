import { Global, Module } from "@nestjs/common";
import { Redis } from "ioredis";
import { PinoLogger } from "nestjs-pino";

import { ConfigService } from "../config/config.service";
import { REDIS_CLIENT } from "./constants";
import { RedisService } from "./redis.service";

@Global()
@Module({
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: (configService: ConfigService, logger: PinoLogger) => {
                logger.setContext("RedisModule");

                const redisInstance = new Redis({
                    host: configService.redisHost,
                    port: configService.redisPort,
                    maxRetriesPerRequest: configService.redisMaxRetries,
                    connectTimeout: configService.redisConnectTimeout,
                    commandTimeout: configService.redisCommandTimeout,
                    retryStrategy: (times: number) => {
                        if (times > configService.redisMaxRetries) {
                            logger.error(
                                { attempt: times },
                                "Redis max retries exceeded, giving up",
                            );
                            return null;
                        }
                        const delay = Math.min(times * 200, 2000);
                        logger.warn({ attempt: times, delayMs: delay }, "Redis connection retry");
                        return delay;
                    },
                    lazyConnect: false,
                });

                redisInstance.on("error", (e) => {
                    logger.error({ error: e.message }, "Redis connection error");
                });

                redisInstance.on("connect", () => {
                    logger.info("Redis connected");
                });

                redisInstance.on("ready", () => {
                    logger.info("Redis ready");
                });

                redisInstance.on("close", () => {
                    logger.warn("Redis connection closed");
                });

                redisInstance.on("reconnecting", () => {
                    logger.info("Redis reconnecting");
                });

                return redisInstance;
            },
            inject: [ConfigService, PinoLogger],
        },
        RedisService,
    ],
    exports: [RedisService],
})
export class RedisModule {}
