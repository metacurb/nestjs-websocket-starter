import { AsyncLocalStorage } from "async_hooks";

export const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

export const getCorrelationId = (): string | undefined => {
    return correlationStorage.getStore()?.correlationId;
};
