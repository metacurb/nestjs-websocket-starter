import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { nanoid } from "nanoid";
import { Observable } from "rxjs";

import { correlationStorage } from "../correlation.context";

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return new Observable((subscriber) => {
            correlationStorage.run({ correlationId: nanoid() }, () => {
                next.handle().subscribe(subscriber);
            });
        });
    }
}
