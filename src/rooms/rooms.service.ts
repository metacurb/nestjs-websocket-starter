import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model, QueryFilter, UpdateQuery } from "mongoose";
import { nanoid } from "nanoid";
import { PinoLogger } from "nestjs-pino";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";
import { ConfigService } from "../config/config.service";
import { RoomErrorCode } from "../events/model/room.event";
import type { ConnectToRoomInput } from "./model/dto/connect-to-room.input";
import type { CreateRoomInput } from "./model/dto/create-room.input";
import type { UpdateHostInput } from "./model/dto/give-host.input";
import type { JoinRoomInput } from "./model/dto/join-room.input";
import type { KickUserInput } from "./model/dto/kick-user.input";
import type { LeaveRoomInput } from "./model/dto/leave-room.input";
import type { LockRoomInput } from "./model/dto/look-room.input";
import { RoomState } from "./model/enum/room-state.enum";
import { KickedRoomDataModel } from "./model/kicked-room-data.model";
import type { RoomDataModel } from "./model/room-data.model";
import { Member, MemberDocument } from "./schema/member.schema";
import { Room } from "./schema/room.schema";
import { generateRoomCode } from "./util/generate-room-code";
import { mapRoomToRoomData } from "./util/map-room-to-room-data";

@Injectable()
export class RoomsService {
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: PinoLogger,
        @InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(Member.name) private readonly memberModel: Model<Member>,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    private getRoomHost(room: Room): MemberDocument | undefined {
        return room.members.find(({ isHost }) => isHost);
    }

    private delete(code: string) {
        return this.roomModel.deleteOne({ code });
    }

    async getByCode(code: string): Promise<Room> {
        return await this._findOne({ code: code.toUpperCase() });
    }

    async create(input: CreateRoomInput): Promise<Room> {
        const member = new this.memberModel({
            connected: false,
            name: input.name,
            isHost: true,
            socketId: null,
        });

        const room = new this.roomModel({
            code: generateRoomCode(
                this.configService.roomCodeAlphabet,
                this.configService.roomCodeLength,
            ),
            isLocked: false,
            maxMembers: input.maxMembers,
            members: [member],
            secret: nanoid(),
            state: RoomState.Created,
        });

        return await room.save();
    }

    async join(code: string, input: JoinRoomInput): Promise<RoomDataModel> {
        const room = await this.getByCode(code);
        const host = this.getRoomHost(room);

        if (!host) throw new InvalidOperationException("Room has no host", RoomErrorCode.NoHost);

        if (input.memberId) {
            const existingMember = room.members.find(
                (member) => member._id.toHexString() === input.memberId,
            );
            if (existingMember) {
                return {
                    host,
                    me: existingMember,
                    room,
                };
            }
        }

        if (room.isLocked) {
            throw new InvalidOperationException("Room is locked", RoomErrorCode.RoomLocked);
        }

        if (room.maxMembers && room.members.length >= room.maxMembers) {
            throw new InvalidOperationException("Room is full", RoomErrorCode.RoomFull);
        }

        const member = new this.memberModel({
            connected: false,
            isHost: false,
            name: input.name,
            socketId: undefined,
        });

        const updatedRoom = await this._findOneAndUpdate(
            { code: room.code },
            { $push: { members: member } },
        );

        return {
            host,
            me: member,
            room: updatedRoom,
        };
    }

    async connect(socketId: string, input: ConnectToRoomInput): Promise<RoomDataModel> {
        const { memberId, roomCode } = input;

        const room = await this._findOneAndUpdate(
            { code: roomCode, "members._id": new mongoose.Types.ObjectId(memberId) },
            { $set: { "members.$.connected": true, "members.$.socketId": socketId } },
        );

        return mapRoomToRoomData(room, socketId);
    }

    async disconnect(socketId: string): Promise<RoomDataModel> {
        if (!socketId)
            throw new InvalidOperationException("Invalid socket ID", RoomErrorCode.InvalidSocketId);

        const room = await this._findOneAndUpdate(
            { "members.socketId": socketId },
            { $set: { "members.$.connected": false } },
        );

        return mapRoomToRoomData(room, socketId);
    }

    async reconnect(newSocketId: string, oldSocketId: string): Promise<RoomDataModel> {
        const room = await this._findOneAndUpdate(
            { "members.socketId": oldSocketId },
            { $set: { "members.$.connected": true, "members.$.socketId": newSocketId } },
        );

        return mapRoomToRoomData(room, newSocketId);
    }

