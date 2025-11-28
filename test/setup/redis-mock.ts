import RedisMock from "ioredis-mock";

import { REDIS_CLIENT } from "../../src/redis/constants";

/**
 * Creates a mock Redis client for testing.
 * Each call creates a new isolated instance.
 */
export function createRedisMock() {
    return new RedisMock();
}

/**
 * Provider configuration for overriding Redis in test modules.
 */
export const redisMockProvider = {
    provide: REDIS_CLIENT,
    useFactory: () => createRedisMock(),
};
