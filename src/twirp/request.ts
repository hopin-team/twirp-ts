import { TwirpContext } from "./context";
import http from "http";
import { BadRouteError, TwirpError, TwirpErrorCode } from "./errors";
import { TwirpContentType, TwirpRequest } from "./server";

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

/**
 * Validate a twirp request
 * @param ctx
 * @param request
 * @param pathPrefix
 */
export function validateRequest(ctx: TwirpContext, request: http.IncomingMessage, pathPrefix: string): TwirpRequest {
  if (request.method !== "POST") {
    const msg = `unsupported method ${request.method} (only POST is allowed)`;
    throw new BadRouteError(msg, request.method || "", request.url || "");
  }

  const path = parseTwirpPath(request.url || "");

  if (path.pkgService !== ctx.packageName + "." + ctx.serviceName) {
    const msg = `no handler for path ${request.url}`;
    throw new BadRouteError(msg, request.method || "", request.url || "");
  }

  if (path.prefix !== pathPrefix) {
    const msg = `invalid path prefix ${path.prefix}, expected ${pathPrefix}, on path ${request.url}`;
    throw new BadRouteError(msg, request.method || "", request.url || "");
  }

  const mimeContentType = request.headers["content-type"] || "";

  if (ctx.contentType === TwirpContentType.Unknown) {
    const msg = `unexpected Content-Type: ${request.headers["content-type"]}`;
    throw new BadRouteError(msg, request.method || "", request.url || "");
  }

  return {...path, mimeContentType, contentType: ctx.contentType};
}

/**
 * Get request data from the body
 * @param req
 */
export function getRequestData(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {

    const reqWithRawBody: http.IncomingMessage & {rawBody?: Buffer} = req;

    if (reqWithRawBody.rawBody instanceof Buffer) {
      resolve(reqWithRawBody.rawBody);
      return;
    }

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
export function parseTwirpPath(path: string): Omit<TwirpRequest, "contentType" | "mimeContentType"> {
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