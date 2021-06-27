import {
  TwirpContext,
  TwirpServer,
  RouterEvents,
  TwirpError,
  TwirpErrorCode,
  Interceptor,
  TwirpContentType,
  chainInterceptors,
} from "twirp-ts";
import { Size, Hat, FindHatRPC, ListHatRPC } from "./service";

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
  FindHat(request: FindHatRPC): Promise<FindHatRPC>;
  ListHat(request: ListHatRPC): Promise<ListHatRPC>;
}

export class HaberdasherClientJSON implements HaberdasherClient {
  private readonly rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
    this.MakeHat.bind(this);
    this.FindHat.bind(this);
    this.ListHat.bind(this);
  }
  MakeHat(request: Size): Promise<Hat> {
    const data = Size.toJson(request, { useProtoFieldName: true });
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

  FindHat(request: FindHatRPC): Promise<FindHatRPC> {
    const data = FindHatRPC.toJson(request, { useProtoFieldName: true });
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "FindHat",
      "application/json",
      data as object
    );
    return promise.then((data) =>
      FindHatRPC.fromJson(data as any, { ignoreUnknownFields: true })
    );
  }

  ListHat(request: ListHatRPC): Promise<ListHatRPC> {
    const data = ListHatRPC.toJson(request, { useProtoFieldName: true });
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "ListHat",
      "application/json",
      data as object
    );
    return promise.then((data) =>
      ListHatRPC.fromJson(data as any, { ignoreUnknownFields: true })
    );
  }
}

export class HaberdasherClientProtobuf implements HaberdasherClient {
  private readonly rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
    this.MakeHat.bind(this);
    this.FindHat.bind(this);
    this.ListHat.bind(this);
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

  FindHat(request: FindHatRPC): Promise<FindHatRPC> {
    const data = FindHatRPC.toBinary(request);
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "FindHat",
      "application/protobuf",
      data
    );
    return promise.then((data) => FindHatRPC.fromBinary(data as Uint8Array));
  }

  ListHat(request: ListHatRPC): Promise<ListHatRPC> {
    const data = ListHatRPC.toBinary(request);
    const promise = this.rpc.request(
      "twirp.example.haberdasher.Haberdasher",
      "ListHat",
      "application/protobuf",
      data
    );
    return promise.then((data) => ListHatRPC.fromBinary(data as Uint8Array));
  }
}

//==================================//
//          Server Code             //
//==================================//

export interface HaberdasherTwirp<T extends TwirpContext = TwirpContext> {
  MakeHat(ctx: T, request: Size): Promise<Hat>;
  FindHat(ctx: T, request: FindHatRPC): Promise<FindHatRPC>;
  ListHat(ctx: T, request: ListHatRPC): Promise<ListHatRPC>;
}

export enum HaberdasherMethod {
  MakeHat = "MakeHat",
  FindHat = "FindHat",
  ListHat = "ListHat",
}

export const HaberdasherMethodList = [
  HaberdasherMethod.MakeHat,
  HaberdasherMethod.FindHat,
  HaberdasherMethod.ListHat,
];

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
    case "FindHat":
      return async (
        ctx: T,
        service: HaberdasherTwirp,
        data: Buffer,
        interceptors?: Interceptor<T, FindHatRPC, FindHatRPC>[]
      ) => {
        ctx = { ...ctx, methodName: "FindHat" };
        await events.onMatch(ctx);
        return handleFindHatRequest(ctx, service, data, interceptors);
      };
    case "ListHat":
      return async (
        ctx: T,
        service: HaberdasherTwirp,
        data: Buffer,
        interceptors?: Interceptor<T, ListHatRPC, ListHatRPC>[]
      ) => {
        ctx = { ...ctx, methodName: "ListHat" };
        await events.onMatch(ctx);
        return handleListHatRequest(ctx, service, data, interceptors);
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

function handleFindHatRequest<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, FindHatRPC, FindHatRPC>[]
): Promise<string | Uint8Array> {
  switch (ctx.contentType) {
    case TwirpContentType.JSON:
      return handleFindHatJSON<T>(ctx, service, data, interceptors);
    case TwirpContentType.Protobuf:
      return handleFindHatProtobuf<T>(ctx, service, data, interceptors);
    default:
      const msg = "unexpected Content-Type";
      throw new TwirpError(TwirpErrorCode.BadRoute, msg);
  }
}

function handleListHatRequest<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, ListHatRPC, ListHatRPC>[]
): Promise<string | Uint8Array> {
  switch (ctx.contentType) {
    case TwirpContentType.JSON:
      return handleListHatJSON<T>(ctx, service, data, interceptors);
    case TwirpContentType.Protobuf:
      return handleListHatProtobuf<T>(ctx, service, data, interceptors);
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

  return JSON.stringify(
    Hat.toJson(response, { useProtoFieldName: true }) as string
  );
}

async function handleFindHatJSON<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, FindHatRPC, FindHatRPC>[]
) {
  let request: FindHatRPC;
  let response: FindHatRPC;

  try {
    const body = JSON.parse(data.toString() || "{}");
    request = FindHatRPC.fromJson(body, { ignoreUnknownFields: true });
  } catch (e) {
    const msg = "the json request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      FindHatRPC,
      FindHatRPC
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.FindHat(ctx, inputReq);
    });
  } else {
    response = await service.FindHat(ctx, request);
  }

  return JSON.stringify(
    FindHatRPC.toJson(response, { useProtoFieldName: true }) as string
  );
}

async function handleListHatJSON<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, ListHatRPC, ListHatRPC>[]
) {
  let request: ListHatRPC;
  let response: ListHatRPC;

  try {
    const body = JSON.parse(data.toString() || "{}");
    request = ListHatRPC.fromJson(body, { ignoreUnknownFields: true });
  } catch (e) {
    const msg = "the json request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      ListHatRPC,
      ListHatRPC
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.ListHat(ctx, inputReq);
    });
  } else {
    response = await service.ListHat(ctx, request);
  }

  return JSON.stringify(
    ListHatRPC.toJson(response, { useProtoFieldName: true }) as string
  );
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

async function handleFindHatProtobuf<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, FindHatRPC, FindHatRPC>[]
) {
  let request: FindHatRPC;
  let response: FindHatRPC;

  try {
    request = FindHatRPC.fromBinary(data);
  } catch (e) {
    const msg = "the protobuf request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      FindHatRPC,
      FindHatRPC
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.FindHat(ctx, inputReq);
    });
  } else {
    response = await service.FindHat(ctx, request);
  }

  return Buffer.from(FindHatRPC.toBinary(response));
}

async function handleListHatProtobuf<T extends TwirpContext = TwirpContext>(
  ctx: T,
  service: HaberdasherTwirp,
  data: Buffer,
  interceptors?: Interceptor<T, ListHatRPC, ListHatRPC>[]
) {
  let request: ListHatRPC;
  let response: ListHatRPC;

  try {
    request = ListHatRPC.fromBinary(data);
  } catch (e) {
    const msg = "the protobuf request could not be decoded";
    throw new TwirpError(TwirpErrorCode.Malformed, msg).withCause(e, true);
  }

  if (interceptors && interceptors.length > 0) {
    const interceptor = chainInterceptors(...interceptors) as Interceptor<
      T,
      ListHatRPC,
      ListHatRPC
    >;
    response = await interceptor(ctx, request, (ctx, inputReq) => {
      return service.ListHat(ctx, inputReq);
    });
  } else {
    response = await service.ListHat(ctx, request);
  }

  return Buffer.from(ListHatRPC.toBinary(response));
}
