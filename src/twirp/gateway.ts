import * as http from "http";
import { parse } from 'querystring';
import * as dotObject from 'dot-object';
import { MatchFunction, MatchResult } from "path-to-regexp";
import { getRequestData } from "./request";
import { BadRouteError, NotFoundError, TwirpError, TwirpErrorCode } from "./errors";
import { HttpClientOptions, NodeHttpRPC } from "./http.client";
import { writeError } from "./server";

export enum Pattern {
  POST = 'post',
  GET = 'get',
  PATCH = 'patch',
  PUT = 'put',
  DELETE = 'delete',
}

export interface HttpRoute {
  serviceName: string
  methodName: string
  packageName: string
  matchingPath: string
  matcher: MatchFunction
  httpMethod: Pattern
  bodyKey?: string
  responseBodyKey?: string
  additionalBindings?: HttpRoute
}

type RouteRules = {
  [key in Pattern]: HttpRoute[]
}

/**
 * The Gateway proxies http requests to Twirp Compliant
 * requests.
 */
export class Gateway {
  constructor(public readonly routes: RouteRules) {
  }

  /**
   * Middleware that rewrite the current request
   * to a Twirp compliant request
   */
  twirpRewrite(prefix = "/twirp") {
    return (req: http.IncomingMessage, resp: http.ServerResponse, next: (err?: Error) => void) => {
      this.rewrite(req, prefix)
        .then(() => next())
        .catch(e => {
          if (e instanceof TwirpError) {
            if (e.code !== TwirpErrorCode.NotFound) {
              writeError(resp, e);
            } else {
              next();
            }
          }
        })
    }
  }

  /**
   * Rewrite an incoming request to a Twirp compliant request
   * @param req
   * @param prefix
   */
  async rewrite(req: http.IncomingMessage, prefix = "/twirp") {
    const [match, route] = this.matchRoute(req);

    const body = await this.prepareTwirpBody(req, match, route);

    const twirpUrl = `${prefix}/${route.packageName}.${route.serviceName}/${route.methodName}`;
    req.url = twirpUrl;
    (req as any).originalUrl = twirpUrl;
    req.method = "POST";
    req.headers["content-type"] = "application/json";

    process.nextTick(() => {
      req.emit("data", Buffer.from(JSON.stringify(body)))
      req.emit("end");
    });
  }

  /**
   * Create a reverse proxy handler to
   * proxy http requests to Twirp Compliant requests
   * @param httpClientOption
   */
  reverseProxy(httpClientOption: HttpClientOptions) {
    const client = NodeHttpRPC(httpClientOption);

    return async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const [match, route] = this.matchRoute(req)
        const body = await this.prepareTwirpBody(req, match, route)

        const response = await client.request(
          `${route.packageName}.${route.serviceName}`,
          route.methodName,
          "application/json",
          body
        );

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");

        let jsonResponse: string
        if (route.responseBodyKey) {
          jsonResponse = JSON.stringify({[route.responseBodyKey]: response});
        } else {
          jsonResponse = JSON.stringify(response);
        }

        res.end(jsonResponse);
      } catch (e) {
        writeError(res, e);
      }
    }
  }

  /**
   * Prepares twirp body requests using http.google.annotions
   * compliant spec
   *
   * @param req
   * @param match
   * @param route
   * @protected
   */
  protected async prepareTwirpBody(req: http.IncomingMessage, match: MatchResult, route: HttpRoute): Promise<Record<string, any>> {
    const {query_string, ...params} = match.params as Record<string, any>;

    let requestBody: Record<string, any> = {
      ...params,
    };

    if (query_string && route.bodyKey !== "*") {
      const queryParams = this.parseQueryString(query_string)
      requestBody = {...queryParams, ...requestBody}
    }

    let body: Record<string, any> = {};

    if (route.bodyKey) {
      const data = await getRequestData(req);

      try {
        const jsonBody = JSON.parse(data.toString() || "{}");
        if (route.bodyKey === "*") {
          body = jsonBody;
        } else {
          body[route.bodyKey] = jsonBody;
        }
      } catch (e) {
        const msg = "the json request could not be decoded";
        throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
      }
    }

    return {...body, ...requestBody}
  }

  /**
   * Matches a route
   * @param req
   */
  matchRoute(req: http.IncomingMessage): [MatchResult, HttpRoute] {
    const httpMethod = req.method?.toLowerCase() as Pattern;

    if (!httpMethod) {
      throw new BadRouteError(`method not allowed`, req.method || "", req.url || "")
    }

    const routes = this.routes[httpMethod];

    for (const route of routes) {
      const match = route.matcher(req.url || "/");

      if (match) {
        return [match, route];
      }
    }

    throw new NotFoundError(`url ${req.url} not found`)
  }

  /**
   * Parse query string
   * @param queryString
   */
  parseQueryString(queryString: string) {
    const queryParams = parse(queryString.replace("?", ""));
    return dotObject.object(queryParams);
  }
}