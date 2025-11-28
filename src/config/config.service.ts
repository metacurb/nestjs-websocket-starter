import { Injectable } from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";

@Injectable()
export class ConfigService {
    constructor(private config: NestConfigService) {}

    get corsOrigins(): string | string[] {
        const origins = this.config.getOrThrow<string>("CORS_ORIGINS");
        if (origins === "*") return "*";
        return origins.split(",").map((o) => o.trim());
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

    get redisMaxRetries() {
        return this.config.getOrThrow<number>("REDIS_MAX_RETRIES");
    }

    get redisConnectTimeout() {
        return this.config.getOrThrow<number>("REDIS_CONNECT_TIMEOUT");
    }

    get redisCommandTimeout() {
        return this.config.getOrThrow<number>("REDIS_COMMAND_TIMEOUT");
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

    get throttleTtlMs() {
        return this.config.getOrThrow<number>("THROTTLE_TTL_MS");
    }

    get throttleLimit() {
        return this.config.getOrThrow<number>("THROTTLE_LIMIT");
    }

    get userDisplayNameMaxLength() {
        return this.config.getOrThrow<number>("USER_DISPLAY_NAME_MAX_LENGTH");
    }

    get userDisplayNameMinLength() {
        return this.config.getOrThrow<number>("USER_DISPLAY_NAME_MIN_LENGTH");
    }
}
