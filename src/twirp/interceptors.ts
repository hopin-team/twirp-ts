import {TwirpContext} from "./context";

// Interceptor is a form of middleware for Twirp requests, that can be installed on both
// clients and servers. To intercept RPC calls in the client, use the option
// `client.use()` on the client constructor. To intercept RPC calls in the server,
// use the option `server.use()` on the server constructor.
//
// Just like http middleware, interceptors can mutate requests and responses.
// This can enable some powerful integrations, but it should be used with much care
// because it may result in code that is very hard to debug.
export type Next<Request = any, Response = any> = (ctx: TwirpContext, typedRequest: Request) => Promise<Response>
export type Interceptor<Request, Response> = (ctx: TwirpContext, typedRequest: Request, next: Next<Request, Response>) => Promise<Response>;


// chains multiple Interceptors into a single Interceptor.
// The first interceptor wraps the second one, and so on.
// Returns null if interceptors is empty.
export function chainInterceptors<Request, Response>(...interceptors: Interceptor<Request, Response>[]): Interceptor<Request, Response> | undefined {
    if (interceptors.length === 0) {
        return;
    }

    if (interceptors.length === 1) {
        return interceptors[0];
    }

    const first = interceptors[0];
    return async (ctx, request, handler) => {
        let next: Next<Request, Response> = handler;

        for (let i = interceptors.length - 1; i > 0; i--) {
            next = ((next): Next<Request, Response> => (ctx, typedRequest) => {
                return interceptors[i](ctx, typedRequest, next);
            })(next);
        }

        return first(ctx, request, next);
    }
}