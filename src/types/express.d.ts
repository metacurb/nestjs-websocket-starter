import type { JwtPayload } from "../auth/model/jwt-payload";

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
