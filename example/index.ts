import express from 'express';
import {createHaberdasherServer} from "./generated/haberdasher.twirp";
import {TwirpContext} from "twirp-ts";
import {Hat, Size} from "./generated/service";
import {jsonClient, protobufClient} from "./client";

const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        return Hat.fromJSON({
            name: "cup",
            inches: 3,
            color: "blue",
        });
    },
});

const app = express();

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
