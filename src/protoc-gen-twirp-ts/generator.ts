import {CodeGeneratorResponse_File, FileDescriptorProto, ServiceDescriptorProto} from "ts-proto-descriptors";
import {code, imp, joinCode} from "ts-poet";

const TwirpServer = imp("TwirpServer@twirp-ts");
const Interceptor = imp("Interceptor@twirp-ts");
const RouterEvents = imp("RouterEvents@twirp-ts");
const chainInterceptors = imp("chainInterceptors@twirp-ts");
const getContentType = imp("getContentType@twirp-ts");
const TwirpContentType = imp("TwirpContentType@twirp-ts");
const TwirpContext = imp("TwirpContext@twirp-ts");
const TwirpError = imp("TwirpError@twirp-ts");
const TwirpErrorCode = imp("TwirpErrorCode@twirp-ts");

const {messageToTypeName} = require('ts-proto/build/types');

/**
 * Generates the server and client implementation
 * of the twirp specification
 * @param ctx
 * @param file
 */
export function generate(ctx: any, file: FileDescriptorProto) {
    const files = file.service.map(async (service) => {

        const content = await joinCode([
            genClient(ctx, file),
            genServer(ctx, file, service)
        ], { on: "\n\n" }).toStringWithImports();

        return CodeGeneratorResponse_File.fromPartial({
            name: `${service.name.toLowerCase()}.twirp.ts`,
            content: content,
        });
    });

    return Promise.all(files);
}

