import { Gateway, Pattern } from "twirp-ts";
import { match } from "path-to-regexp";

export function createGateway() {
  return new Gateway({
    post: [
      {
        packageName: "twirp.example.haberdasher",
        methodName: "MakeHat",
        serviceName: "Haberdasher",
        httpMethod: "post" as Pattern,
        matchingPath: "/hat{:query_string(\\?.*)}?",
        matcher: match("/hat{:query_string(\\?.*)}?"),
        bodyKey: "*",
        responseBodyKey: "",
      },
    ],
    get: [],
    put: [],
    patch: [],
    delete: [],
  });
}
