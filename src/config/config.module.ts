import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import * as joi from "joi";

import { ConfigService } from "./config.service";

@Global()
@Module({
    imports: [
        NestConfigModule.forRoot({
            isGlobal: false,
            validationSchema: joi.object({
                CORS_ORIGINS: joi.string().default("*"),
                JWT_SECRET: joi.string().required(),
                REDIS_HOST: joi.string().required(),
                REDIS_PORT: joi.number().required(),
                ROOM_CODE_ALPHABET: joi.string().required(),
                ROOM_CODE_LENGTH: joi.number().required(),
                ROOM_MAX_USERS: joi.number().required(),
                ROOM_TTL_SECONDS: joi.number().required(),
                THROTTLE_TTL_MS: joi.number().default(60000),
                THROTTLE_LIMIT: joi.number().default(20),
                USER_DISPLAY_NAME_MAX_LENGTH: joi.number().required(),
                USER_DISPLAY_NAME_MIN_LENGTH: joi.number().required(),
            }),
        }),
    ],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule {}
