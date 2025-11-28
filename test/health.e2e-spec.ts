import "./setup/test-env";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { redisMockProvider } from "./setup/redis-mock";

describe("HealthController (e2e)", () => {
    let app: INestApplication;
    let httpServer: ReturnType<INestApplication["getHttpServer"]>;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(redisMockProvider.provide)
            .useFactory({ factory: redisMockProvider.useFactory })
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();
        await app.listen(0);
        httpServer = app.getHttpServer();
    });

    afterAll(async () => {
        await app.close();
    });

    describe("GET /health", () => {
        test("should return health status", async () => {
            const res = await request(httpServer).get("/health").expect(200);

            expect(res.body).toHaveProperty("status");
            expect(res.body).toHaveProperty("checks");
            expect(res.body.checks).toHaveProperty("redis");
        });

        test("should return ok status when all checks pass", async () => {
            const res = await request(httpServer).get("/health").expect(200);

            expect(res.body.status).toBe("ok");
            expect(res.body.checks.redis).toBe("ok");
        });
    });
});
