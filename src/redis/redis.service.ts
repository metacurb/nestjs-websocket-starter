import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ChainableCommander, Redis } from "ioredis";
import { PinoLogger } from "nestjs-pino";

import { REDIS_CLIENT } from "./constants";

@Injectable()
export class RedisService implements OnModuleDestroy {
    constructor(
        @Inject(REDIS_CLIENT) private readonly client: Redis,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    onModuleDestroy(): void {
        this.logger.info("Disconnecting Redis client");
        this.client.disconnect();
    }

    private async get(key: string): Promise<string | null> {
        this.logger.trace({ key }, "GET");
        return await this.client.get(key);
    }

    private async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        this.logger.trace({ key, ttlSeconds }, "SET");
        if (ttlSeconds) {
            await this.client.setex(key, ttlSeconds, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        this.logger.trace({ key, ttlSeconds }, "SET NX EX");
        const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
        return result === "OK";
    }

    async del(key: string): Promise<void> {
        this.logger.trace({ key }, "DEL");
        await this.client.del(key);
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        this.logger.trace({ key, ttlSeconds }, "EXPIRE");
        await this.client.expire(key, ttlSeconds);
    }

    async getJson<T>(key: string): Promise<T | null> {
        const raw = await this.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    }

    async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        await this.set(key, serialized, ttlSeconds);
    }

    multi(): ChainableCommander {
        this.logger.trace("MULTI");
        return this.client.multi();
    }

    async sadd(key: string, ...values: string[]): Promise<void> {
        this.logger.trace({ key, count: values.length }, "SADD");
        await this.client.sadd(key, values);
    }

    async srem(key: string, ...values: string[]): Promise<void> {
        this.logger.trace({ key, count: values.length }, "SREM");
        await this.client.srem(key, values);
    }

    async smembers<T = string>(key: string): Promise<T[]> {
        this.logger.trace({ key }, "SMEMBERS");
        return (await this.client.smembers(key)) as T[];
    }

    async sismember(key: string, value: string): Promise<boolean> {
        this.logger.trace({ key, value }, "SISMEMBER");
        return (await this.client.sismember(key, value)) === 1;
    }

    async keys(pattern: string): Promise<string[]> {
        this.logger.trace({ pattern }, "KEYS");
        return await this.client.keys(pattern);
    }
}
