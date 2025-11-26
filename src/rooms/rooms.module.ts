import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RedisModule } from "../redis/redis.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({
    imports: [AuthModule, RedisModule],
    controllers: [RoomsController],
    exports: [RoomsService],
    providers: [RoomsService],
})
export class RoomsModule {}
