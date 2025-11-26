import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

import { RoomState } from "../model/enum/room-state.enum";
import type { MemberDocument } from "./member.schema";

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
    @Prop({ required: true })
    code: string;

    @Prop({ required: true })
    isLocked: boolean;

    @Prop()
    maxMembers?: number;

    @Prop({ required: true })
    members: MemberDocument[];

    @Prop({ required: true })
    secret: string;

    @Prop({ required: true })
    state: RoomState;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
