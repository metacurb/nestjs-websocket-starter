/**
 * Set up test environment variables before importing modules.
 * This must be called before any NestJS modules are imported.
 */
export function setupTestEnv() {
    process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
    process.env.REDIS_HOST = "localhost";
    process.env.REDIS_PORT = "6379";
    process.env.REDIS_MAX_RETRIES = "3";
    process.env.REDIS_CONNECT_TIMEOUT = "10000";
    process.env.REDIS_COMMAND_TIMEOUT = "5000";
    process.env.ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    process.env.ROOM_CODE_LENGTH = "6";
    process.env.ROOM_MAX_USERS = "50";
    process.env.ROOM_TTL_SECONDS = "3600";
    process.env.SHUTDOWN_TIMEOUT_MS = "5000";
    process.env.THROTTLE_TTL_MS = "60000";
    process.env.THROTTLE_LIMIT = "100";
    process.env.CORS_ORIGINS = "*";
    process.env.USER_DISPLAY_NAME_MIN_LENGTH = "2";
    process.env.USER_DISPLAY_NAME_MAX_LENGTH = "20";
}

// Auto-run on import
setupTestEnv();
