import * as http from "http";
import { TwirpContext } from "./context";
import { chainHooks, isHook, ServerHooks } from "./hooks";
import { Interceptor } from "./interceptors";
import { getContentType, getRequestData, validateRequest } from "./request";
import {
  BadRouteError,
  httpStatusFromErrorCode,
  InternalServerError,
  InternalServerErrorWith,
  TwirpError,
} from "./errors";

/**
 * Twirp Server options
 */
interface TwirpServerOptions<
  T extends object,
  S extends TwirpContext = TwirpContext
> {
  service: T;
  packageName: string;
  serviceName: string;
  methodList: keys<T>;
  matchRoute: (method: string, events: RouterEvents<S>) => TwirpHandler<T, S>;
}

/**
 * httpHandler options
 */
export interface HttpHandlerOptions {
  prefix?: string | false;
}

/**
 * Handles a twirp request
 */
export type TwirpHandler<T, S extends TwirpContext = TwirpContext> = (
  ctx: S,
  service: T,
  data: Buffer,
  interceptors?: Interceptor<S, any, any>[]
) => Promise<Uint8Array | string>;

/**
 * Callback events for route matching
 */
export interface RouterEvents<T extends TwirpContext = TwirpContext> {
  onMatch: (ctx: T) => Promise<void> | void;
  onNotFound: () => Promise<void> | void;
}

type keys<T extends object> = Array<keyof T>;

/**
 * Runtime server implementation of a TwirpServer
 */
export class TwirpServer<
  T extends object,
  S extends TwirpContext = TwirpContext
> {
  public readonly packageName: string;
  public readonly serviceName: string;
  public readonly methodList: keys<T>;

  private service: T;
  private pathPrefix: string = "/twirp";
  private hooks: ServerHooks<S>[] = [];
  private interceptors: Interceptor<S, any, any>[] = [];
  private matchRoute: (
    method: string,
    events: RouterEvents<S>
  ) => TwirpHandler<T, S>;

  constructor(options: TwirpServerOptions<T, S>) {
    this.packageName = options.packageName;
    this.serviceName = options.serviceName;
    this.methodList = options.methodList;
    this.matchRoute = options.matchRoute;
    this.service = options.service;
  }

  /**
   * Returns the prefix for this server
   */
  get prefix() {
    return this.pathPrefix;
  }

  /**
   * The http handler for twirp complaint endpoints
   * @param options
   */
  public httpHandler(options?: HttpHandlerOptions) {
    return (req: http.IncomingMessage, resp: http.ServerResponse) => {
      // setup prefix
      if (options?.prefix !== undefined) {
        this.withPrefix(options.prefix);
      }
      return this._httpHandler(req, resp);
    };
  }

  /**
   * Adds interceptors or hooks to the request stack
   * @param middlewares
   */
  public use(...middlewares: (ServerHooks<S> | Interceptor<S, any, any>)[]) {
    middlewares.forEach((middleware) => {
      if (isHook<S>(middleware)) {
        this.hooks.push(middleware);
        return this;
      }

      this.interceptors.push(middleware);
    });

    return this;
  }

  /**
   * Adds a prefix to the service url path
   * @param prefix
   */
  public withPrefix(prefix: string | false) {
    if (prefix === false) {
      this.pathPrefix = "";
    } else {
      this.pathPrefix = prefix;
    }
    return this;
  }

  /**
   * Returns the regex matching path for this twirp server
   */
  public matchingPath() {
    const baseRegex = this.baseURI().replace(/\./g, "\\.");
    return new RegExp(`${baseRegex}\/(${this.methodList.join("|")})`);
  }

  /**
   * Returns the base URI for this twirp server
   */
  public baseURI() {
    return `${this.pathPrefix}/${this.packageName}.${this.serviceName}`;
  }

  /**
   * Create a twirp context
   * @param req
   * @param res
   * @private
   */
  protected createContext(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): S {
    return {
      packageName: this.packageName,
      serviceName: this.serviceName,
      methodName: "",
      contentType: getContentType(req.headers["content-type"]),
      req: req,
      res: res,
    } as S;
  }

  /**
   * Twrip server http handler implementation
   * @param req
   * @param resp
   * @private
   */
  private async _httpHandler(
    req: http.IncomingMessage,
    resp: http.ServerResponse
  ) {
    const ctx = this.createContext(req, resp);

    try {
      await this.invokeHook("requestReceived", ctx);

      const { method, mimeContentType } = validateRequest(
        ctx,
        req,
        this.pathPrefix || ""
      );

      const handler = this.matchRoute(method, {
        onMatch: (ctx) => {
          return this.invokeHook("requestRouted", ctx);
        },
        onNotFound: () => {
          const msg = `no handler for path ${req.url}`;
          throw new BadRouteError(msg, req.method || "", req.url || "");
        },
      });

      const body = await getRequestData(req);
      const response = await handler(
        ctx,
        this.service,
        body,
        this.interceptors
      );

      await Promise.all([
        this.invokeHook("responsePrepared", ctx),
        // keep backwards compatibility till next release
        this.invokeHook("requestPrepared", ctx),
      ]);

      resp.statusCode = 200;
      resp.setHeader("Content-Type", mimeContentType);
      resp.end(response);
    } catch (e) {
      await this.invokeHook("error", ctx, mustBeTwirpError(e));
      if (!resp.headersSent) {
        writeError(resp, e);
      }
    } finally {
      await Promise.all([
        this.invokeHook("responseSent", ctx),
        // keep backwards compatibility till next release
        this.invokeHook("requestSent", ctx),
      ]);
    }
  }

  /**
   * Invoke a hook
   * @param hookName
   * @param ctx
   * @param err
   * @protected
   */
  protected async invokeHook(
    hookName: keyof ServerHooks<S>,
    ctx: S,
    err?: TwirpError
  ) {
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
 * Write http error response
 * @param res
 * @param error
 */
export function writeError(
  res: http.ServerResponse,
  error: Error | TwirpError
): void {
  const twirpError = mustBeTwirpError(error);

  res.setHeader("Content-Type", "application/json");
  res.statusCode = httpStatusFromErrorCode(twirpError.code);
  res.end(twirpError.toJSON());
}

/**
 * Make sure that the error passed is a TwirpError
 * otherwise it will wrap it into an InternalError
 * @param err
 */
function mustBeTwirpError(err: Error | TwirpError): TwirpError {
  if (err instanceof TwirpError) {
    return err;
  }
  return new InternalServerErrorWith(err);
}
