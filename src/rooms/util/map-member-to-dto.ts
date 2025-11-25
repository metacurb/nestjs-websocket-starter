import type { MemberDtoModel } from "../dto/member-dto.model";
import type { MemberDocument } from "../schema/member.schema";

export const mapMemberToDto = (member: MemberDocument): MemberDtoModel => ({
    connected: member.connected,
    id: member._id.toHexString(),
    isHost: member.isHost,
    name: member.name,
});
