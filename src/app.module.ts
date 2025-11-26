import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { ConfigModule } from "./config/config.module";
import { EventsModule } from "./events/events.module";
import { RoomsModule } from "./rooms/rooms.module";

@Module({
    imports: [ConfigModule, LoggerModule.forRoot(), EventsModule, RoomsModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
