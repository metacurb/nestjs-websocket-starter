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
                ROOM_CODE_ALPHABET: joi.string().required(),
                ROOM_CODE_LENGTH: joi.number().required(),
                ROOM_MAX_MEMBERS: joi.number().required(),
                USER_NAME_MAX_LENGTH: joi.number().required(),
                USER_NAME_MIN_LENGTH: joi.number().required(),
            }),
        }),
    ],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule {}
