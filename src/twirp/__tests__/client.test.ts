import * as http from "http";
import {createHttpTerminator, HttpTerminator} from "http-terminator";
import {
    createHaberdasherServer,
    HaberdasherClientJSON,
    HaberdasherClientProtobuf
} from "../__mocks__/service.twirp";
import {TwirpContext} from "../context";
import { FindHatRPC, Hat, ListHatRPC, Size } from "../__mocks__/service";
import {NodeHttpRPC} from "../http.client";
import {InternalServerError, TwirpError, TwirpErrorCode} from "../errors";

describe("Twirp Clients", () => {

    let httpTerminator: HttpTerminator;
    let server: http.Server;
    beforeEach(() => {
        const twirpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                return Hat.create({
                    id: "1",
                    name: "cap",
                    color: "blue",
                    inches: 100,
                    variants: [],
                })
            },
            async FindHat(ctx, request): Promise<FindHatRPC> {
                return request;
            },
            async ListHat(ctx, request): Promise<ListHatRPC> {
                return request;
            }
        });

        server = http.createServer(twirpServer.httpHandler());
        httpTerminator = createHttpTerminator({
            server,
        });
    })

    it("can call methods using the JSON client", (done) => {
        const port = 9999;

        server.listen(port, async () => {
            const client = new HaberdasherClientJSON(NodeHttpRPC({
                baseUrl: "http://localhost:9999/twirp",
            }));

            const hat = await client.MakeHat({
                inches: 1,
            });

            expect(hat).toEqual({
                id: "1",
                color: "blue",
                inches: 100,
                name: "cap",
                variants: [],
            });

            await httpTerminator.terminate();
            done();
        })
    });

    it("can call methods using the Protobuf client", (done) => {
        const port = 9999;

        server.listen(port, async () => {
            const client = new HaberdasherClientProtobuf(NodeHttpRPC({
                baseUrl: "http://localhost:9999/twirp",
            }));

            const hat = await client.MakeHat({
                inches: 1,
            });

            expect(hat).toEqual({
                id: "1",
                color: "blue",
                inches: 100,
                name: "cap",
                variants: [],
            });

            await httpTerminator.terminate();
            done();
        })
    });

    it("will return a TwripError when a error occur", (done) => {
        const twirpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                const error = new InternalServerError("error");
                error.withMeta("test", "msg")
                error.withMeta("test2", "msg2")
                throw error;
            },
            async FindHat(ctx, request): Promise<FindHatRPC> {
                return request;
            },
            async ListHat(ctx, request): Promise<ListHatRPC> {
                return request;
            }
        });

        server = http.createServer(twirpServer.httpHandler());
        httpTerminator = createHttpTerminator({
            server,
        });

        const port = 9999;

        server.listen(port, async () => {
            const client = new HaberdasherClientProtobuf(NodeHttpRPC({
                baseUrl: "http://localhost:9999/twirp",
            }));

            let err: Error | undefined;
            try {
                await client.MakeHat({
                    inches: 1,
                });
            } catch (e) {
                err = e;
            }


            expect(err).toBeInstanceOf(TwirpError);

            const twirpErr = err as TwirpError;
            expect(twirpErr.code).toEqual(TwirpErrorCode.Internal);
            expect(twirpErr.msg).toEqual("error");
            expect(twirpErr.meta).toEqual({
                test: "msg",
                test2: "msg2"
            })

            await httpTerminator.terminate();
            done();
        })
    })
})