<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository for a WebSocket server. Users are designed to be thrown away, and are cleared out periodically.

## Installation

```bash
$ yarn install
```

## Environment Variables

Create a `.env` file with the following variables:

| Variable                       | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `CORS_ORIGINS`                 | Allowed origins, comma-separated (default: \*)     |
| `JWT_SECRET`                   | Secret key for signing JWTs                        |
| `REDIS_HOST`                   | Redis server host                                  |
| `REDIS_PORT`                   | Redis server port                                  |
| `REDIS_MAX_RETRIES`            | Max connection retries (default: 3)                |
| `REDIS_CONNECT_TIMEOUT`        | Connection timeout in ms (default: 10000)          |
| `REDIS_COMMAND_TIMEOUT`        | Command timeout in ms (default: 5000)              |
| `ROOM_CODE_ALPHABET`           | Characters used to generate room codes             |
| `ROOM_CODE_LENGTH`             | Length of generated room codes                     |
| `ROOM_MAX_USERS`               | Maximum allowed users per room                     |
| `ROOM_TTL_SECONDS`             | TTL for rooms and JWT expiry (in seconds)          |
| `SHUTDOWN_TIMEOUT_MS`          | Graceful shutdown timeout in ms (default: 10000)   |
| `THROTTLE_TTL_MS`              | Rate limit window in milliseconds (default: 60000) |
| `THROTTLE_LIMIT`               | Max requests per window (default: 20)              |
| `USER_DISPLAY_NAME_MIN_LENGTH` | Minimum length for user display names              |
| `USER_DISPLAY_NAME_MAX_LENGTH` | Maximum length for user display names              |

## Running the app

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

# WebSocket Room Template (NestJS + Redis)

This template provides a complete foundation for building real-time, room-based applications such as Jackbox-style games, multiplayer lobbies, or collaborative experiences. It handles room creation, joining, reconnection, host controls, and user lifecycle management through a combination of HTTP endpoints and WebSocket events.

All identities are ephemeral. Each user belongs to **one room at a time**.
Room state is stored in Redis and governs all access and connection validity.

---

# Architecture Overview

Users interact with the system through:

1. **HTTP API**
    - Create rooms
    - Join rooms
    - Reconnect after page reload
    - Get room info

2. **WebSocket Gateway** (namespace: `/rooms`)
    - Real-time participation
    - Room events
    - Host actions
    - Leave rooms

A **single JWT** (connection token) is issued on create/join/rejoin.
Redis acts as the authoritative source of truth, meaning:

- Room closure immediately invalidates all tokens
- Locked rooms reject join attempts
- Membership must exist in Redis to authenticate

This approach preserves the simplicity of a single token while avoiding the pitfalls of long-lived credentials.

---

# User Flow

### 1. Create Room

Client calls:

```
POST /rooms
```

Server:

- Creates a room code of customisable length
- Creates a unique `userId`
- Creates the room in Redis
- Assigns the user as host
- Returns the user's **connection token**

Client then opens a WebSocket connection using this token.

---

### 2. Join Room

Client calls:

```
POST /rooms/:code/join
```

Server:

- Verifies room exists, is unlocked, and not full
- Creates a new `userId`
- Adds user to the room's membership set in Redis
- Returns the **connection token**

Client then connects over WebSocket.

---

### 3. Reconnect (after page reload)

Client calls:

```
POST /rooms/:code/rejoin
Authorization: Bearer <old token>
```

Server:

- Verifies token signature
- Verifies userId is still a member of the room
- Verifies room is still open
- Issues a **new JWT**

Client rejoins using the new token.

---

### 4. Disconnects

If the WebSocket disconnects:

- User remains in Redis until they explicitly leave (or TTL expires)
- On rejoin, client must call `/rejoin` to obtain a new token

---

### 5. Leaving a Room

Client sends WebSocket event `room:leave`.

Server:

- Removes user from Redis membership set
- If user was host, a new host is assigned (or room is closed if empty)
- User's socket is disconnected

---

# Token Model (Single JWT)

A single JWT handles all authentication.

### Payload example

```json
{
    "roomCode": "ABCD",
    "userId": "<string>"
}
```

> Note: The `exp` claim is automatically set based on `ROOM_TTL_SECONDS`.

### On WebSocket authentication:

Server verifies:

1. Token signature
2. Token not expired
3. `userId` exists in `room:{roomCode}:users`
4. Room is not closed

If any check fails → connection rejected.

This allows a long TTL while still enabling instant invalidation via Redis state.

---

# HTTP Endpoints

