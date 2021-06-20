import {
  TwirpServer,
  RouterEvents,
  TwirpError,
  TwirpErrorCode,
  TwirpContext,
  Interceptor,
  TwirpContentType,
  chainInterceptors,
} from "twirp-ts";
import { Size, Hat } from "./service";

//==================================//
//          Client Code             //
//==================================//

interface Rpc {
  request(
    service: string,
    method: string,
    contentType: "application/json" | "application/protobuf",
    data: object | Uint8Array
  ): Promise<object | Uint8Array>;
}

export interface HaberdasherClient {
  MakeHat(request: Size): Promise<Hat>;
}

export class HaberdasherClientJSON implements HaberdasherClient {
  private readonly rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
    this.MakeHat.bind(this);
  }
  MakeHat(request: Size): Promise<Hat> {
    const data = Size.toJSON(request);
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "MakeHat",
      "application/json",
      data as object
    );
    return promise.then((data) => Hat.fromJSON(data as any));
  }
}
export class HaberdasherClientProtobuf implements HaberdasherClient {
  private readonly rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
    this.MakeHat.bind(this);
  }
  MakeHat(request: Size): Promise<Hat> {
    const data = Size.encode(request).finish();
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "MakeHat",
      "application/protobuf",
      data
    );
    return promise.then((data) => Hat.decode(data as Uint8Array));
  }
}

//==================================//
//          Server Code             //
//==================================//

export interface HaberdasherTwirp {
  MakeHat(ctx: TwirpContext, request: Size): Promise<Hat>;
}

export enum HaberdasherMethod {
  MakeHat = "MakeHat",
}

export const HaberdasherMethodList = [HaberdasherMethod.MakeHat];

export function createHaberdasherServer(service: HaberdasherTwirp) {
  return new TwirpServer<HaberdasherTwirp>({
    service,
    packageName: "twirp.example.haberdasher",
    serviceName: "Haberdasher",
    methodList: HaberdasherMethodList,
    matchRoute: matchHaberdasherRoute,
  });
}

function matchHaberdasherRoute(method: string, events: RouterEvents) {
  switch (method) {
    case "MakeHat":
      return async (
        ctx: TwirpContext,
        service: HaberdasherTwirp,
        data: Buffer,
        interceptors?: Interceptor<Size, Hat>[]
      ) => {
        ctx = { ...ctx, methodName: "MakeHat" };
        await events.onMatch(ctx);
        return handleMakeHatRequest(ctx, service, data, interceptors);
      };
    default:
      events.onNotFound();
      const msg = `no handler found`;
      throw new TwirpError(TwirpErrorCode.BadRoute, msg);
  }
}

function handleMakeHatRequest(
  ctx: TwirpContext,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<Size, Hat>[]
): Promise<string | Uint8Array> {
  switch (ctx.contentType) {
    case TwirpContentType.JSON:
      return handleMakeHatJSON(ctx, service, data, interceptors);
    case TwirpContentType.Protobuf:
      return handleMakeHatProtobuf(ctx, service, data, interceptors);
    default:
      const msg = "unexpected Content-Type";
      throw new TwirpError(TwirpErrorCode.BadRoute, msg);
  }
}
async function handleMakeHatJSON(
  ctx: TwirpContext,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<Size, Hat>[]
) {
  let request: Size;
  let response: Hat;

  try {
    const body = JSON.parse(data.toString() || "{}");
    request = Size.fromJSON(body);
  } catch (e) {
    const msg = "the json request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      Size,
      Hat
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.MakeHat(ctx, inputReq);
    });
  } else {
    response = await service.MakeHat(ctx, request);
  }

  return JSON.stringify(Hat.toJSON(response) as string);
}
async function handleMakeHatProtobuf(
  ctx: TwirpContext,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<Size, Hat>[]
) {
  let request: Size;
  let response: Hat;

  try {
    request = Size.decode(data);
  } catch (e) {
    const msg = "the protobuf request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      Size,
      Hat
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.MakeHat(ctx, inputReq);
    });
  } else {
    response = await service.MakeHat(ctx, request);
  }

  return Hat.encode(response).finish();
}
