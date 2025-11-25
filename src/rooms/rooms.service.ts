import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model, QueryFilter, UpdateQuery } from "mongoose";
import { nanoid } from "nanoid";
import { PinoLogger } from "nestjs-pino";

import { UserException } from "../common/user.exception";
import { RoomState } from "../model/enum/room-state.enum";
import { KickedRoomDataModel } from "../model/kicked-room-data.model";
import type { RoomDataModel } from "../model/room-data.model";
import type { ConnectToRoomInput } from "./dto/connect-to-room.input";
import type { CreateRoomInput } from "./dto/create-room.input";
import type { UpdateHostInput } from "./dto/give-host.input";
import type { JoinRoomInput } from "./dto/join-room.input";
import type { KickUserInput } from "./dto/kick-user.input";
import type { LeaveRoomInput } from "./dto/leave-room.input";
import type { LockRoomInput } from "./dto/look-room.input";
import type { MemberDocument } from "./schema/member.schema";
import { Member } from "./schema/member.schema";
import { Room } from "./schema/room.schema";
import { generateRoomCode } from "./util/generate-room-code";
import { mapRoomToRoomData } from "./util/map-room-to-room-data";

@Injectable()
export class RoomsService {
    constructor(
        private readonly logger: PinoLogger,
        @InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(Member.name) private readonly memberModel: Model<Member>,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    private getRoomHost(room: Room): Member | undefined {
        return room.members.find(({ isHost }) => isHost);
    }

    async getByCode(code: string): Promise<Room | null> {
        return await this._findOne({ code: code.toUpperCase() });
    }

    async getByMemberId(memberId: string): Promise<Room | null> {
        return await this._findOne({ "members._id": new mongoose.Types.ObjectId(memberId) });
    }

    async create(input: CreateRoomInput): Promise<Room> {
        const member = new this.memberModel({
            connected: false,
            name: input.name,
            isHost: true,
            socketId: null,
        });

        const room = new this.roomModel({
            code: generateRoomCode(),
            isLocked: false,
            maxMembers: input.maxMembers,
            members: [member],
            secret: nanoid(),
            state: RoomState.Created,
        });

        return await room.save();
    }

    async join(code: string, input: JoinRoomInput): Promise<MemberDocument | null> {
        const room = await this.getByCode(code);

        if (!room) return null;

        if (input.memberId) {
            const existingMember = room.members.find(
                (member) => member._id.toHexString() === input.memberId,
            );
            if (existingMember) return existingMember;
        }

        const member = new this.memberModel({
            connected: false,
            isHost: false,
            name: input.name,
            socketId: undefined,
        });

        await this._findOneAndUpdate({ code: room.code }, { $push: { members: member } });

        return member;
    }

    delete(code: string) {
        return this.roomModel.deleteOne({ code });
    }

    async connect(socketId: string, input: ConnectToRoomInput): Promise<RoomDataModel | null> {
        const { memberId, roomCode } = input;

        const result = await this._findOneAndUpdate(
            { code: roomCode, "members._id": new mongoose.Types.ObjectId(memberId) },
            { $set: { "members.$.connected": true, "members.$.socketId": socketId } },
        );

        if (!result) return null;

        return mapRoomToRoomData(result, socketId);
    }

    async disconnect(socketId: string): Promise<RoomDataModel | null> {
        if (!socketId) throw new UserException("Invalid socket ID");

        const result = await this._findOneAndUpdate(
            { "members.socketId": socketId },
            { $set: { "members.$.connected": false } },
        );

        if (!result) return null;

        return mapRoomToRoomData(result, socketId);
    }

    async reconnect(newSocketId: string, oldSocketId: string): Promise<RoomDataModel | null> {
        const result = await this._findOneAndUpdate(
            { "members.socketId": oldSocketId },
            { $set: { "members.$.connected": true, "members.$.socketId": newSocketId } },
        );

        if (!result) return null;

        return mapRoomToRoomData(result, newSocketId);
    }

    async leave(socketId: string, input: LeaveRoomInput): Promise<RoomDataModel | null> {
        const room = await this.getByCode(input.roomCode);
        if (!room) throw new UserException("Room not found");

        const leavingMember = room.members.find((member) => member.socketId === socketId);
        if (!leavingMember) throw new UserException("Member not found");

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

        const result = await this._findOneAndUpdate(
            { code: input.roomCode },
            { $pull: { members: { socketId: socketId } } },
        );

        if (!result) return null;

        return mapRoomToRoomData(result, socketId);
    }

    async kick(socketId: string, input: KickUserInput): Promise<KickedRoomDataModel | null> {
        const { memberId, roomCode, secret } = input;

        const room = await this.getByCode(roomCode);

        if (!room) {
            throw new UserException("Room does not exist");
        }

        const host = this.getRoomHost(room);

        if (host?.socketId !== socketId) {
            throw new UserException("Member is not host of room");
        }

        const kickedMember = room.members.find((member) => member._id.toHexString() === memberId);

        if (!kickedMember) {
            throw new UserException("Member does not exist in room");
        }

        if (socketId.toLowerCase() === kickedMember.socketId.toLowerCase()) {
            throw new UserException("Cannot kick self from room");
        }

        const result = await this._findOneAndUpdate(
            {
                code: roomCode,
                secret,
                members: { $elemMatch: { socketId: socketId, isHost: true } },
            },
            { $pull: { members: { socketId: kickedMember.socketId } } },
        );

        if (!result) return null;

        return { kickedMember, ...mapRoomToRoomData(result, socketId) };
    }

    async updateHost(socketId: string, input: UpdateHostInput): Promise<RoomDataModel | null> {
        const { memberId, roomCode, secret } = input;

        const room = await this.getByCode(roomCode);

        if (!room) {
            throw new UserException("Room does not exist");
        }

        const host = this.getRoomHost(room);

        if (host?.socketId !== socketId) {
            throw new UserException("Member is not host of room");
        }

        const member = room.members.find((member) => member._id.toHexString() === memberId);

        if (!member) {
            throw new UserException("Member does not exist in room");
        }

        if (socketId.toLowerCase() === member.socketId.toLowerCase()) {
            throw new UserException("Member is already host of room");
        }

        const result = await this._findOneAndUpdate(
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

        if (!result) return null;

        return mapRoomToRoomData(result, socketId);
    }

    async lock(socketId: string, input: LockRoomInput): Promise<RoomDataModel | null> {
        const { roomCode, secret } = input;

        const result = await this._findOneAndUpdate(
            {
                code: roomCode,
                members: { $elemMatch: { socketId: socketId, isHost: true } },
                secret,
            },
            [{ $set: { isLocked: { $not: "$isLocked" } } }],
        );

        if (!result) return null;

        return mapRoomToRoomData(result, socketId);
    }

    private _findOne(conditions: QueryFilter<Room>): Promise<Room | null> {
        return this.roomModel.findOne(conditions).exec();
    }

    private _findOneAndUpdate(
        conditions: QueryFilter<Room>,
        update: UpdateQuery<Room>,
        options = {},
    ): Promise<Room | null> {
        return this.roomModel.findOneAndUpdate(conditions, update, { new: true, ...options });
    }
}
