import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { ConfigModule } from "./config/config.module";
import { ConfigService } from "./config/config.service";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./logging/logging.module";
import { RoomsModule } from "./rooms/rooms.module";

@Module({
    imports: [
        ConfigModule,
        LoggingModule,
        ThrottlerModule.forRootAsync({
            useFactory: (configService: ConfigService) => [
                {
                    ttl: configService.throttleTtlMs,
                    limit: configService.throttleLimit,
                },
            ],
            inject: [ConfigService],
        }),
        EventsModule,
        HealthModule,
        RoomsModule,
    ],
    controllers: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule {}
