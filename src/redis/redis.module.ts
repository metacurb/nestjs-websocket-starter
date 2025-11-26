import { Global, Module } from "@nestjs/common";
import { Redis } from "ioredis";

import { ConfigService } from "../config/config.service";
import { REDIS_CLIENT } from "./constants";
import { RedisService } from "./redis.service";

@Global()
@Module({
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: (configService: ConfigService) => {
                const redisInstance = new Redis({
                    host: configService.redisHost,
                    port: configService.redisPort,
                });

                redisInstance.on("error", (e) => {
                    throw new Error(`Redis connection failed: ${e}`);
                });

                return redisInstance;
            },
            inject: [ConfigService],
        },
        RedisService,
    ],
    exports: [RedisService],
})
export class RedisModule {}
