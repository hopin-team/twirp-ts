import * as http from 'http';
import * as https from 'https';
import {URL} from "url";
import {TwirpError} from "./errors";

export interface Rpc {
    request(
        service: string,
        method: string,
        contentType: "application/json" | "application/protobuf",
        data: object | Uint8Array
    ): Promise<object | Uint8Array>;
}

export type HttpClientOptions = Omit<(http.RequestOptions | https.RequestOptions), "path" | "host" | "port"> & {
    prefix?: string
    baseUrl: string
}

/**
 * a node HTTP RPC implementation
 * @param options
 * @constructor
 */
export const NodeHttpRPC: (options: HttpClientOptions) => Rpc = (options) => ({
    request(service, method, contentType, data) {
        let client: typeof http | typeof https;

        return new Promise((resolve, rejected) => {
            const responseChunks: Buffer[] = [];

            const requestData = contentType === "application/protobuf" ? Buffer.from(data as Uint8Array) : JSON.stringify(data);
            const url = new URL(options.baseUrl);
            const isHttps = url.protocol === "https";

            if (isHttps) {
                client = https;
            } else {
                client = http;
            }

            const prefix = url.pathname ? url.pathname : ""

            const req = client.request({
                ...(options ? options : {}),
                method: "POST",
                protocol: url.protocol,
                host: url.hostname,
                port: url.port ? url.port : isHttps ? 443 : 8000,
                path: `${prefix}/${service}/${method}`,
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': contentType === "application/protobuf" ? Buffer.byteLength(requestData as Uint8Array) : Buffer.from(requestData as string).byteLength,
                },
            }, res => {
                res.on('data', chunk => responseChunks.push(chunk));
                res.on('end', () => {
                    const data = Buffer.concat(responseChunks);
                    if (res.statusCode != 200) {
                        rejected(warpErrorResponseToTwirpError(data.toString()));
                    } else {
                        if (contentType === "application/json") {
                            resolve(JSON.parse(data.toString()));
                        } else {
                            resolve(data);
                        }
                    }
                });
                res.on('error', err => {
                    rejected(err);
                });
            })
            .on('error', err => {
                rejected(err);
            });

            req.end(requestData);
        })
    }
});


export function warpErrorResponseToTwirpError(errorResponse: string) {
    return TwirpError.fromObject(JSON.parse(errorResponse));
}