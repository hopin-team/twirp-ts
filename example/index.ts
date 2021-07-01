import express from 'express';
import {createHaberdasherServer} from "./generated/service.twirp";
import {jsonClient, protobufClient} from "./client";
import { createGateway, FindHatRPC, Hat, ListHatRPC } from "./generated";

const server = createHaberdasherServer({
    async MakeHat(ctx, request): Promise<Hat> {
        return Hat.fromJson({
            name: "cup",
            inches: request.inches,
            color: "blue",
        });
    },
    async FindHat(ctx, request): Promise<FindHatRPC> {
        return request;
    },
    async ListHat(ctx, request): Promise<ListHatRPC> {
        return request;
    }
})

const app = express();
const gateway = createGateway();

app.use(gateway.twirpRewrite());
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
