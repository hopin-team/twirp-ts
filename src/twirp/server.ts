import {TwirpContext} from "./context";
import {chainHooks, isHook, ServerHooks} from "./hooks";
import {Interceptor} from "./interceptors";
import {InternalServerError, TwirpError, TwirpErrorCode, writeError} from "./errors";
import * as http from "http";

interface TwirpServerOptions<S> {
    service: S
    createContext: (req: http.IncomingMessage, res: http.ServerResponse) => TwirpContext
    matchRoute: (method: string, events: RouterEvents) => TwirpHandler<S>
}

interface TwirpRequest {
    prefix?: string
    pkgService: string
    method: string
    contentType: TwirpContentType
    mimeContentType: string
}

export type TwirpHandler<S> = (ctx: TwirpContext, service: S, data: Buffer, interceptors?: Interceptor<any, any>[]) => Promise<Uint8Array | string>;

export interface RouterEvents {
    onMatch: (ctx: TwirpContext) => Promise<void> | void
    onNotFound: () => Promise<void> | void
}

export enum TwirpContentType {
    Protobuf,
    JSON,
    Unknown,
}

/**
 * Runtime server implementation of a TwirpServer
 */
export class TwirpServer<S> {

    private hooks: ServerHooks[] = [];
    private interceptors: Interceptor<any, any>[] = [];
    protected pathPrefix: string = "/twirp"

    constructor(private readonly options: TwirpServerOptions<S>) {}

    httpHandler() {
        return (req: http.IncomingMessage, resp: http.ServerResponse) =>
            this._httpHandler(req, resp);
    }

    /**
     * Twrip server http handler implementation
     * @param req
     * @param resp
     * @private
     */
    private async _httpHandler(req: http.IncomingMessage, resp: http.ServerResponse) {
        const ctx = this.options.createContext(req, resp);

        try {
            await this.invokeHook("requestReceived", ctx);

            const {method, mimeContentType} = validateRequest(ctx, req, this.pathPrefix || "");

            const handler = this.options.matchRoute(method, {
                onMatch: (ctx) => {
                    return this.invokeHook("requestRouted", ctx);
                },
                onNotFound: () => {
                    const msg = `no handler for path ${req.url}`
                    throw badRouteError(msg, req.method || "", req.url || "");
                },
            });

            const body = await getRequestData(req);
            const response = await handler(ctx, this.options.service, body, this.interceptors);

            await this.invokeHook("requestPrepared", ctx)

            resp.statusCode = 200;
            resp.setHeader("Content-Type", mimeContentType);
            resp.end(response);
        } catch (e) {
            await this.invokeHook("error", ctx, e);
            if (!resp.headersSent) {
                writeError(resp, e);
            }
        } finally {
            await this.invokeHook("requestSent", ctx);
        }
    }

    /**
     * Adds interceptors or hooks to the request stack
     * @param middlewares
     */
    use(...middlewares: (ServerHooks | Interceptor<any, any>)[]) {
        middlewares.forEach(middleware => {
            if (isHook(middleware)) {
                this.hooks.push(middleware)
                return this;
            }

            this.interceptors.push(middleware);
        })

        return this;
    }

    /**
     * Adds a prefix to the service url path
     * @param prefix
     */
    public withPrefix(prefix: string) {
        this.pathPrefix = prefix;
        return this;
    }

    /**
     * Invoke a hook
     * @param hookName
     * @param ctx
     * @param err
     * @protected
     */
    protected async invokeHook(hookName: keyof ServerHooks, ctx: TwirpContext, err?: TwirpError) {
        if (this.hooks.length === 0) {
            return;
        }

        const chainedHooks = chainHooks(...this.hooks);
        const hook = chainedHooks?.[hookName];
        if (hook) {
            await hook(ctx, err || new InternalServerError("internal server error"));
        }
    }
}

/**
 * Validate a twirp request
 * @param ctx
 * @param request
 * @param pathPrefix
 */
function validateRequest(ctx: TwirpContext, request: http.IncomingMessage, pathPrefix: string): TwirpRequest {
    if (request.method !== "POST") {
        const msg = `unsupported method ${request.method} (only POST is allowed)`;
        throw badRouteError(msg, request.method || "", request.url || "");
    }

    const path = parseTwirpPath(request.url || "");

    if (path.pkgService !== ctx.packageName + "." + ctx.serviceName) {
        const msg = `no handler for path ${request.url}`;
        throw badRouteError(msg, request.method || "", request.url || "");
    }

    if (path.prefix !== pathPrefix) {
        const msg = `invalid path prefix ${path.prefix}, expected ${pathPrefix}, on path ${request.url}`;
        throw badRouteError(msg, request.method || "", request.url || "");
    }

    const mimeContentType = request.headers["content-type"] || "";

    if (ctx.contentType === TwirpContentType.Unknown) {
        const msg = `unexpected Content-Type: ${request.headers["content-type"]}`;
        throw badRouteError(msg, request.method || "", request.url || "");
    }

    return {...path, mimeContentType, contentType: ctx.contentType};
}

/**
 * Get request data from the body
 * @param req
 */
function getRequestData(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            const data = Buffer.concat(chunks);
            resolve(data);
        });

        req.on("error", (err) => {
            if (req.aborted) {
                reject(new TwirpError(TwirpErrorCode.DeadlineExceeded, "failed to read request: deadline exceeded"));
            } else {
                reject(new TwirpError(TwirpErrorCode.Malformed, err.message).withCause(err));
            }
        });

        req.on("close", () => {
            reject(new TwirpError(TwirpErrorCode.Canceled, "failed to read request: context canceled"));
        });
    });
}

/**
 * Parses twirp url path
 * @param path
 */
function parseTwirpPath(path: string): Omit<TwirpRequest, "contentType" | "mimeContentType"> {
    const parts = path.split("/");
    if (parts.length < 2) {
        return {
            pkgService: "",
            method: "",
            prefix: "",
        }
    }

    return {
        method: parts[parts.length - 1],
        pkgService: parts[parts.length - 2],
        prefix: parts.slice(0, parts.length - 2).join("/"),
    }
}

/**
 * Creates a standard badRouteError
 * @param msg
 * @param method
 * @param url
 */
function badRouteError(msg: string, method: string, url: string) {
    const error = new TwirpError(TwirpErrorCode.BadRoute, msg);
    error.withMeta("twirp_invalid_route", method + " " + url);
    return error
}

/**
 * Get supported content-type
 * @param mimeType
 */
export function getContentType(mimeType: string | undefined): TwirpContentType {
    switch (mimeType) {
        case 'application/protobuf':
            return TwirpContentType.Protobuf;
        case 'application/json':
            return TwirpContentType.JSON;
        default:
            return TwirpContentType.Unknown;
    }
}