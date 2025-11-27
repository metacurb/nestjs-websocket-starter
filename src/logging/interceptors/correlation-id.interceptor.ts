import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { v4 as uuid } from "uuid";

import { correlationStorage } from "../correlation.context";

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return new Observable((subscriber) => {
            correlationStorage.run({ correlationId: uuid() }, () => {
                next.handle().subscribe(subscriber);
            });
        });
    }
}
