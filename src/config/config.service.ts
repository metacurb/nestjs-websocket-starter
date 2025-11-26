import { Injectable } from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";

@Injectable()
export class ConfigService {
    constructor(private config: NestConfigService) {}

    get roomCodeAlphabet() {
        return this.config.getOrThrow<string>("ROOM_CODE_ALPHABET");
    }

    get roomCodeLength() {
        return this.config.getOrThrow<number>("ROOM_CODE_LENGTH");
    }

    get roomMaxMembers() {
        return this.config.getOrThrow<number>("ROOM_MAX_MEMBERS");
    }

    get userNameMaxLength() {
        return this.config.getOrThrow<number>("USER_NAME_MAX_LENGTH");
    }

    get userNameMinLength() {
        return this.config.getOrThrow<number>("USER_NAME_MIN_LENGTH");
    }
}
