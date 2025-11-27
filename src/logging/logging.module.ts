import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { loggingConfig } from "./logging.config";

@Module({
    imports: [LoggerModule.forRoot(loggingConfig)],
    exports: [LoggerModule],
})
export class LoggingModule {}
