import { Controller, Get } from "@nestjs/common";

import { RedisService } from "../redis/redis.service";

@Controller("health")
export class HealthController {
    constructor(private readonly redisService: RedisService) {}

    @Get()
    async check() {
        const redisStatus = await this.checkRedis();

        return {
            status: redisStatus === "ok" ? "ok" : "degraded",
            checks: {
                redis: redisStatus,
            },
        };
    }

    private async checkRedis(): Promise<"ok" | "error"> {
        try {
            const result = await this.redisService.ping();
            return result === "PONG" ? "ok" : "error";
        } catch {
            return "error";
        }
    }
}
