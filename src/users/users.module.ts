import { Module } from "@nestjs/common";

import { RedisModule } from "../redis/redis.module";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
    imports: [RedisModule],
    providers: [UsersRepository, UsersService],
    exports: [UsersService],
})
export class UsersModule {}
