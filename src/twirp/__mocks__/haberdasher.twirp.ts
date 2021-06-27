import {
  TwirpContext,
  TwirpServer,
  RouterEvents,
  TwirpError,
  TwirpErrorCode,
  Interceptor,
  TwirpContentType,
  chainInterceptors,
} from "../index";
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
    const data = Size.toJson(request);
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "MakeHat",
      "application/json",
      data as object
    );
    return promise.then((data) =>
      Hat.fromJson(data as any, { ignoreUnknownFields: true })
    );
  }
}

export class HaberdasherClientProtobuf implements HaberdasherClient {
  private readonly rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
    this.MakeHat.bind(this);
  }
  MakeHat(request: Size): Promise<Hat> {
    const data = Size.toBinary(request);
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "MakeHat",
      "application/protobuf",
      data
    );
    return promise.then((data) => Hat.fromBinary(data as Uint8Array));
  }
}

//==================================//
//          Server Code             //
//==================================//

export interface HaberdasherTwirp<T extends TwirpContext = TwirpContext> {
  MakeHat(ctx: T, request: Size): Promise<Hat>;
}

export enum HaberdasherMethod {
  MakeHat = "MakeHat",
}

export const HaberdasherMethodList = [HaberdasherMethod.MakeHat];

export function createHaberdasherServer<T extends TwirpContext = TwirpContext>(
  service: HaberdasherTwirp<T>
) {
  return new TwirpServer<HaberdasherTwirp, T>({
    service,
    packageName: "twirp.example.haberdasher",
    serviceName: "Haberdasher",
    methodList: HaberdasherMethodList,
    matchRoute: matchHaberdasherRoute,
  });
}

function matchHaberdasherRoute<T extends TwirpContext = TwirpContext>(
  method: string,
  events: RouterEvents<T>
) {
  switch (method) {
    case "MakeHat":
      return async (
        ctx: T,
        service: HaberdasherTwirp,
        data: Buffer,
        interceptors?: Interceptor<T, Size, Hat>[]
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

function handleMakeHatRequest<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, Size, Hat>[]
): Promise<string | Uint8Array> {
  switch (ctx.contentType) {
    case TwirpContentType.JSON:
      return handleMakeHatJSON<T>(ctx, service, data, interceptors);
    case TwirpContentType.Protobuf:
      return handleMakeHatProtobuf<T>(ctx, service, data, interceptors);
    default:
      const msg = "unexpected Content-Type";
      throw new TwirpError(TwirpErrorCode.BadRoute, msg);
  }
}
async function handleMakeHatJSON<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, Size, Hat>[]
) {
  let request: Size;
  let response: Hat;

  try {
    const body = JSON.parse(data.toString() || "{}");
    request = Size.fromJson(body, { ignoreUnknownFields: true });
  } catch (e) {
    const msg = "the json request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      Size,
      Hat
      >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.MakeHat(ctx, inputReq);
    });
  } else {
    response = await service.MakeHat(ctx, request);
  }

  return JSON.stringify(Hat.toJson(response) as string);
}
async function handleMakeHatProtobuf<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, Size, Hat>[]
) {
  let request: Size;
  let response: Hat;

  try {
    request = Size.fromBinary(data);
  } catch (e) {
    const msg = "the protobuf request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      Size,
      Hat
      >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.MakeHat(ctx, inputReq);
    });
  } else {
    response = await service.MakeHat(ctx, request);
  }

  return Buffer.from(Hat.toBinary(response));
}
