import { FileDescriptorProto } from "@protobuf-ts/plugin-framework";
import {writeFileSync} from  "fs"
import { code, imp, joinCode } from "ts-poet";
import { match, MatchFunction } from "path-to-regexp";

const Gateway = imp("Gateway@twirp-ts");
const GatewayPattern = imp("Pattern@twirp-ts");
const pathToRegexpMatch = imp("match@path-to-regexp");

const debug = (content: any) => writeFileSync(__dirname + "/debug.json", JSON.stringify(content, null, 2),"utf-8")

enum Pattern {
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

export type HttpRulePattern = {
  [key in Pattern]: string
}

interface HttpOption extends HttpRulePattern {
  body: string;
  responseBody: string
  additional_bindings: HttpOption
}

export async function genGateway(ctx: any, files: readonly FileDescriptorProto[]) {
  const httpRoutes = files.reduce((all, current) => {
    current.service.forEach(service => {
      service.method.forEach((method) => {
        const options = ctx.interpreter.readOptions(method);

        if (options && options["google.api.http"]) {
          const httpSpec = options["google.api.http"] as HttpOption;

          all.push(parseHttpOption(
            httpSpec,
            current.package || "",
            method.name!,
            service.name!,
          ));

          if (httpSpec.additional_bindings) {
            all.push(parseHttpOption(
              httpSpec.additional_bindings,
              current.package || "",
              method.name!,
              service.name!,
            ));
          }
        }
      })
    })

    return all
  }, [] as HttpRoute[]);

  return genGatewayHandler(httpRoutes).toStringWithImports();
}

function genGatewayHandler(httpRoute: HttpRoute[]) {

  const genRoutes = (method: Pattern) => httpRoute.filter(route => route.httpMethod === method).map(route => {
    return code`
      {
        packageName: "${route.packageName}",
        methodName: "${route.methodName}",
        serviceName: "${route.serviceName}",
        httpMethod: "${route.httpMethod}" as ${GatewayPattern},
        matchingPath: "${route.matchingPath}{:query_string(\\\\?.*)}?",
        matcher: ${pathToRegexpMatch}("${route.matchingPath}{:query_string(\\\\?.*)}?"),
        bodyKey: "${route.bodyKey || ""}",
        responseBodyKey: "${route.responseBodyKey || ""}",
      },
    `
  })

  return code`
  export function createGateway() {
    return new ${Gateway}({
      post: [${joinCode(genRoutes(Pattern.POST), {on: "\n"})}],
      get: [${joinCode(genRoutes(Pattern.GET), {on: "\n"})}],
      put: [${joinCode(genRoutes(Pattern.PUT), {on: "\n"})}],
      patch: [${joinCode(genRoutes(Pattern.PATCH), {on: "\n"})}],
      delete: [${joinCode(genRoutes(Pattern.DELETE), {on: "\n"})}],
    })
  }
  `
}

function parseHttpOption(httpOption: HttpOption, packageName: string, methodName: string, serviceName: string) {
  const httpMethod = getMethod(httpOption);
  const matchingUrl = httpOption[httpMethod];
  const matchingPath = matcher(matchingUrl);

  const httpRoute: HttpRoute = {
    packageName,
    methodName,
    serviceName,
    httpMethod: httpMethod,
    matchingPath,
    matcher: match(matchingPath),
    bodyKey: httpOption.body,
    responseBodyKey: httpOption.responseBody,
  };

  return httpRoute;
}

function matcher(url: string) {
  return url.split("/").map((urlSegment) => {
    const matchURLParams = /{([0-9a-zA-Z_-]+)}/.exec(urlSegment);

    if (matchURLParams && matchURLParams.length > 0) {
      const paramName = matchURLParams[1] as string;
      return "{:" + paramName + "}";
    } else {
      return urlSegment
    }
  }).join("/");
}

function getMethod(httpSpec: HttpOption) {
  const possibleMethods = ["post", "get", "patch", "put", "delete"] as Pattern[];

  for (const method of possibleMethods) {
    if (method in httpSpec) {
      return method;
    }
  }

  throw new Error(`HTTP method not found`)
}