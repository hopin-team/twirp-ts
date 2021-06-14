import axios from "axios";
import {HaberdasherClientJSON, HaberdasherClientProtobuf} from "./generated/haberdasher.twirp";

interface Rpc {
    request(
        service: string,
        method: string,
        contentType: "application/json" | "application/protobuf",
        data: object | Uint8Array
    ): Promise<object | Uint8Array>;
}

const client = axios.create({
    baseURL: "http://localhost:8000/twirp",
})

export const httpImplementation: Rpc = {
    request(service, method, contentType, data) {
        return client.post(`${service}/${method}`, data, {
            responseType: contentType === "application/protobuf" ? 'arraybuffer' : "json",
            headers: {
                "content-type": contentType,
            }
        }).then(response => {
            return response.data
        });
    }
}

export const jsonClient = new HaberdasherClientJSON(httpImplementation);
export const protobufClient = new HaberdasherClientProtobuf(httpImplementation);