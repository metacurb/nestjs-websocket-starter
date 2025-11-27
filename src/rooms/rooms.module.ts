import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RedisModule } from "../redis/redis.module";
import { UsersModule } from "../users/users.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({
    imports: [AuthModule, RedisModule, UsersModule],
    controllers: [RoomsController],
    exports: [RoomsService],
    providers: [RoomsService],
})
export class RoomsModule {}
