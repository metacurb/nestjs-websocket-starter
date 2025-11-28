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

    describe("expire", () => {
        test("should set expiration on key", async () => {
            await service.expire("test-key", 3600);

            expect(redisClient.expire).toHaveBeenCalledWith("test-key", 3600);
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

    describe("setIfNotExists", () => {
        test("should return true when key was set", async () => {
            redisClient.set.mockResolvedValue("OK");

            const result = await service.setIfNotExists("test-key", "value", 3600);

            expect(result).toBe(true);
            expect(redisClient.set).toHaveBeenCalledWith("test-key", "value", "EX", 3600, "NX");
        });

        test("should return false when key already exists", async () => {
            redisClient.set.mockResolvedValue(null);

            const result = await service.setIfNotExists("existing-key", "value", 3600);

            expect(result).toBe(false);
            expect(redisClient.set).toHaveBeenCalledWith("existing-key", "value", "EX", 3600, "NX");
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

    describe("mget", () => {
        test("should return values for multiple keys", async () => {
            redisClient.mget.mockResolvedValue(["value1", "value2", null]);

            const result = await service.mget("key1", "key2", "key3");

            expect(result).toEqual(["value1", "value2", null]);
            expect(redisClient.mget).toHaveBeenCalledWith(["key1", "key2", "key3"]);
        });

        test("should return empty array when no keys provided", async () => {
            const result = await service.mget();

            expect(result).toEqual([]);
            expect(redisClient.mget).not.toHaveBeenCalled();
        });
    });

    describe("mgetJson", () => {
        test("should parse and return JSON objects for multiple keys", async () => {
            const data1 = { name: "test1" };
            const data2 = { name: "test2" };
            redisClient.mget.mockResolvedValue([JSON.stringify(data1), JSON.stringify(data2)]);

            const result = await service.mgetJson<typeof data1>("key1", "key2");

            expect(result).toEqual([data1, data2]);
        });

        test("should return null for missing keys", async () => {
            const data1 = { name: "test1" };
            redisClient.mget.mockResolvedValue([JSON.stringify(data1), null]);

            const result = await service.mgetJson<typeof data1>("key1", "key2");

            expect(result).toEqual([data1, null]);
        });

        test("should return empty array when no keys provided", async () => {
            const result = await service.mgetJson();

            expect(result).toEqual([]);
        });
    });

    describe("del", () => {
        test("should delete a single key", async () => {
            await service.del("key1");

            expect(redisClient.del).toHaveBeenCalledWith(["key1"]);
        });

        test("should delete multiple keys", async () => {
            await service.del("key1", "key2", "key3");

            expect(redisClient.del).toHaveBeenCalledWith(["key1", "key2", "key3"]);
        });

        test("should not call del when no keys provided", async () => {
            await service.del();

            expect(redisClient.del).not.toHaveBeenCalled();
        });
    });

    describe("ping", () => {
        test("should return PONG", async () => {
            redisClient.ping.mockResolvedValue("PONG");

            const result = await service.ping();

            expect(result).toBe("PONG");
            expect(redisClient.ping).toHaveBeenCalled();
        });
    });

    describe("keys", () => {
        test("should return matching keys", async () => {
            redisClient.keys.mockResolvedValue(["room:ABC", "room:DEF"]);

            const result = await service.keys("room:*");

            expect(result).toEqual(["room:ABC", "room:DEF"]);
            expect(redisClient.keys).toHaveBeenCalledWith("room:*");
        });
    });
});
