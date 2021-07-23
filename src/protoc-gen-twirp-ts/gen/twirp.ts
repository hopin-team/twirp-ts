import {DescriptorRegistry, FileDescriptorProto, ServiceDescriptorProto, SymbolTable} from "@protobuf-ts/plugin-framework";
import {code, imp, joinCode} from "ts-poet";
import { createLocalTypeName } from "../local-type-name";
import path from "path";

const TwirpServer = imp("TwirpServer@twirp-ts");
const Interceptor = imp("Interceptor@twirp-ts");
const RouterEvents = imp("RouterEvents@twirp-ts");
const chainInterceptors = imp("chainInterceptors@twirp-ts");
const TwirpContentType = imp("TwirpContentType@twirp-ts");
const TwirpContext = imp("TwirpContext@twirp-ts");
const TwirpError = imp("TwirpError@twirp-ts");
const TwirpErrorCode = imp("TwirpErrorCode@twirp-ts");

/**
 * Generates the client and server implementation of the twirp
 * specification.
 * @param ctx
 * @param file
 */
export async function generateTwirp(ctx: any, file: FileDescriptorProto) {
    const contents = file.service.map((service) => {
      return joinCode([
        genClient(ctx, file, service),
        genServer(ctx, file, service),
      ], { on: "\n\n" })
    });

    return joinCode(contents, { on: "\n\n"}).toStringWithImports();
}

/**
 * Generates the client implementation of the twirp specification.
 * @param ctx
 * @param file
 */
export async function generateTwirpClient(ctx: any, file: FileDescriptorProto) {
    const contents = file.service.map((service) => {
        return joinCode([genClient(ctx, file, service)], { on: "\n\n" })
    });

    return joinCode(contents, { on: "\n\n"}).toStringWithImports();
}

/**
 * Generates the server implementation of the twirp specification.
 * @param ctx
 * @param file
 */
export async function generateTwirpServer(ctx: any, file: FileDescriptorProto) {
    const contents = file.service.map((service) => {
        return joinCode([genServer(ctx, file, service)], { on: "\n\n" })
    });

    return joinCode(contents, { on: "\n\n"}).toStringWithImports();
}

function genClient(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    return code`
        //==================================//
        //          Client Code             //
        //==================================//

        interface Rpc {
          request(
            service: string,
            method: string,
            contentType: "application/json" | "application/protobuf",
            data: object | Uint8Array,
          ): Promise<object | Uint8Array>;
        }

        ${genTwirpClientInterface(ctx, file, service)}

        ${genTwripClientJSONImpl(ctx, file, service)}
        ${genTwripClientProtobufImpl(ctx, file, service)}
    `
}

function genTwirpClientInterface(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const methods = service.method.map((method) => {
        return code`
            ${method.name}(request: ${relativeMessageName(ctx, file, method.inputType)}): Promise<${relativeMessageName(ctx, file, method.outputType)}>
        `
    });

    return code`
        export interface ${service.name}Client {
            ${joinCode(methods, { on: "\n"})}
        }
    `
}

/**
 * Generates the json client
 * @param ctx
 * @param file
 * @param service
 */
function genTwripClientJSONImpl(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const methods = service.method.map((method) => {
        return code`
            ${method.name}(request: ${relativeMessageName(ctx, file, method.inputType)}): Promise<${relativeMessageName(ctx, file, method.outputType)}> {
                const data = ${relativeMessageName(ctx, file, method.inputType)}.${encodeJSON(ctx,"request")};
                const promise = this.rpc.request(
                  "${file.package}.${service.name}",
                  "${method.name}",
                  "application/json",
                  data as object,
                );
                return promise.then((data) => ${relativeMessageName(ctx, file, method.outputType)}.${decodeJSON(ctx,"data as any")});
            }
        `
    });

    const bindings = service.method.map((method) => {
        return code`
            this.${method.name}.bind(this);
        `
    })

    return code`
        export class ${service.name}ClientJSON implements ${service.name}Client {
          private readonly rpc: Rpc;
          constructor(rpc: Rpc) {
            this.rpc = rpc;
            ${joinCode(bindings, {on: `\n`})}
          }
          ${joinCode(methods, {on: `\n\n`})}
        }
    `
}

/**
 * Generate the protobuf client
 * @param ctx
 * @param file
 * @param service
 */
function genTwripClientProtobufImpl(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const methods = service.method.map((method) => {
        return code`
            ${method.name}(request: ${relativeMessageName(ctx, file, method.inputType)}): Promise<${relativeMessageName(ctx, file, method.outputType)}> {
                const data = ${relativeMessageName(ctx, file, method.inputType)}.${encodeProtobuf(ctx, "request")};
                const promise = this.rpc.request(
                  "${file.package}.${service.name}",
                  "${method.name}",
                  "application/protobuf",
                  data,
                );
                return promise.then((data) => ${relativeMessageName(ctx, file, method.outputType)}.${decodeProtobuf(ctx, "data as Uint8Array")});
            }
        `
    });

    const bindings = service.method.map((method) => {
        return code`
            this.${method.name}.bind(this);
        `
    })

    return code`
        export class ${service.name}ClientProtobuf implements ${service.name}Client {
          private readonly rpc: Rpc;
          constructor(rpc: Rpc) {
            this.rpc = rpc;
            ${joinCode(bindings, {on: `\n`})}
          }
          ${joinCode(methods, {on: `\n\n`})}
        }
    `
}

