import { PinoLogger } from "nestjs-pino";

import { loggingConfig } from "../logging.config";

export const getPinoLogger = () => new PinoLogger(loggingConfig);
