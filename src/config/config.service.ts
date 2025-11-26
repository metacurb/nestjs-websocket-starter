import { Injectable } from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";
import type { StringValue } from "ms";

@Injectable()
export class ConfigService {
    constructor(private config: NestConfigService) {}

    get jwtExpiresIn(): StringValue {
        return this.config.getOrThrow<StringValue>("ROOM_TTL_SECONDS");
    }

    get jwtSecret() {
        return this.config.getOrThrow<string>("JWT_SECRET");
    }

    get redisHost() {
        return this.config.getOrThrow<string>("REDIS_HOST");
    }

    get redisPort() {
        return this.config.getOrThrow<number>("REDIS_PORT");
    }

    get roomCodeAlphabet() {
        return this.config.getOrThrow<string>("ROOM_CODE_ALPHABET");
    }

    get roomCodeLength() {
        return this.config.getOrThrow<number>("ROOM_CODE_LENGTH");
    }

    get roomMaxUsers() {
        return this.config.getOrThrow<number>("ROOM_MAX_USERS");
    }

    get roomTtlSeconds() {
        return this.config.getOrThrow<number>("ROOM_TTL_SECONDS");
    }

    get userDisplayNameMaxLength() {
        return this.config.getOrThrow<number>("USER_DISPLAY_NAME_MAX_LENGTH");
    }

    get userDisplayNameMinLength() {
        return this.config.getOrThrow<number>("USER_DISPLAY_NAME_MIN_LENGTH");
    }
}