function genClient(ctx: any, file: FileDescriptorProto) {
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
        
        ${joinCode(genTwripClientJSONImpl(ctx, file), {on: "\n\n"})}
        ${joinCode(genTwripClientProtobufImpl(ctx, file), {on: "\n\n"})}
    `
}

/**
 * Generates the json client
 * @param ctx
 * @param file
 */
function genTwripClientJSONImpl(ctx: any, file: FileDescriptorProto) {
    return file.service.map(service => {
        const methods = service.method.map((method) => {
            return code`
                ${method.name}(request: ${messageToTypeName(ctx, method.inputType)}): Promise<${messageToTypeName(ctx,method.outputType)}> {
                    const data = ${messageToTypeName(ctx,method.inputType)}.toJSON(request);
                    const promise = this.rpc.request(
                      "${file.package}.${service.name}",
                      "${method.name}",
                      "application/json",
                      data as object,
                    );
                    return promise.then((data) => ${relativeMessageName(ctx, method.outputType)}.fromJSON(data));
                }
            `
        });

        const bindings = service.method.map((method) => {
            return code`
                this.${method.name}.bind(this);
            `
        })

        return code`
            export class ${service.name}ClientJSON implements ${service.name} {
              private readonly rpc: Rpc;
              constructor(rpc: Rpc) {
                this.rpc = rpc;
                ${joinCode(bindings, {on: `\n`})}
              }
              ${joinCode(methods, {on: `\n\n`})}
            }
        `
    })
}

/**
 * Generate the protobuf client
 * @param ctx
 * @param file
 */
function genTwripClientProtobufImpl(ctx: any, file: FileDescriptorProto) {
    return file.service.map(service => {
        const methods = service.method.map((method) => {
            return code`
                ${method.name}(request: ${messageToTypeName(ctx, method.inputType)}): Promise<${messageToTypeName(ctx,method.outputType)}> {
                    const data = ${messageToTypeName(ctx,method.inputType)}.encode(request).finish();
                    const promise = this.rpc.request(
                      "${file.package}.${service.name}",
                      "${method.name}",
                      "application/protobuf",
                      data,
                    );
                    return promise.then((data) => ${relativeMessageName(ctx, method.outputType)}.decode(data as Uint8Array));
                }
            `
        });

        const bindings = service.method.map((method) => {
            return code`
                this.${method.name}.bind(this);
            `
        })

        return code`
            export class ${service.name}ClientProtobuf implements ${service.name} {
              private readonly rpc: Rpc;
              constructor(rpc: Rpc) {
                this.rpc = rpc;
                ${joinCode(bindings, {on: `\n`})}
              }
              ${joinCode(methods, {on: `\n\n`})}
            }
        `
    })
}

/**
 * Generates twirp service definition
 * @param ctx
 * @param file
 */
function genTwirpService(ctx: any, file: FileDescriptorProto) {
    return file.service.map((service) => {
        const importService = imp(`${service.name}@./${file.name.replace(".proto", "")}`)

        const methods = service.method.map((method) => {
            return code`
                ${method.name}(ctx: ${TwirpContext}, request: ${messageToTypeName(ctx, method.inputType)}): Promise<${messageToTypeName(ctx, method.outputType)}>
            `
        })

        return code`
            export interface ${importService}Twirp {
                ${joinCode(methods, {on: `\n`})}
            }
        `
    });
}

/**
 * Generates the twirp server specification
 * @param ctx
 * @param file
 * @param service
 */
function genServer(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
    const importService = imp(`${service.name}@./${file.name.replace(".proto", "")}`)

    return code`

        //==================================//
        //          Server Code             //
        //==================================//
        
        ${genTwirpService(ctx, file)}
    
        export function create${importService}Server(service: ${importService}Twirp) {
            return new ${TwirpServer}<${importService}Twirp>({
                service,
                createContext: (req, res) => ({
                     packageName: "${file.package}",
                     serviceName: "${importService}",
                     methodName:  "",
                     contentType: ${getContentType}(req.headers["content-type"]),
                     req: req,
                     res: res,
                }),
                matchRoute: match${importService}Route,
            })
        }
        ${genRouteHandler(ctx, service)}
        ${joinCode(genHandleRequestMethod(ctx, service), {on: "\n\n"})}
        ${joinCode(genHandleJSONRequest(ctx, service), {on: "\n\n"})}
        ${joinCode(genHandleProtobufRequest(ctx, service), {on: "\n\n"})}
`
}

/**
 * Generate the route handler
 * @param ctx
 * @param service
 */
function genRouteHandler(ctx: any, service: ServiceDescriptorProto) {
    const cases = service.method.map(method => code`
    case "${method.name}":
        return async (ctx: ${TwirpContext}, service: ${service.name}Twirp ,data: Buffer, interceptors?: ${Interceptor}<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>[]) => {
            ctx = {...ctx, methodName: "${method.name}" }
            await events.onMatch(ctx);
            return handle${method.name}Request(ctx, service, data, interceptors)
        }
    `)

    return code`
    function match${service.name}Route(method: string, events: ${RouterEvents}) {
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
 * @param service
 */
function genHandleRequestMethod(ctx: any, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`
        function handle${method.name}Request(ctx: ${TwirpContext}, service: ${service.name}Twirp ,data: Buffer, interceptors?: ${Interceptor}<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>[]): Promise<string | Uint8Array> {
            switch (ctx.contentType) {
                case ${TwirpContentType}.JSON:
                    return handle${method.name}JSON(ctx, service, data, interceptors);
                case ${TwirpContentType}.Protobuf:
                    return handle${method.name}Protobuf(ctx, service, data, interceptors);
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
 * @param service
 */
function genHandleJSONRequest(ctx: any, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`
        
        async function handle${method.name}JSON(ctx: ${TwirpContext}, service: ${service.name}Twirp, data: Buffer, interceptors?: ${Interceptor}<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>[]) {
            
            try {
                const body = JSON.parse(data.toString() || "{}");
                const typedReq = ${relativeMessageName(ctx, method.inputType)}.fromJSON(body);
                let response: ${relativeMessageName(ctx,method.outputType)}
                
                if (interceptors && interceptors.length > 0) {
                    const interceptor = ${chainInterceptors}(...interceptors) as Interceptor<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>
                    response = await interceptor(ctx, typedReq, (ctx, inputReq) => {
                        return service.${method.name}(ctx, inputReq);
                    });
                } else {
                    response = await service.${method.name}(ctx, typedReq)
                }
                
                return JSON.stringify(${relativeMessageName(ctx,method.outputType)}.toJSON(response) as string);
            } catch(e) {
                if (e instanceof SyntaxError) { // Handle wrong json format
                    const msg = "the json request could not be decoded";
                    throw new ${TwirpError}(${TwirpErrorCode}.Malformed, msg).withCause(e);
                }
                
                throw e;
            }
        }
    `
    })
}

/**
 * Generates a protobuf request handler
 * @param ctx
 * @param service
 */
function genHandleProtobufRequest(ctx: any, service: ServiceDescriptorProto) {
    return service.method.map(method => {
        return code`
        
        async function handle${method.name}Protobuf(ctx: ${TwirpContext}, service: ${service.name}Twirp, data: Buffer, interceptors?: ${Interceptor}<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>[]) {
            
            try {
                const typedReq = ${relativeMessageName(ctx, method.inputType)}.decode(data);
                let response: ${relativeMessageName(ctx,method.outputType)}
                
                if (interceptors && interceptors.length > 0) {
                    const interceptor = ${chainInterceptors}(...interceptors) as Interceptor<${relativeMessageName(ctx,method.inputType)}, ${relativeMessageName(ctx,method.outputType)}>
                    response = await interceptor(ctx, typedReq, (ctx, inputReq) => {
                        return service.${method.name}(ctx, inputReq);
                    });
                } else {
                    response = await service.${method.name}(ctx, typedReq)
                }
                
                return ${relativeMessageName(ctx,method.outputType)}.encode(response).finish();
            } catch(e) {
                if (e instanceof SyntaxError) { // Handle wrong json format
                    const msg = "the protobuf request could not be decoded";
                    throw new ${TwirpError}(${TwirpErrorCode}.Malformed, msg).withCause(e);
                }
                
                throw e;
            }
        }
    `
    })
}

function relativeMessageName(ctx: any, messageName: string): string {
    return messageToTypeName(ctx, messageName);
}