import {
  InternalServerError, InternalServerErrorWith,
  InvalidArgumentError,
  NotFoundError,
  RequiredArgumentError,
  TwirpError,
  TwirpErrorCode
} from "../errors";

describe("Twirp errors", () => {

  it("will render a full error", () => {
    const innerError = new Error("some error");
    const twirpError = new TwirpError(
      TwirpErrorCode.NotFound,
      "not found",
    );

    twirpError.withCause(innerError, true)
    twirpError.withMeta("meta1", "value1")
    twirpError.withMeta("meta2", "value2")

    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.NotFound,
      msg: "not found",
      meta: {
        cause: "some error",
        meta1: "value1",
        meta2: "value2",
      }
    }))
  })
})

describe("Standard Errors", () => {
  it("will render not found error", () => {
    const twirpError = new NotFoundError("not found");
    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.NotFound,
      msg: "not found",
      meta: {}
    }))
  })

  it("will render invalid argument error", () => {
    const twirpError = new InvalidArgumentError("field", "error");
    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.InvalidArgument,
      msg: "field error",
      meta: {
        argument: "field",
      }
    }))
  })

  it("will render required error", () => {
    const twirpError = new RequiredArgumentError("field");
    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.InvalidArgument,
      msg: "field is required",
      meta: {
        argument: "field",
      }
    }))
  })

  it("will render internal server error", () => {
    const twirpError = new InternalServerError("internal");
    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.Internal,
      msg: "internal",
      meta: {}
    }))
  })

  it("will render internal server error with inner", () => {
    const inner = new Error("inner")
    const twirpError = new InternalServerErrorWith(inner);
    expect(twirpError.toJSON()).toEqual(JSON.stringify({
      code: TwirpErrorCode.Internal,
      msg: "inner",
      meta: {
        cause: "Error"
      }
    }))
  })
})