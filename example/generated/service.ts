/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";

export const protobufPackage = "twirp.example.haberdasher";

/** Size of a Hat, in inches. */
export interface Size {
  /** must be > 0 */
  inches: number;
}

/** A Hat is a piece of headwear made by a Haberdasher. */
export interface Hat {
  inches: number;
  /** anything but "invisible" */
  color: string;
  /** i.e. "bowler" */
  name: string;
}

const baseSize: object = { inches: 0 };

export const Size = {
  encode(message: Size, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.inches !== 0) {
      writer.uint32(8).int32(message.inches);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Size {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSize } as Size;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.inches = reader.int32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Size {
    const message = { ...baseSize } as Size;
    if (object.inches !== undefined && object.inches !== null) {
      message.inches = Number(object.inches);
    } else {
      message.inches = 0;
    }
    return message;
  },

  toJSON(message: Size): unknown {
    const obj: any = {};
    message.inches !== undefined && (obj.inches = message.inches);
    return obj;
  },

  fromPartial(object: DeepPartial<Size>): Size {
    const message = { ...baseSize } as Size;
    if (object.inches !== undefined && object.inches !== null) {
      message.inches = object.inches;
    } else {
      message.inches = 0;
    }
    return message;
  },
};

const baseHat: object = { inches: 0, color: "", name: "" };

export const Hat = {
  encode(message: Hat, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.inches !== 0) {
      writer.uint32(8).int32(message.inches);
    }
    if (message.color !== "") {
      writer.uint32(18).string(message.color);
    }
    if (message.name !== "") {
      writer.uint32(26).string(message.name);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Hat {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseHat } as Hat;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.inches = reader.int32();
          break;
        case 2:
          message.color = reader.string();
          break;
        case 3:
          message.name = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Hat {
    const message = { ...baseHat } as Hat;
    if (object.inches !== undefined && object.inches !== null) {
      message.inches = Number(object.inches);
    } else {
      message.inches = 0;
    }
    if (object.color !== undefined && object.color !== null) {
      message.color = String(object.color);
    } else {
      message.color = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = String(object.name);
    } else {
      message.name = "";
    }
    return message;
  },

  toJSON(message: Hat): unknown {
    const obj: any = {};
    message.inches !== undefined && (obj.inches = message.inches);
    message.color !== undefined && (obj.color = message.color);
    message.name !== undefined && (obj.name = message.name);
    return obj;
  },

  fromPartial(object: DeepPartial<Hat>): Hat {
    const message = { ...baseHat } as Hat;
    if (object.inches !== undefined && object.inches !== null) {
      message.inches = object.inches;
    } else {
      message.inches = 0;
    }
    if (object.color !== undefined && object.color !== null) {
      message.color = object.color;
    } else {
      message.color = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = object.name;
    } else {
      message.name = "";
    }
    return message;
  },
};

/** Haberdasher service makes hats for clients. */
export interface Haberdasher {
  /** MakeHat produces a hat of mysterious, randomly-selected color! */
  MakeHat(request: Size): Promise<Hat>;
}

type Builtin =
  | Date
  | Function
  | Uint8Array
  | string
  | number
  | boolean
  | undefined;
export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepPartial<U>>
  : T extends {}
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}
