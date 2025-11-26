import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RoomsModule } from "../rooms/rooms.module";
import { EventsGateway } from "./events.gateway";

@Module({
    imports: [AuthModule, RoomsModule],
    providers: [EventsGateway],
})
export class EventsModule {}
