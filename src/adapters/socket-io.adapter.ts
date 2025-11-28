import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

import { ConfigService } from "../config/config.service";

export class SocketIoAdapter extends IoAdapter {
    private readonly corsOrigins: string | string[];

    constructor(app: INestApplication) {
        super(app);
        const configService = app.get(ConfigService);
        this.corsOrigins = configService.corsOrigins;
    }

    createIOServer(port: number, options?: Partial<ServerOptions>) {
        return super.createIOServer(port, {
            ...options,
            cors: {
                origin: this.corsOrigins,
                credentials: true,
            },
        });
    }
}
