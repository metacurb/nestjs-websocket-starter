import "./setup/test-env";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { RedisService } from "../src/redis/redis.service";
import { redisMockProvider } from "./setup/redis-mock";

interface RoomSession {
    roomCode: string;
    token: string;
}

describe("RoomsController (e2e)", () => {
    let app: INestApplication;
    let httpServer: ReturnType<INestApplication["getHttpServer"]>;
    let redisService: RedisService;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(redisMockProvider.provide)
            .useFactory({ factory: redisMockProvider.useFactory })
            .compile();

        app = moduleFixture.createNestApplication();
        redisService = app.get(RedisService);
        await app.init();
        await app.listen(0);
        httpServer = app.getHttpServer();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        const keys = await redisService.keys("room:*");
        const userKeys = await redisService.keys("user:*");
        const allKeys = [...keys, ...userKeys];
        if (allKeys.length > 0) {
            await Promise.all(allKeys.map((key) => redisService.del(key)));
        }
    });

    const createRoom = async (displayName = "Host", maxUsers?: number): Promise<RoomSession> => {
        const res = await request(httpServer)
            .post("/rooms")
            .send({ displayName, maxUsers })
            .expect(201);
        return res.body;
    };

    const joinRoom = async (roomCode: string, displayName: string): Promise<RoomSession> => {
        const res = await request(httpServer)
            .post(`/rooms/${roomCode}/join`)
            .send({ displayName })
            .expect(200);
        return res.body;
    };

    describe("POST /rooms", () => {
        test("should create a room and return session", async () => {
            const res = await request(httpServer)
                .post("/rooms")
                .send({ displayName: "TestHost" })
                .expect(201);

            expect(res.body).toHaveProperty("roomCode");
            expect(res.body).toHaveProperty("token");
            expect(res.body.roomCode).toHaveLength(6);
        });

        test("should create a room with maxUsers", async () => {
            const res = await request(httpServer)
                .post("/rooms")
                .send({ displayName: "TestHost", maxUsers: 5 })
                .expect(201);

            expect(res.body.roomCode).toBeDefined();

            const roomRes = await request(httpServer)
                .get(`/rooms/${res.body.roomCode}`)
                .expect(200);

            expect(roomRes.body.maxUsers).toBe(5);
        });

        test("should reject invalid displayName", async () => {
            await request(httpServer).post("/rooms").send({ displayName: "A" }).expect(400);
        });
    });

    describe("POST /rooms/:code/join", () => {
        test("should join an existing room", async () => {
            const { roomCode } = await createRoom();

            const res = await request(httpServer)
                .post(`/rooms/${roomCode}/join`)
                .send({ displayName: "Joiner" })
                .expect(200);

            expect(res.body).toHaveProperty("roomCode", roomCode);
            expect(res.body).toHaveProperty("token");
        });

        test("should reject joining non-existent room", async () => {
            await request(httpServer)
                .post("/rooms/NOTFND/join")
                .send({ displayName: "Joiner" })
                .expect(404);
        });

        test("should reject joining when room is full", async () => {
            const { roomCode } = await createRoom("Host", 2);
            await joinRoom(roomCode, "User2");

            await request(httpServer)
                .post(`/rooms/${roomCode}/join`)
                .send({ displayName: "User3" })
                .expect(400);
        });
    });

    describe("GET /rooms/:code", () => {
        test("should return room details", async () => {
            const { roomCode } = await createRoom("Host", 10);

            const res = await request(httpServer).get(`/rooms/${roomCode}`).expect(200);

            expect(res.body).toMatchObject({
                code: roomCode,
                isLocked: false,
                maxUsers: 10,
                state: "CREATED",
            });
            expect(res.body).toHaveProperty("hostId");
        });

        test("should return 404 for non-existent room", async () => {
            await request(httpServer).get("/rooms/NOTFND").expect(404);
        });
    });

    describe("POST /rooms/:code/rejoin", () => {
        test("should rejoin with valid token", async () => {
            const { roomCode, token } = await createRoom();

            const res = await request(httpServer)
                .post(`/rooms/${roomCode}/rejoin`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(res.body).toHaveProperty("roomCode", roomCode);
            expect(res.body).toHaveProperty("token");
        });

        test("should reject rejoin without token", async () => {
            const { roomCode } = await createRoom();

            await request(httpServer).post(`/rooms/${roomCode}/rejoin`).expect(401);
        });
    });
});
