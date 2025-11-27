import { RequestMethod } from "@nestjs/common";
import type { Params } from "nestjs-pino";
import pino from "pino";

import { getCorrelationId } from "./correlation.context";
import { sequenceStamp } from "./utils/sequence-stamp";

const transport =
    process.env.LOG_PRETTY === "true"
        ? {
              target: "pino-pretty",
              options: { colorize: true, ignore: "ts,hostname", singleLine: true },
          }
        : undefined;

const level = process.env.LOG_LEVEL ?? "info";

export const loggingConfig: Params = {
    exclude: [{ method: RequestMethod.GET, path: "/health" }],
    pinoHttp: {
        formatters: {
            level: (label) => ({ level: label }),
        },
        level,
        mixin: () => ({
            ts: sequenceStamp(),
            correlationId: getCorrelationId(),
        }),
        mixinMergeStrategy: (mergeObject, mixinObject) => Object.assign(mixinObject, mergeObject),
        serializers: {
            err: pino.stdSerializers.err,
        },
        transport,
    },
};
