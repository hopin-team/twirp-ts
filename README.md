# Twirp-TS

A complete server and client implementation of the awesome [Twirp Specification](https://twitchtv.github.io/twirp/docs/spec_v7.html) witten in typescript. 

Supported spec v7 and v8

----
Table of Contents:

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Install Protoc](#install-protoc)
- [Code Generation](#code-generation)
- [Server](#server)
  - [Express](#integrating-with-express) 
  - [Hooks & Interceptors](#server-hooks--interceptors)
  - [Errors](#errors)
- [Client](#twirp-client)
- [How to Upgrade](#how-to-upgrade)

## Getting Started

---

### Installation
Run the following to install the package

```
npm i twirp-ts -S
```

or

```
yarn add twirp-ts
```

### Install Protoc
Make sure you have `protoc` or `buf` installed.

**Mac:**
```bash
brew install protobuf
```

**Linux:**
```bash
apt-get install protobuf
```

**Optional**: <br />
This plugin works with [buf](https://docs.buf.build/installation) too, follow the link to see how to install it

## Code Generation

**twirp-ts** relies on the awesome [ts-proto](https://github.com/stephenh/ts-proto) to generate protobuf message definitions

The `protoc-gen-twirp_ts` is instead used to generate `server` and `client` code for twirp-ts

It is as simple as adding the following options in your `protoc` command

```bash
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"

--plugin=protoc-gen-twirp_ts=${PROTOC_GEN_TWIRP_BIN} \
--twirp_ts_out=$(OUT_DIR)
```

Here's an example working command:

```bash
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"
PROTOC_GEN_TS_BIN="./node_modules/.bin/protoc-gen-ts_proto"

OUT_DIR="./generated"

protoc \
    -I ./protos \
    --plugin=protoc-gen-ts_proto=${PROTOC_GEN_TS_BIN} \
    --plugin=protoc-gen-twirp_ts=${PROTOC_GEN_TWIRP_BIN} \
    --ts_proto_opt=esModuleInterop=true \
    --ts_proto_opt=outputClientImpl=false \
    --ts_proto_out=${OUT_DIR} \
    --twirp_ts_out=${OUT_DIR} \
    ./protos/*.proto
```

### Server

Once you've generated the server code you can simply start a server as following:

```ts
import * as http from "http";
import {TwirpContext} from "twirp-ts";
import {createHaberdasherServer} from "./generated/haberdasher.twirp";
import {Hat, Size} from "./generated/service";

const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // Your implementation
    },
});

http.createServer(server.httpHandler())
    .listen(8080);
```

#### Path prefix

By default the server uses the `/twirp` prefix for every request.
You can change or remove the prefix passing the `prefix` option to the handler

```ts
const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // Your implementation
    },
});

server.withPrefix("/custom-prefix") // or false to remove it

http.createServer(server.httpHandler())
  .listen(8080);
```

or you can pass it to the handler directly:

```ts
http.createServer(server.httpHandler({
    prefix: "/custom-prefix", 
})).listen(8080);
```

### Integrating with express

If you'd like to use `express` as your drop in solution to add more routes, or middlewares you can do as following:

```ts
const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // ... implementation
    },
});

const app = express();

app.post(server.matchingPath(), server.httpHandler());

app.listen(8000);
```

Note: if you want to change the default prefix use `server.withPrefix()`

### Server Hooks & Interceptors

[Link to Spec](https://twitchtv.github.io/twirp/docs/hooks.html)

**Interceptors** are a form of middleware for Twirp requests. Interceptors can mutate the request and responses, which can enable some powerful integrations, but in most cases, it is better to use Hooks for observability at key points during a request. Mutating the request adds complexity to the request lifecycle.

Be mindful to not hide too much behind interceptors as with every `middleware` alike implementation is easy to increase complexity making it harder to reason about.

Example: 

```ts
const server = createHaberdasherServer({
    // ...
});

async function exampleInterceptor(ctx: TwirpContext, req: any, next: Next) {
    console.log("Before response");

    const response = await next(ctx, req);

    console.log("After response");

    return response;
}

server.use(exampleInterceptor)
```
<br/>

**Server Hooks** They provide callbacks for before and after the request is handled. The Error hook is called only if an error was returned by the handler.

A great place for `metrics` and `logging` 

```ts
const server = createHaberdasherServer({
    // ...
});

const serverHooks: ServerHooks = {
    requestReceived: (ctx) => {
        console.log("Received");
    },
    requestRouted: (ctx) => {
        console.log("Requested");
    },
    requestPrepared: (ctx) => {
        console.log("Prepared");
    },
    requestSent: (ctx) => {
        console.log("Sent");
    },
    error: (ctx, err) => {
        console.log(err);
    }
};

server.use(serverHooks);
```

### Errors

[Link to Spec](https://twitchtv.github.io/twirp/docs/errors.html)

The library comes with a built in `TwirpError` which is the default and standard error for all of your errors.

You can certainly create custom errors that extend a `TwirpError`

For Example:

```ts
import {TwirpError, TwirpErrorCode} from "twirp-ts";

class UnauthenticatedError extends TwirpError {
    constructor(traceId: string) {
        super(TwirpErrorCode.Unauthenticated, "you must login");
        this.withMeta("trace-id", traceId)
    }
}
```

## Twirp Client

As well as the server you've also got generated client code, ready for you to use. <br />
You can choose between `JSON` client and `Protobuf` client.

The generated code doesn't include an actual library to make `http` requests, but it gives you an interface to implement the one that you like the most.

Alternatively you can use the provided implementation based on node `http` and `https` package.

For example:

```ts
const jsonClient = new HaberdasherClientJSON(NodeHttpRPC({
    baseUrl: "http://localhost:8000/twirp",
}));

const protobufClient = new HaberdasherClientProtobuf(NodeHttpRPC({
    baseUrl: "http://localhost:8000/twirp",
}));
```

You can check the [full example](https://github.com/hopin-team/twirp-ts/example/client.ts) on how to integrate the client with `axios`

Here is a snippet:

```ts
const client = axios.create({
    baseURL: "http://localhost:8080/twirp",
})

const implementation: Rpc = {
    request(service, method, contentType, data) {
        return client.post(`${service}/${method}`, data, {
            responseType: contentType === "application/protobuf" ? 'arraybuffer' : "json",
            headers: {
                "content-type": contentType,
            }
        }).then(response => {
            return response.data
        });
    }
}

export const jsonClient = new HaberdasherClientJSON(implementation);
export const protobufClient = new HaberdasherClientProtobuf(implementation);
```

## How to upgrade

The package uses Semver Versioning system. <br />
However, keep in mind that the **code-generation** plugin is tightly coupled to the **twirp-ts** library.

Make sure that whenever you update `twirp-ts` you re-generate the server and client code. This make sure that the generated code will be using the updated library

## Licence

MIT <3
