import * as http from "http";
import {createHttpTerminator, HttpTerminator} from "http-terminator";
import {
    createHaberdasherServer,
    HaberdasherClientJSON,
    HaberdasherClientProtobuf
} from "../__mocks__/haberdasher.twirp";
import {TwirpContext} from "../context";
import {Hat, Size} from "../__mocks__/service";
import {NodeHttpRPC} from "../http.client";
import {InternalServerError, TwirpError, TwirpErrorCode} from "../errors";

describe("Twirp Clients", () => {

    let httpTerminator: HttpTerminator;
    let server: http.Server;
    beforeEach(() => {
        const twirpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                return Hat.create({
                    name: "cap",
                    color: "blue",
                    inches: 100,
                })
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
                color: "blue",
                inches: 100,
                name: "cap",
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
                color: "blue",
                inches: 100,
                name: "cap",
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