/**
 * Generates twirp service definition
 * @param ctx
 * @param file
 * @param service
 */
function genTwirpService(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const importService = service.name;

    const serverMethods = service.method.map((method) => {
        return code`
            ${method.name}(ctx: T, request: ${relativeMessageName(ctx, file, method.inputType)}): Promise<${relativeMessageName(ctx, file, method.outputType)}>
        `
    })

    const methodEnum = service.method.map((method) => {
        return code`${method.name} = "${method.name}",`
    })

    const methodList = service.method.map((method) => {
        return code`${importService}Method.${method.name}`
    })

    return code`
        export interface ${importService}Twirp<T extends ${TwirpContext} = ${TwirpContext}> {
            ${joinCode(serverMethods, {on: `\n`})}
        }

        export enum ${importService}Method {
            ${joinCode(methodEnum, {on: "\n"})}
        }

        export const ${importService}MethodList = [${joinCode(methodList, {on: ","})}];
    `
}

/**
 * Generates the twirp server specification
 * @param ctx
 * @param file
 * @param service
 */
function genServer(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const importService = service.name;

    return code`

        //==================================//
        //          Server Code             //
        //==================================//

        ${genTwirpService(ctx, file, service)}

        export function create${importService}Server<T extends ${TwirpContext} = ${TwirpContext}>(service: ${importService}Twirp<T>) {
            return new ${TwirpServer}<${importService}Twirp, T>({
                service,
                packageName: "${file.package}",
                serviceName: "${importService}",
                methodList: ${importService}MethodList,
                matchRoute: match${importService}Route,
            })
        }
        ${genRouteHandler(ctx, file, service)}
        ${joinCode(genHandleRequestMethod(ctx, file, service), {on: "\n\n"})}
        ${joinCode(genHandleJSONRequest(ctx, file, service), {on: "\n\n"})}
        ${joinCode(genHandleProtobufRequest(ctx, file, service), {on: "\n\n"})}
`
}

/**
 * Generate the route handler
 * @param ctx
 * @param file
 * @param service
 */
function genRouteHandler(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const cases = service.method.map(method => code`
    case "${method.name}":
        return async (ctx: T, service: ${service.name}Twirp ,data: Buffer, interceptors?: ${Interceptor}<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>[]) => {
            ctx = {...ctx, methodName: "${method.name}" }
            await events.onMatch(ctx);
            return handle${method.name}Request(ctx, service, data, interceptors)
        }
    `)

    return code`
    function match${service.name}Route<T extends ${TwirpContext} = ${TwirpContext}>(method: string, events: ${RouterEvents}<T>) {
        switch(method) {
        ${joinCode(cases, { on: `\n`})}
        default:
            events.onNotFound();
            const msg = \`no handler found\`;
            throw new ${TwirpError}(${TwirpErrorCode}.BadRoute, msg)
        }
    }
    `
}

/**
 * Generate request handler for methods
 * @param ctx
 * @param file
 * @param service
 */
function genHandleRequestMethod(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`
        function handle${method.name}Request<T extends ${TwirpContext} = ${TwirpContext}>(ctx: T, service: ${service.name}Twirp ,data: Buffer, interceptors?: ${Interceptor}<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>[]): Promise<string | Uint8Array> {
            switch (ctx.contentType) {
                case ${TwirpContentType}.JSON:
                    return handle${method.name}JSON<T>(ctx, service, data, interceptors);
                case ${TwirpContentType}.Protobuf:
                    return handle${method.name}Protobuf<T>(ctx, service, data, interceptors);
                default:
                    const msg = "unexpected Content-Type";
                    throw new ${TwirpError}(${TwirpErrorCode}.BadRoute, msg);
            }
        }
    `
    })
}

/**
 * Generate a JSON request handler for a method
 * @param ctx
 * @param file
 * @param service
 */
function genHandleJSONRequest(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`

        async function handle${method.name}JSON<T extends ${TwirpContext} = ${TwirpContext}>(ctx: T, service: ${service.name}Twirp, data: Buffer, interceptors?: ${Interceptor}<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>[]) {
            let request: ${relativeMessageName(ctx, file, method.inputType)}
            let response: ${relativeMessageName(ctx, file, method.outputType)}

            try {
                const body = JSON.parse(data.toString() || "{}");
                request = ${relativeMessageName(ctx, file, method.inputType)}.${decodeJSON(ctx, "body")};
            } catch(e) {
                const msg = "the json request could not be decoded";
                throw new ${TwirpError}(${TwirpErrorCode}.Malformed, msg).withCause(e, true);
            }

            if (interceptors && interceptors.length > 0) {
                const interceptor = ${chainInterceptors}(...interceptors) as Interceptor<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>
                response = await interceptor(ctx, request, (ctx, inputReq) => {
                    return service.${method.name}(ctx, inputReq);
                });
            } else {
                response = await service.${method.name}(ctx, request)
            }

            return JSON.stringify(${relativeMessageName(ctx, file, method.outputType)}.${encodeJSON(ctx,"response")} as string);
        }
    `
    })
}

