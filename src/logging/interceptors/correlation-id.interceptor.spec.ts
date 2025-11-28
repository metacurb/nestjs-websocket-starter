import type { DeepMocked } from "@golevelup/ts-jest";
import { createMock } from "@golevelup/ts-jest";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { of } from "rxjs";

import { getCorrelationId } from "../correlation.context";
import { CorrelationIdInterceptor } from "./correlation-id.interceptor";

jest.mock("nanoid");

describe("CorrelationIdInterceptor", () => {
    let interceptor: CorrelationIdInterceptor;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CorrelationIdInterceptor],
        }).compile();

        interceptor = module.get<CorrelationIdInterceptor>(CorrelationIdInterceptor);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("should set correlation ID in context during request handling", async () => {
        const mockContext = createMock<ExecutionContext>();
        const mockCallHandler: DeepMocked<CallHandler> = createMock<CallHandler>({
            handle: jest.fn(() =>
                of({
                    correlationIdDuringRequest: getCorrelationId(),
                }),
            ),
        });

        await new Promise((resolve) => {
            interceptor.intercept(mockContext, mockCallHandler).subscribe({
                next: (result) => {
                    expect(result).toHaveProperty("correlationIdDuringRequest");
                    expect(
                        (result as { correlationIdDuringRequest: string })
                            .correlationIdDuringRequest,
                    ).toMatch(/^mocked-nanoid-\d+$/);
                },
                complete: () => {
                    expect(mockCallHandler.handle).toHaveBeenCalled();

                    resolve(true);
                },
            });
        });
    });

    test("should generate unique correlation IDs for each request", async () => {
        const mockContext = createMock<ExecutionContext>();
        const correlationIds: string[] = [];

        const mockCallHandler1: DeepMocked<CallHandler> = createMock<CallHandler>({
            handle: jest.fn(() => {
                correlationIds.push(getCorrelationId()!);
                return of("response1");
            }),
        });

        const mockCallHandler2: DeepMocked<CallHandler> = createMock<CallHandler>({
            handle: jest.fn(() => {
                correlationIds.push(getCorrelationId()!);
                return of("response2");
            }),
        });

        await new Promise((resolve) => {
            interceptor.intercept(mockContext, mockCallHandler1).subscribe({
                complete: () => {
                    interceptor.intercept(mockContext, mockCallHandler2).subscribe({
                        complete: () => {
                            expect(correlationIds).toHaveLength(2);
                            expect(correlationIds[0]).not.toBe(correlationIds[1]);

                            resolve(true);
                        },
                    });
                },
            });
        });
    });

    test("should not have correlation ID outside of request context", () => {
        expect(getCorrelationId()).toBeUndefined();
    });
});
