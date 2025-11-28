import { correlationStorage, getCorrelationId } from "./correlation.context";

describe("Correlation Context", () => {
    describe("getCorrelationId", () => {
        test("should return undefined when no correlation context is set", () => {
            expect(getCorrelationId()).toBeUndefined();
        });

        test("should return correlation ID when running within context", () => {
            const testCorrelationId = "test-correlation-123";

            correlationStorage.run({ correlationId: testCorrelationId }, () => {
                expect(getCorrelationId()).toBe(testCorrelationId);
            });
        });

        test("should return undefined after context exits", () => {
            correlationStorage.run({ correlationId: "temp-id" }, () => {
                // Inside context
            });

            expect(getCorrelationId()).toBeUndefined();
        });

        test("should support nested contexts with different IDs", () => {
            const outerCorrelationId = "outer-123";
            const innerCorrelationId = "inner-456";

            correlationStorage.run({ correlationId: outerCorrelationId }, () => {
                expect(getCorrelationId()).toBe(outerCorrelationId);

                correlationStorage.run({ correlationId: innerCorrelationId }, () => {
                    expect(getCorrelationId()).toBe(innerCorrelationId);
                });

                expect(getCorrelationId()).toBe(outerCorrelationId);
            });
        });

        test("should work with async operations", async () => {
            const correlationId = "async-123";

            await correlationStorage.run({ correlationId }, async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));

                expect(getCorrelationId()).toBe(correlationId);
            });
        });
    });
});
