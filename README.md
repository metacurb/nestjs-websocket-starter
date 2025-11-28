<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# NestJS WebSocket Room Template

A complete foundation for building real-time, room-based applications such as Jackbox-style games, multiplayer lobbies, or collaborative experiences. Handles room creation, joining, reconnection, host controls, and user lifecycle management through HTTP endpoints and WebSocket events.

**Key Features:**

- Single JWT authentication with Redis-backed invalidation
- Ephemeral user identities (one room per user)
- Host controls: kick, lock, transfer, close
- Automatic reconnection support
- Rate limiting and graceful shutdown

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [User Flow](#user-flow)
- [Token Model](#token-model)
- [HTTP Endpoints](#http-endpoints)
- [WebSocket Events](#websocket-events)
- [Configuration](#configuration)
- [Redis Data Structures](#redis-data-structures)
- [Development](#development)

---

## Quick Start

### Prerequisites

- Node.js 18+
- Yarn
- Docker

### Installation

```bash
yarn install
```

### Configuration

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

### Start Redis

```bash
docker compose up -d
```

### Run

```bash
yarn start:dev
```

The server starts on port 3000. Health check: `GET /health`

---

## Architecture Overview

Users interact with the system through:

1. **HTTP API** — Create rooms, join rooms, reconnect after page reload, get room info
2. **WebSocket Gateway** (namespace: `/rooms`) — Real-time participation, room events, host actions

A **single JWT** (connection token) is issued on create/join/rejoin. Redis acts as the authoritative source of truth:

- Room closure immediately invalidates all tokens
- Locked rooms reject join attempts
- Membership must exist in Redis to authenticate

This preserves token simplicity while enabling instant invalidation.

---

## User Flow

### 1. Create Room

```
POST /rooms
```

Server creates a room code (profanity-filtered), assigns user as host, returns **connection token**. Client opens WebSocket with this token.

### 2. Join Room

```
POST /rooms/:code/join
```

Server verifies room exists, is unlocked, and not full. Returns **connection token**.

### 3. Reconnect

```
POST /rooms/:code/rejoin
Authorization: Bearer <existing token>
```

Server verifies token signature, user membership, and room status. Issues a **new JWT**.

### 4. Disconnects

User remains in Redis until explicit leave or TTL expires. Client must call `/rejoin` to obtain a new token.

### 5. Leave Room

Client sends WebSocket event `room:leave`. Server removes user from Redis, reassigns host if needed, disconnects socket.

---

## Token Model

Single JWT handles all authentication.

**Payload:**

```json
{
    "roomCode": "ABCD",
    "userId": "<string>"
}
```

The `exp` claim is set based on `ROOM_TTL_SECONDS`.

**WebSocket authentication verifies:**

1. Token signature
2. Token not expired
3. `userId` exists in `room:{roomCode}:users`
4. Room is not closed

Long TTL with instant Redis-based invalidation.

---

## HTTP Endpoints

### `POST /rooms`

Create a new room.

**Request:**

```json
{
    "displayName": "<string>",
    "maxUsers": 10
}
```

**Response:**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

---

### `GET /rooms/:code`

Get room information.

**Response:**

```json
{
    "code": "<string>",
    "hostId": "<string>",
    "isLocked": false,
    "maxUsers": 10,
    "state": "CREATED",
    "createdAt": "<date>",
    "updatedAt": "<date>"
}
```

**Errors:** `404` room not found

---

### `POST /rooms/:code/join`

Join an existing room.

**Request:**

```json
{
    "displayName": "<string>"
}
```

**Response:**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

**Errors:** `404` room not found, `400` room locked/full

---

### `POST /rooms/:code/rejoin`

Request a fresh connection token.

**Headers:** `Authorization: Bearer <existing token>`

**Response:**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

**Errors:** `404` user not a member or room closed

---

### `GET /health`

Health check.

**Response:**

```json
{
    "status": "ok",
    "checks": { "redis": "ok" }
}
```

---

## WebSocket Events

Connect to `/rooms` namespace:

```javascript
const socket = io("/rooms", {
    auth: { token: "<jwt>" },
});
```

### Client → Server

| Event                | Payload          | Description          |
| -------------------- | ---------------- | -------------------- |
| `room:close`         | —                | Host closes the room |
| `room:leave`         | —                | User leaves the room |
| `room:kick`          | `{ kickUserId }` | Host kicks a user    |
| `room:toggle_lock`   | —                | Lock/unlock room     |
| `room:transfer_host` | `{ newHostId }`  | Assign new host      |

### Server → Client

| Event               | Payload                                  | Description                 |
| ------------------- | ---------------------------------------- | --------------------------- |
| `room:state`        | `{ room, users }`                        | Initial state on connection |
| `room:closed`       | `{ reason: "HOST_CLOSED" }`              | Room closed                 |
| `room:host_updated` | `{ hostId }`                             | New host assigned           |
| `room:lock_toggled` | `{ isLocked }`                           | Broadcast lock state        |
| `user:connected`    | `{ user }`                               | Broadcast user connected    |
| `user:disconnected` | `{ user }`                               | Broadcast user disconnected |
| `user:kicked`       | —                                        | Sent to kicked user         |
| `user:left`         | `{ reason: "KICKED" \| "LEFT", userId }` | Broadcast departure         |
| `error:room`        | `{ code, message }`                      | Room-related error          |

### Error Codes

| Code                          | Description                         |
| ----------------------------- | ----------------------------------- |
| `ALREADY_HOST`                | User is already host                |
| `CANNOT_KICK_SELF`            | Cannot kick yourself                |
| `MEMBER_NOT_FOUND`            | User not found in room              |
| `NOT_HOST`                    | Action requires host privileges     |
| `ROOM_CODE_GENERATION_FAILED` | Failed to generate unique room code |
| `ROOM_FULL`                   | Room at max capacity                |
| `ROOM_LOCKED`                 | Room is locked                      |
| `ROOM_NOT_FOUND`              | Room does not exist                 |
| `UNKNOWN_ERROR`               | Unexpected error                    |

---

## Configuration

### Environment Variables

| Variable                       | Description                      | Default |
| ------------------------------ | -------------------------------- | ------- |
| `JWT_SECRET`                   | Secret key for signing JWTs      | —       |
| `REDIS_HOST`                   | Redis server host                | —       |
| `REDIS_PORT`                   | Redis server port                | —       |
| `REDIS_MAX_RETRIES`            | Max connection retries           | 3       |
| `REDIS_CONNECT_TIMEOUT`        | Connection timeout (ms)          | 10000   |
| `REDIS_COMMAND_TIMEOUT`        | Command timeout (ms)             | 5000    |
| `CORS_ORIGINS`                 | Allowed origins, comma-separated | \*      |
| `ROOM_CODE_ALPHABET`           | Characters for room codes        | —       |
| `ROOM_CODE_LENGTH`             | Length of room codes             | —       |
| `ROOM_MAX_USERS`               | Maximum users per room           | —       |
| `ROOM_TTL_SECONDS`             | Room TTL and JWT expiry          | —       |
| `USER_DISPLAY_NAME_MIN_LENGTH` | Min display name length          | —       |
| `USER_DISPLAY_NAME_MAX_LENGTH` | Max display name length          | —       |
| `THROTTLE_TTL_MS`              | Rate limit window (ms)           | 60000   |
| `THROTTLE_LIMIT`               | Max requests per window          | 20      |
| `SHUTDOWN_TIMEOUT_MS`          | Graceful shutdown timeout (ms)   | 10000   |

---

## Redis Data Structures

### Room

```
room:{roomCode} = JSON
```

```json
{
    "code": "<string>",
    "hostId": "<string>",
    "isLocked": false,
    "maxUsers": 10,
    "state": "CREATED",
    "createdAt": "<date>",
    "updatedAt": "<date>"
}
```

### Room Membership

```
room:{roomCode}:users = SET<userId>
```

### User

```
user:{userId} = JSON
```

```json
{
    "id": "<string>",
    "displayName": "<string>",
    "roomCode": "<string>",
    "isConnected": true,
    "socketId": "<string>"
}
```

Closing a room deletes all keys — tokens become invalid immediately.

---

## Development

### Running

```bash
yarn start        # development
yarn start:dev    # watch mode
yarn start:prod   # production
```

### Testing

```bash
yarn test         # unit tests
yarn test:e2e     # e2e tests
yarn test:cov     # coverage
```

---

## Summary

This template provides:

- Single-token authentication with Redis invalidation
- Safe reconnection mechanisms
- Room creation, joining, and leaving
- Host controls and membership management
- Secure WebSocket connection gating

A minimal, extensible foundation for real-time room-based systems.
