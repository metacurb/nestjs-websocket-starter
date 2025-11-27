import { Module } from "@nestjs/common";

import { ConfigModule } from "./config/config.module";
import { EventsModule } from "./events/events.module";
import { LoggingModule } from "./logging/logging.module";
import { RoomsModule } from "./rooms/rooms.module";

@Module({
    imports: [ConfigModule, LoggingModule, EventsModule, RoomsModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