/**
 * Generates a protobuf request handler
 * @param ctx
 * @param file
 * @param service
 */
function genHandleProtobufRequest(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`

        async function handle${method.name}Protobuf<T extends ${TwirpContext} = ${TwirpContext}>(ctx: T, service: ${service.name}Twirp, data: Buffer, interceptors?: ${Interceptor}<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>[]) {
            let request: ${relativeMessageName(ctx, file, method.inputType)}
            let response: ${relativeMessageName(ctx, file, method.outputType)}

            try {
                request = ${relativeMessageName(ctx, file, method.inputType)}.${decodeProtobuf(ctx, "data")};
            } catch(e) {
                const msg = "the protobuf request could not be decoded";
                throw new ${TwirpError}(${TwirpErrorCode}.Malformed, msg).withCause(e, true);
            }

            if (interceptors && interceptors.length > 0) {
                const interceptor = ${chainInterceptors}(...interceptors) as Interceptor<T, ${relativeMessageName(ctx, file, method.inputType)}, ${relativeMessageName(ctx, file, method.outputType)}>
                response = await interceptor(ctx, request, (ctx, inputReq) => {
                    return service.${method.name}(ctx, inputReq);
                });
            } else {
                response = await service.${method.name}(ctx, request)
            }

            return Buffer.from(${relativeMessageName(ctx, file, method.outputType)}.${encodeProtobuf(ctx, "response")});
        }
    `
    })
}

enum SupportedLibs {
    TSProto = "ts-proto",
    ProtobufTS = "protobuf-ts"
}

function validateLib(lib: string): SupportedLibs {
    switch (lib) {
        case "ts-proto":
            return SupportedLibs.TSProto;
        case "protobuf-ts":
            return SupportedLibs.ProtobufTS;
        default:
            throw new Error(`library ${lib} not supported`)
    }
}

function decodeJSON(ctx: any, dataName: string) {
    const protoLib = validateLib(ctx.lib);

    if (protoLib === SupportedLibs.TSProto) {
        return code`fromJSON(${dataName})`
    }

    return code`fromJson(${dataName}, { ignoreUnknownFields: true })`
}

function encodeJSON(ctx: any, dataName: string) {
    const protoLib = validateLib(ctx.lib);

    if (protoLib === SupportedLibs.TSProto) {
        return code`toJSON(${dataName})`
    }

    return code`toJson(${dataName}, {useProtoFieldName: true, emitDefaultValues: ${ctx.emitDefaultValues ? 'true' : 'false'}})`
}

function encodeProtobuf(ctx: any, dataName: string) {
    const protoLib = validateLib(ctx.lib);

    if (protoLib === SupportedLibs.TSProto) {
        return code`encode(${dataName}).finish()`
    }

    return code`toBinary(${dataName})`
}

function decodeProtobuf(ctx: any, dataName: string) {
    const protoLib = validateLib(ctx.lib);

    if (protoLib === SupportedLibs.TSProto) {
        return code`decode(${dataName})`
    }

    return code`fromBinary(${dataName})`
}

function relativeMessageName(ctx: any, file: FileDescriptorProto, messageName?: string) {
    const registry = ctx.registry as DescriptorRegistry;
    const symbols = ctx.symbols as SymbolTable;

    const entry = symbols.find(registry.resolveTypeName(messageName!));

    if (!entry) {
        throw new Error(`Message ${messageName} not found`);
    }

    const messageType = createLocalTypeName(entry.descriptor, registry);
    const relativePath = createRelativeImportPath(file.name!, entry.file.getFilename())

    return code`${imp(`${messageType}@${relativePath}`)}`;
}

/**
 * Create a relative path for an import statement like
 * `import {Foo} from "./foo"`
 */
function createRelativeImportPath(currentPath: string, pathToImportFrom: string): string {
    // create relative path to the file to import
    let fromPath = path.relative(path.dirname(currentPath), pathToImportFrom);

    // on windows, this may add backslash directory separators.
    // we replace them with forward slash.
    if (path.sep !== "/") {
        fromPath = fromPath.split(path.sep).join("/");
    }

    // drop file extension
    fromPath = fromPath.replace(/\.[a-z]+$/, '');

    // make sure to start with './' to signal relative path to module resolution
    if (!fromPath.startsWith('../') && !fromPath.startsWith('./')) {
        fromPath = './' + fromPath;
    }
    return fromPath;
}