### `POST /rooms`

Create a new room.

**Request Body**

```json
{
  "displayName": "<string>",
  "maxUsers": <number> // optional
}
```

> `displayName` must be between `USER_DISPLAY_NAME_MIN_LENGTH` and `USER_DISPLAY_NAME_MAX_LENGTH` characters.

**Response**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

---

### `GET /rooms/:code`

Get room information.

**Response**

```json
{
  "code": "<string>",
  "hostId": "<string>",
  "isLocked": <boolean>,
  "maxUsers": <number>,
  "state": "<string>",
  "createdAt": "<date>",
  "updatedAt": "<date>"
}
```

Errors:

- `404` room does not exist

---

### `POST /rooms/:code/join`

Join an existing room.

**Request Body**

```json
{
    "displayName": "<string>"
}
```

> `displayName` must be between `USER_DISPLAY_NAME_MIN_LENGTH` and `USER_DISPLAY_NAME_MAX_LENGTH` characters.

**Response**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

Errors:

- `404` room does not exist
- `400` room is locked
- `400` room is full

---

### `POST /rooms/:code/rejoin`

Request a fresh connection token.

Requires Authorization header:

```
Bearer <old token>
```

**Response**

```json
{
    "roomCode": "<string>",
    "token": "<jwt>"
}
```

Errors:

- `404` if user is not a member
- `404` if room is closed

---

# WebSocket Events

Connect to the `/rooms` namespace with the token in handshake auth:

```javascript
const socket = io("/rooms", {
    auth: { token: "<jwt>" },
});
```

### Incoming (client → server)

| Event                       | Payload          | Description          |
| --------------------------- | ---------------- | -------------------- |
| `room:close`                | none             | Host closes the room |
| `room:leave`                | none             | User leaves the room |
| `room:kick` (host)          | `{ kickUserId }` | Host kicks a user    |
| `room:toggle_lock` (host)   | none             | Lock/unlock room     |
| `room:transfer_host` (host) | `{ newHostId }`  | Assign new host      |

---

### Outgoing (server → client)

| Event               | Payload                                    | Description                 |
| ------------------- | ------------------------------------------ | --------------------------- |
| `room:closed`       | `{ reason: "HOST_CLOSED" \| "HOST_LEFT" }` | Room closed                 |
| `room:host_updated` | `{ hostId }`                               | New host assigned           |
| `room:lock_toggled` | `{ isLocked }`                             | Broadcast lock state        |
| `user:connected`    | `{ user }`                                 | Broadcast user connected    |
| `user:disconnected` | `{ user }`                                 | Broadcast user disconnected |
| `user:kicked`       | none                                       | Sent to kicked user         |
| `user:left`         | `{ reason: "KICKED" \| "LEFT", userId }`   | Broadcast departure         |
| `error:room`        | `{ code, message }`                        | Room-related error          |

### Error Codes

| Code               | Description                     |
| ------------------ | ------------------------------- |
| `ALREADY_HOST`     | User is already host of room    |
| `CANNOT_KICK_SELF` | Cannot kick yourself from room  |
| `MEMBER_NOT_FOUND` | User not found in room          |
| `NOT_HOST`         | Action requires host privileges |
| `ROOM_FULL`        | Room has reached max capacity   |
| `ROOM_LOCKED`      | Room is locked                  |
| `ROOM_NOT_FOUND`   | Room does not exist             |
| `UNKNOWN_ERROR`    | An unexpected error occurred    |

---

# Redis Data Structures

### 1. Room

```
room:{roomCode} = JSON
```

```json
{
  "code": "<string>",
  "hostId": "<string>",
  "isLocked": <boolean>,
  "maxUsers": <number>,
  "state": "CREATED" | "CLOSED",
  "createdAt": "<date>",
  "updatedAt": "<date>"
}
```

### 2. Room membership

```
room:{roomCode}:users = SET<userId>
```

### 3. User

```
user:{userId} = JSON
```

```json
{
  "id": "<string>",
  "displayName": "<string>",
  "roomCode": "<string>",
  "isConnected": <boolean>,
  "socketId": "<string>" | null
}
```

### Closing a room deletes all keys

Once deleted, all tokens tied to this room become invalid even if unexpired.

---

# Summary

This template provides:

- Simplified single-token authentication
- Safe reconnection mechanisms
- Redis-backed invalidation for tokens and room lifecycle
- Room creation, joining, reconnection, and leaving
- Host controls and membership management
- Secure WebSocket connection gating

It provides a minimal but extensible foundation for building real-time room-based systems.
