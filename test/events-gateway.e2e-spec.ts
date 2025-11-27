import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { RedisService } from "../src/redis/redis.service";
import type { RoomStoreModel } from "../src/rooms/model/store/room-store.model";
import type { UserStoreModel } from "../src/users/model/user-store.model";

interface RoomSession {
    roomCode: string;
    token: string;
}

interface RoomStateEvent {
    room: RoomStoreModel;
    users: UserStoreModel[];
}

describe("EventsGateway (e2e)", () => {
    let app: INestApplication;
    let httpServer: ReturnType<INestApplication["getHttpServer"]>;
    let redisService: RedisService;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

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

    const getSocketUrl = (): string => {
        const address = httpServer.address();
        const port = typeof address === "object" ? address?.port : address;
        return `http://localhost:${port}/rooms`;
    };

    const connectSocket = (token: string): Promise<Socket> => {
        return new Promise((resolve, reject) => {
            const socket = io(getSocketUrl(), {
                auth: { token },
                transports: ["websocket"],
                reconnection: false,
            });

            const timeout = setTimeout(() => {
                socket.disconnect();
                reject(new Error("Socket connection timeout"));
            }, 5000);

            socket.on("connect", () => {
                clearTimeout(timeout);
                resolve(socket);
            });

            socket.on("connect_error", (err) => {
                clearTimeout(timeout);
                socket.disconnect();
                reject(err);
            });

            socket.on("disconnect", (reason) => {
                if (reason === "io server disconnect") {
                    clearTimeout(timeout);
                    reject(new Error("Server disconnected the socket"));
                }
            });
        });
    };

    const waitForEvent = <T>(socket: Socket, event: string, timeout = 5000): Promise<T> => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${event}`));
            }, timeout);

            socket.once(event, (data: T) => {
                clearTimeout(timer);
                resolve(data);
            });
        });
    };

    describe("Connection", () => {
        test("should connect and receive room:state", async () => {
            const { roomCode, token } = await createRoom();
            const socket = await connectSocket(token);

            const roomState = await waitForEvent<RoomStateEvent>(socket, "room:state");

            expect(roomState.room.code).toBe(roomCode);
            expect(roomState.users).toHaveLength(1);
            expect(roomState.users[0].isConnected).toBe(true);

            socket.disconnect();
        });

        test("should receive existing users on join", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);

            const roomState = await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            expect(roomState.users).toHaveLength(2);
            expect(roomState.users.map((u) => u.displayName).sort()).toEqual(["Host", "User2"]);

            hostSocket.disconnect();
            user2Socket.disconnect();
        });

        test("should notify room when user connects", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const userConnectedPromise = waitForEvent<{ user: UserStoreModel }>(
                hostSocket,
                "user:connected",
            );

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);

            const { user } = await userConnectedPromise;

            expect(user.displayName).toBe("User2");
            expect(user.isConnected).toBe(true);

            hostSocket.disconnect();
            user2Socket.disconnect();
        });
    });

    describe("Disconnection", () => {
        test("should notify room when user disconnects", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);
            await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            const disconnectPromise = waitForEvent<{ user: UserStoreModel }>(
                hostSocket,
                "user:disconnected",
            );

            user2Socket.disconnect();

            const { user } = await disconnectPromise;

            expect(user.displayName).toBe("User2");
            expect(user.isConnected).toBe(false);

            hostSocket.disconnect();
        });
    });

    describe("Room Actions", () => {
        test("should toggle room lock", async () => {
            const { token } = await createRoom();
            const socket = await connectSocket(token);

            await waitForEvent<RoomStateEvent>(socket, "room:state");

            const lockPromise = waitForEvent<{ isLocked: boolean }>(socket, "room:lock_toggled");

            socket.emit("room:toggle_lock");

            const { isLocked } = await lockPromise;

            expect(isLocked).toBe(true);

            socket.disconnect();
        });

        test("should transfer host", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);
            const user2State = await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            const user2Id = user2State.users.find((u) => u.displayName === "User2")!.id;

            const hostUpdatePromise = waitForEvent<{ hostId: string }>(
                hostSocket,
                "room:host_updated",
            );

            hostSocket.emit("room:transfer_host", { newHostId: user2Id });

            const { hostId } = await hostUpdatePromise;

            expect(hostId).toBe(user2Id);

            hostSocket.disconnect();
            user2Socket.disconnect();
        });

        test("should kick user", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);
            const user2State = await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            const user2Id = user2State.users.find((u) => u.displayName === "User2")!.id;

            const kickedPromise = waitForEvent<null>(user2Socket, "user:kicked");
            const leftPromise = waitForEvent<{ userId: string; reason: string }>(
                hostSocket,
                "user:left",
            );

            hostSocket.emit("room:kick", { kickUserId: user2Id });

            await kickedPromise;
            const leftEvent = await leftPromise;

            expect(leftEvent.userId).toBe(user2Id);
            expect(leftEvent.reason).toBe("KICKED");

            hostSocket.disconnect();
        });

        test("should leave room", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);
            const user2State = await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            const user2Id = user2State.users.find((u) => u.displayName === "User2")!.id;

            const leftPromise = waitForEvent<{ userId: string; reason: string }>(
                hostSocket,
                "user:left",
            );

            user2Socket.emit("room:leave");

            const { userId, reason } = await leftPromise;

            expect(userId).toBe(user2Id);
            expect(reason).toBe("LEFT");

            hostSocket.disconnect();
        });

        test("should close room", async () => {
            const { roomCode, token: hostToken } = await createRoom("Host");

            const hostSocket = await connectSocket(hostToken);
            await waitForEvent<RoomStateEvent>(hostSocket, "room:state");

            const { token: user2Token } = await joinRoom(roomCode, "User2");
            const user2Socket = await connectSocket(user2Token);
            await waitForEvent<RoomStateEvent>(user2Socket, "room:state");

            const closedPromise = waitForEvent<{ reason: string }>(user2Socket, "room:closed");

            hostSocket.emit("room:close");

            const { reason } = await closedPromise;

            expect(reason).toBe("HOST_CLOSED");

            // Wait for server to process close
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Room should no longer exist
            await request(httpServer).get(`/rooms/${roomCode}`).expect(404);

            // Note: Don't manually disconnect - server already disconnected the sockets
            // and the users are deleted, which would cause handleDisconnect to throw
        });
    });

    describe("Error Handling", () => {
        test("should disconnect socket with invalid token", async () => {
            const socket = io(getSocketUrl(), {
                auth: { token: "invalid-token" },
                transports: ["websocket"],
                reconnection: false,
            });

            // With an invalid token, the server should disconnect the socket
            const result = await Promise.race([
                new Promise<string>((resolve) =>
                    socket.on("disconnect", () => resolve("disconnected")),
                ),
                new Promise<string>((resolve) =>
                    socket.on("connect_error", () => resolve("connect_error")),
                ),
                new Promise<string>((resolve) => {
                    const timer = setTimeout(() => resolve("timeout"), 3000);
                    timer.unref();
                }),
            ]);

            expect(["disconnected", "connect_error"]).toContain(result);

            socket.disconnect();
        });
    });
});
