import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Redis } from "ioredis";
import { PinoLogger } from "nestjs-pino";

import { REDIS_CLIENT } from "./constants";
import { RedisService } from "./redis.service";

describe("RedisService", () => {
    let service: RedisService;
    let redisClient: jest.Mocked<Redis>;

    beforeEach(async () => {
        redisClient = createMock<Redis>();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RedisService,
                {
                    provide: REDIS_CLIENT,
                    useValue: redisClient,
                },
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
            ],
        }).compile();

        service = module.get<RedisService>(RedisService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("onModuleDestroy", () => {
        test("should disconnect the client", () => {
            service.onModuleDestroy();

            expect(redisClient.disconnect).toHaveBeenCalled();
        });
    });

    describe("del", () => {
        test("should delete key", async () => {
            await service.del("test-key");

            expect(redisClient.del).toHaveBeenCalledWith("test-key");
        });
    });

    describe("expire", () => {
        test("should set expiration on key", async () => {
            await service.expire("test-key", 3600);

            expect(redisClient.expire).toHaveBeenCalledWith("test-key", 3600);
        });
    });

    describe("ttl", () => {
        test("should return TTL for existing key", async () => {
            redisClient.ttl.mockResolvedValue(3600);

            const result = await service.ttl("test-key");

            expect(result).toBe(3600);
            expect(redisClient.ttl).toHaveBeenCalledWith("test-key");
        });

        test("should return -1 for key without expiration", async () => {
            redisClient.ttl.mockResolvedValue(-1);

            const result = await service.ttl("persistent-key");

            expect(result).toBe(-1);
        });

        test("should return -2 for nonexistent key", async () => {
            redisClient.ttl.mockResolvedValue(-2);

            const result = await service.ttl("nonexistent-key");

            expect(result).toBe(-2);
        });
    });

    describe("getJson", () => {
        test("should parse and return JSON object", async () => {
            const data = { name: "test", count: 42 };
            redisClient.get.mockResolvedValue(JSON.stringify(data));

            const result = await service.getJson<typeof data>("json-key");

            expect(result).toEqual(data);
        });

        test("should return null when key does not exist", async () => {
            redisClient.get.mockResolvedValue(null);

            const result = await service.getJson("nonexistent-key");

            expect(result).toBeNull();
        });

        test("should parse array values", async () => {
            const data = ["item1", "item2", "item3"];
            redisClient.get.mockResolvedValue(JSON.stringify(data));

            const result = await service.getJson<string[]>("array-key");

            expect(result).toEqual(data);
        });
    });

    describe("setJson", () => {
        test("should stringify and set object", async () => {
            const data = { name: "test", count: 42 };

            await service.setJson("json-key", data);

            expect(redisClient.set).toHaveBeenCalledWith("json-key", JSON.stringify(data));
        });

        test("should stringify and set with TTL", async () => {
            const data = { name: "test" };

            await service.setJson("json-key", data, 3600);

            expect(redisClient.setex).toHaveBeenCalledWith("json-key", 3600, JSON.stringify(data));
        });

        test("should handle array values", async () => {
            const data = ["item1", "item2"];

            await service.setJson("array-key", data);

            expect(redisClient.set).toHaveBeenCalledWith("array-key", JSON.stringify(data));
        });
    });
});
