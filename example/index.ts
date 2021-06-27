import express from 'express';
import {createHaberdasherServer} from "./generated/service.twirp";
import {TwirpContext} from "../src/twirp";
import {Hat, Size} from "./generated/service";
import {jsonClient, protobufClient} from "./client";
import { createGateway } from "./generated/gateway.twirp";

const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        return Hat.fromJson({
            name: "cup",
            inches: request.inches,
            color: "blue",
        });
    },
})

const app = express();
const gateway = createGateway();

app.use(gateway.rewriteMiddleware())
app.post(server.matchingPath(), server.httpHandler());

app.listen(8000, async () => {
    const jsonResp = await jsonClient.MakeHat({
        inches: 2,
    });

    console.log("response from JSON client", jsonResp);

    const protobufResp = await protobufClient.MakeHat({
        inches: 1,
    });

    console.log("response from Protobuf client", protobufResp);
})