    async leave(socketId: string, input: LeaveRoomInput): Promise<RoomDataModel | null> {
        const room = await this.getByCode(input.roomCode);

        const leavingMember = room.members.find((member) => member.socketId === socketId);
        if (!leavingMember) throw new MemberNotFoundException();

        if (leavingMember.isHost) {
            const nextHost = room.members.find((m) => m.socketId !== socketId);

            if (!nextHost) {
                await this.delete(input.roomCode);
                return null;
            }

            await this._findOneAndUpdate(
                { code: input.roomCode, "members.socketId": nextHost.socketId },
                { $set: { "members.$.isHost": true, secret: nanoid() } },
            );
        }

        const updatedRoom = await this._findOneAndUpdate(
            { code: input.roomCode },
            { $pull: { members: { socketId: socketId } } },
        );

        return mapRoomToRoomData(updatedRoom, socketId);
    }

    async kick(socketId: string, input: KickUserInput): Promise<KickedRoomDataModel> {
        const { memberId, roomCode, secret } = input;

        const room = await this.getByCode(roomCode);

        const host = this.getRoomHost(room);

        if (host?.socketId !== socketId) {
            throw new UnauthorizedHostActionException();
        }

        const kickedMember = room.members.find((member) => member._id.toHexString() === memberId);

        if (!kickedMember) {
            throw new MemberNotFoundException();
        }

        if (socketId.toLowerCase() === kickedMember.socketId.toLowerCase()) {
            throw new InvalidOperationException(
                "Cannot kick self from room",
                RoomErrorCode.CannotKickSelf,
            );
        }

        const updatedRoom = await this._findOneAndUpdate(
            {
                code: roomCode,
                secret,
                members: { $elemMatch: { socketId: socketId, isHost: true } },
            },
            { $pull: { members: { socketId: kickedMember.socketId } } },
        );

        return { kickedMember, ...mapRoomToRoomData(updatedRoom, socketId) };
    }

    async updateHost(socketId: string, input: UpdateHostInput): Promise<RoomDataModel> {
        const { memberId, roomCode, secret } = input;

        const room = await this.getByCode(roomCode);

        const host = this.getRoomHost(room);

        if (host?.socketId !== socketId) {
            throw new UnauthorizedHostActionException();
        }

        const member = room.members.find((member) => member._id.toHexString() === memberId);

        if (!member) {
            throw new MemberNotFoundException();
        }

        if (socketId.toLowerCase() === member.socketId.toLowerCase()) {
            throw new InvalidOperationException(
                "Member is already host of room",
                RoomErrorCode.AlreadyHost,
            );
        }

        const updatedRoom = await this._findOneAndUpdate(
            {
                code: roomCode,
                members: { $elemMatch: { socketId: socketId, isHost: true } },
                secret,
                "members.socketId": { $in: [socketId, member.socketId] },
            },
            {
                secret: nanoid(),
                $set: { "members.$[element1].isHost": false, "members.$[element2].isHost": true },
            },
            {
                arrayFilters: [
                    { "element1.socketId": socketId },
                    { "element2.socketId": member.socketId },
                ],
            },
        );

        return mapRoomToRoomData(updatedRoom, socketId);
    }

    async lock(socketId: string, input: LockRoomInput): Promise<RoomDataModel> {
        const { roomCode, secret } = input;

        const room = await this._findOneAndUpdate(
            {
                code: roomCode,
                members: { $elemMatch: { socketId: socketId, isHost: true } },
                secret,
            },
            [{ $set: { isLocked: { $not: "$isLocked" } } }],
        );

        return mapRoomToRoomData(room, socketId);
    }

    private async _findOne(conditions: QueryFilter<Room>): Promise<Room> {
        const room = await this.roomModel.findOne(conditions).exec();
        if (!room) throw new RoomNotFoundException();
        return room;
    }

    private async _findOneAndUpdate(
        conditions: QueryFilter<Room>,
        update: UpdateQuery<Room>,
        options = {},
    ): Promise<Room> {
        const room = await this.roomModel.findOneAndUpdate(conditions, update, {
            new: true,
            ...options,
        });

        if (!room) throw new RoomNotFoundException();

        return room;
    }
}
