import http from "http";
import { TwirpServer } from "../server";
import { createHaberdasherServer, HaberdasherClientJSON, HaberdasherTwirp } from "../__mocks__/service.twirp";
import { TwirpContext } from "../context";
import { FindHatRPC, Hat, ListHatRPC, Size } from "../__mocks__/service";
import { createGateway } from "../__mocks__/gateway.twirp";
import { Gateway } from "../gateway";
import supertest from "supertest";
import { createHttpTerminator } from "http-terminator";
import { NodeHttpRPC } from "../http.client";


describe("Gateway", () => {

  let server: http.Server
  let twirpServer: TwirpServer<HaberdasherTwirp>
  let gateway: Gateway
  beforeEach(() => {
    twirpServer = createHaberdasherServer({
      async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        return Hat.create({
          id: "1",
          name: "cap",
          color: "blue",
          inches: request.inches,
        });
      },
      async FindHat(ctx, request): Promise<FindHatRPC> {
        return request;
      },
      async ListHat(ctx, request): Promise<ListHatRPC> {
        return request;
      }
    });

    gateway = createGateway();
    const twirpRewrite = gateway.twirpRewrite();

    server = http.createServer((req, resp) => {
      twirpRewrite(req, resp, () => {
        twirpServer.httpHandler()(req, resp);
      });
    });
  });

  it("call custom POST http endpoint that maps to MakeHat", async () => {
    const response = await supertest(server)
      .post('/hat')
      .send({
        inches: 30,
      })
      .expect('Content-Type', "application/json")
      .expect(200);

    expect(response.body).toEqual({
      id: "1",
      name: "cap",
      color: "blue",
      inches: 30,
    })
  })

  it("will map url parameter to request message", async () => {
    const response = await supertest(server)
      .get('/hat/12345')
      .expect('Content-Type', "application/json")
      .expect(200);

    expect(response.body).toEqual({
      hat_id: "12345",
    })
  })

  it("will map query string parameters to request message", async () => {
    const response = await supertest(server)
      .get('/hat')
      .query({
        'filters[0].order_by': "desc",
        'filters[0].pagination.limit': 10,
        'filters[0].pagination.offset': 2,
        'filters[1].order_by': "asc",
        'filters[1].pagination.limit': 5,
        'filters[1].pagination.offset': 6,
      })
      .expect('Content-Type', "application/json")
      .expect(200);

    expect(response.body).toEqual({
      filters: [
        {
          order_by: "desc",
          pagination: {
            limit: 10,
            offset: 2,
          },
        },
        {
          order_by: "asc",
          pagination: {
            limit: 5,
            offset: 6,
          },
        }
      ]
    })
  })

  it("will do a reverse proxy request to the handler", (done) => {
    const server = createHaberdasherServer({
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

    const gateway = createGateway();

    const twirpServerPort = 9999;
    const twirpServer = http.createServer(server.httpHandler());
    const httpTerminator1 = createHttpTerminator({
      server: twirpServer,
    });

    const gatewayServerPort = 9998;
    const gatewayServer = http.createServer(gateway.reverseProxy({
      baseUrl: "http://localhost:9999/twirp",
    }));

    const httpTerminator2 = createHttpTerminator({
      server: gatewayServer,
    });

    // twirp server
    twirpServer.listen(twirpServerPort, async () => {
        // reverse proxy server
      gatewayServer.listen(gatewayServerPort, async () => {
        const response = await supertest(gatewayServer)
          .post('/hat')
          .send({
            inches: 30,
          })
          .expect('Content-Type', "application/json")
          .expect(200);

        expect(response.body).toEqual({
          id: "1",
          name: "cap",
          color: "blue",
          inches: 100,
        });

        await Promise.all([
          httpTerminator1.terminate(),
          httpTerminator2.terminate(),
        ]);

        done();
      })
    });
  })
})