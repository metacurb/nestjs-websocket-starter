import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ConfigService } from "../config/config.service";
import { EventsAuthService } from "./events-auth.service";

@Module({
    imports: [
        JwtModule.registerAsync({
            useFactory: (config: ConfigService) => ({
                secret: config.jwtSecret,
                signOptions: {
                    expiresIn: config.jwtExpiresIn,
                },
            }),
            inject: [ConfigService],
        }),
    ],
    exports: [JwtModule, EventsAuthService],
    providers: [EventsAuthService],
})
export class AuthModule {}
