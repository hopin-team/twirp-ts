import * as http from 'http';
import supertest from 'supertest';
import {createHaberdasherServer, HaberdasherTwirp} from "../__mocks__/haberdasher.twirp";
import {TwirpContext} from "../context";
import {Hat, Size} from "../__mocks__/service";
import {TwirpError, TwirpErrorCode} from "../errors";
import {TwirpServer} from "../server";

describe("Server twirp specification", () => {

    let server: http.Server
    beforeEach(() => {
        const triwpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                return Hat.fromPartial({
                    name: "cap",
                    color: "blue",
                    inches: 3,
                });
            }
        });

        server = http.createServer(triwpServer.httpHandler());
    })

    it("support only POST requests", async () => {
        const unsupportedMethods = ["get", "put", "patch", "delete", "options"]

        const tests = unsupportedMethods.map(async (method) => {
            const dynamicSupertest = supertest(server) as {[key:string]: (...args: any[]) => supertest.Test} & supertest.SuperTest<supertest.Test>

            const resp = await dynamicSupertest[method]("/invalid-url")
                .set('Content-Type', 'application/json')
                .expect('Content-Type', "application/json")
                .expect(404);

            expect(resp.body).toEqual({
                code: TwirpErrorCode.BadRoute,
                msg: `unsupported method ${method.toUpperCase()} (only POST is allowed)`,
                meta: {
                    twirp_invalid_route: `${method.toUpperCase()} /invalid-url`,
                }
            })
        });

        await Promise.all(tests);

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/json')
            .expect('Content-Type', "application/json")
            .expect(200);
    });

    it("support only application/json and application/protobuf content-type", async () => {
        const resp = await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'invalid/json')
            .expect('Content-Type', "application/json")
            .expect(404);

        expect(resp.body).toEqual({
            code: "bad_route",
            meta: {
                twirp_invalid_route: "POST /twirp/twirp.example.haberdasher.Haberdasher/MakeHat"
            },
            msg: "unexpected Content-Type: invalid/json"
        });

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/json')
            .expect('Content-Type', "application/json")
            .expect(200);

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/protobuf')
            .expect('Content-Type', "application/protobuf")
            .expect(200);
    })

    describe("url must match [<prefix>]/[<package>.]<Service>/<Method>",() => {
        it("will error if url is malformed", async () => {
            const resp = await supertest(server).post("/invalid-url-format")
                .expect('Content-Type', "application/json")
                .expect(404);

            expect(resp.body).toEqual({
                code: TwirpErrorCode.BadRoute,
                msg: `no handler for path /invalid-url-format`,
                meta: {
                    twirp_invalid_route: `POST /invalid-url-format`,
                }
            });
        });

        it("succeeds when url is properly constructed", async () => {
            await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
                .set('Content-Type', 'application/json')
                .expect('Content-Type', "application/json")
                .expect(200);
        })

        it("must respect the prefix", async () => {
            const resp = await supertest(server).post("/twirp-not-existing/twirp.example.haberdasher.Haberdasher/MakeHat")
                .set('Content-Type', 'application/json')
                .expect('Content-Type', "application/json")
                .expect(404);

            expect(resp.body).toEqual({
                code: "bad_route",
                meta: {
                    twirp_invalid_route: "POST /twirp-not-existing/twirp.example.haberdasher.Haberdasher/MakeHat"
                },
                msg: "invalid path prefix /twirp-not-existing, expected /twirp, on path /twirp-not-existing/twirp.example.haberdasher.Haberdasher/MakeHat"
            })
        });

        it("must have a specified handler", async () => {
            const resp = await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHatDoesntExists")
                .set('Content-Type', 'application/json')
                .expect('Content-Type', "application/json")
                .expect(404);

            expect(resp.body).toEqual({
                code: "bad_route",
                meta: {
                    twirp_invalid_route: "POST /twirp/twirp.example.haberdasher.Haberdasher/MakeHatDoesntExists"
                },
                msg: "no handler for path /twirp/twirp.example.haberdasher.Haberdasher/MakeHatDoesntExists"
            })
        })
    })
})

describe("Hooks & Interceptors", () => {
    let server: http.Server
    let twirpServer: TwirpServer<HaberdasherTwirp>
    beforeEach(() => {
        twirpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                return Hat.fromPartial({
                    name: "cap",
                    color: "blue",
                    inches: 3,
                });
            }
        });

        server = http.createServer(twirpServer.httpHandler());
    })

    it("can add interceptors", async () => {
        const interceptorSpy = jest.fn();
        twirpServer.use(async (ctx, req, next) => {
            interceptorSpy();
            const resp = await next(ctx, next);
            interceptorSpy();
            return resp;
        });

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/json')
            .expect('Content-Type', "application/json")
            .expect(200);

        expect(interceptorSpy).toBeCalledTimes(2);
    });

    it("can add hooks", async () => {
        const hookSpy = jest.fn();
        twirpServer.use({
            requestReceived: (ctx) => {
                hookSpy("received");
            },
            requestRouted: (ctx) => {
                hookSpy("routed");
            },
            requestPrepared: (ctx) => {
                hookSpy("prepared");
            },
            requestSent: (ctx) => {
                hookSpy("sent");
            },
            error: (ctx, err) => {
                hookSpy("error"); // will not be called
            }
        });

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/json')
            .expect('Content-Type', "application/json")
            .expect(200);

        expect(hookSpy).toBeCalledTimes(4);
        expect(hookSpy).toBeCalledWith("received");
        expect(hookSpy).toBeCalledWith("routed");
        expect(hookSpy).toBeCalledWith("prepared");
        expect(hookSpy).toBeCalledWith("sent");
    });

    it("will invoke the error hook when an error occurs", async () => {
        twirpServer = createHaberdasherServer({
            async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
                throw new TwirpError(TwirpErrorCode.Internal, "test error");
            }
        });

        const hookSpy = jest.fn();
        twirpServer.use({
            error: (ctx, err) => {
                hookSpy("error"); // will not be called
            }
        });

        server = http.createServer(twirpServer.httpHandler());

        await supertest(server).post("/twirp/twirp.example.haberdasher.Haberdasher/MakeHat")
            .set('Content-Type', 'application/json')
            .expect('Content-Type', "application/json")
            .expect(500);

        expect(hookSpy).toBeCalledWith("error");
    })
});