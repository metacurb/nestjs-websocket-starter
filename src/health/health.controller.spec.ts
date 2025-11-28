import type { DeepMocked } from "@golevelup/ts-jest";
import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { RedisService } from "../redis/redis.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
    let controller: HealthController;
    let redisService: DeepMocked<RedisService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                {
                    provide: RedisService,
                    useValue: createMock<RedisService>(),
                },
            ],
        }).compile();

        controller = module.get<HealthController>(HealthController);
        redisService = module.get(RedisService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("check", () => {
        test("should return ok status when Redis is healthy", async () => {
            redisService.ping.mockResolvedValue("PONG");

            const result = await controller.check();

            expect(result).toEqual({
                status: "ok",
                checks: {
                    redis: "ok",
                },
            });
            expect(redisService.ping).toHaveBeenCalledTimes(1);
        });

        test("should return degraded status when Redis ping fails", async () => {
            redisService.ping.mockRejectedValue(new Error("Connection refused"));

            const result = await controller.check();

            expect(result).toEqual({
                status: "degraded",
                checks: {
                    redis: "error",
                },
            });
        });

        test("should return degraded status when Redis returns unexpected response", async () => {
            redisService.ping.mockResolvedValue("INVALID");

            const result = await controller.check();

            expect(result).toEqual({
                status: "degraded",
                checks: {
                    redis: "error",
                },
            });
        });
    });
});
