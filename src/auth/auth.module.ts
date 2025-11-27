import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ConfigService } from "../config/config.service";
import { JwtAuthService } from "./jwt-auth.service";

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
    exports: [JwtModule, JwtAuthService],
    providers: [JwtAuthService],
})
export class AuthModule {}
