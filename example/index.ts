import * as http from "http";
import {createHaberdasherServer} from "./generated/haberdasher.twirp";
import {TwirpContext} from "twirp-ts";
import {Hat, Size} from "./generated/service";
import {jsonClient, protobufClient} from "./client";

const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        return Hat.fromPartial({
            name: "wooow",
        });
    },
});

http
    .createServer(server.httpHandler())
    .listen(8080, async () => {
        const jsonResp = await jsonClient.MakeHat({
            inches: 1,
        });

        console.log("response from JSON client", jsonResp);

        const protobufResp = await protobufClient.MakeHat({
            inches: 1,
        });

        console.log("response from Protobuf client", protobufResp);
    });