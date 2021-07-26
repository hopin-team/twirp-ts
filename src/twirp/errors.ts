/**
 * Represents a twirp error
 */
export class TwirpError extends Error {
  public readonly msg: string;
  public readonly code: TwirpErrorCode = TwirpErrorCode.Internal;
  public readonly meta: Record<string, string> = {};

  private _originalCause?: Error;

  constructor(code: TwirpErrorCode, msg: string) {
    super(msg);
    this.code = code;
    this.msg = msg;
    Object.setPrototypeOf(this, TwirpError.prototype);
  }

  /**
   * Adds a metadata kv to the error
   * @param key
   * @param value
   */
  public withMeta(key: string, value: string) {
    this.meta[key] = value;
    return this;
  }

  /**
   * Returns a single metadata value
   * return "" if not found
   * @param key
   */
  public getMeta(key: string) {
    return this.meta[key] || "";
  }

  /**
   * Add the original error cause
   * @param err
   * @param addMeta
   */
  public withCause(err: Error, addMeta: boolean = false) {
    this._originalCause = err;
    if (addMeta) {
      this.withMeta("cause", err.message);
    }
    return this;
  }

  public cause() {
    return this._originalCause;
  }

  /**
   * Returns the error representation to JSON
   */
  public toJSON() {
    try {
      return JSON.stringify({
        code: this.code,
        msg: this.msg,
        meta: this.meta,
      });
    } catch (e) {
      return `{"code": "internal", "msg": "There was an error but it could not be serialized into JSON"}`;
    }
  }

  /**
   * Create a twirp error from an object
   * @param obj
   */
  static fromObject(obj: Record<string, any>): TwirpError {
    const code = obj["code"] || TwirpErrorCode.Unknown;
    const msg = obj["msg"] || "unknown";
    const error = new TwirpError(code, msg);

    if (obj["meta"]) {
      Object.keys(obj["meta"]).forEach((key) => {
        error.withMeta(key, obj["meta"][key]);
      });
    }

    return error;
  }
}

/**
 * NotFoundError constructor for the common NotFound error.
 */
export class NotFoundError extends TwirpError {
  constructor(msg: string) {
    super(TwirpErrorCode.NotFound, msg);
  }
}

/**
 * InvalidArgumentError constructor for the common InvalidArgument error. Can be
 * used when an argument has invalid format, is a number out of range, is a bad
 * option, etc).
 */
export class InvalidArgumentError extends TwirpError {
  constructor(argument: string, validationMsg: string) {
    super(TwirpErrorCode.InvalidArgument, argument + " " + validationMsg);
    this.withMeta("argument", argument);
  }
}

/**
 * RequiredArgumentError is a more specific constructor for InvalidArgument
 * error. Should be used when the argument is required (expected to have a
 * non-zero value).
 */
export class RequiredArgumentError extends InvalidArgumentError {
  constructor(argument: string) {
    super(argument, "is required");
  }
}

/**
 * InternalError constructor for the common Internal error. Should be used to
 * specify that something bad or unexpected happened.
 */
export class InternalServerError extends TwirpError {
  constructor(msg: string) {
    super(TwirpErrorCode.Internal, msg);
  }
}

/**
 * InternalErrorWith makes an internal error, wrapping the original error and using it
 * for the error message, and with metadata "cause" with the original error type.
 * This function is used by Twirp services to wrap non-Twirp errors as internal errors.
 * The wrapped error can be extracted later with err.cause()
 */
export class InternalServerErrorWith extends InternalServerError {
  constructor(err: Error) {
    super(err.message);
    this.withMeta("cause", err.name);
    this.withCause(err);
  }
}

/**
 * A standard BadRoute Error
 */
export class BadRouteError extends TwirpError {
  constructor(msg: string, method: string, url: string) {
    super(TwirpErrorCode.BadRoute, msg);
    this.withMeta("twirp_invalid_route", method + " " + url);
  }
}

export enum TwirpErrorCode {
  // Canceled indicates the operation was cancelled (typically by the caller).
  Canceled = "canceled",

  // Unknown error. For example when handling errors raised by APIs that do not
  // return enough error information.
  Unknown = "unknown",

  // InvalidArgument indicates client specified an invalid argument. It
  // indicates arguments that are problematic regardless of the state of the
  // system (i.e. a malformed file name, required argument, number out of range,
  // etc.).
  InvalidArgument = "invalid_argument",

  // Malformed indicates an error occurred while decoding the client's request.
  // This may mean that the message was encoded improperly, or that there is a
  // disagreement in message format between the client and server.
  Malformed = "malformed",

  // DeadlineExceeded means operation expired before completion. For operations
  // that change the state of the system, this error may be returned even if the
  // operation has completed successfully (timeout).
  DeadlineExceeded = "deadline_exceeded",

  // NotFound means some requested entity was not found.
  NotFound = "not_found",

  // BadRoute means that the requested URL path wasn't routable to a Twirp
  // service and method. This is returned by the generated server, and usually
  // shouldn't be returned by applications. Instead, applications should use
  // NotFound or Unimplemented.
  BadRoute = "bad_route",

  // AlreadyExists means an attempt to create an entity failed because one
  // already exists.
  AlreadyExists = "already_exists",

  // PermissionDenied indicates the caller does not have permission to execute
  // the specified operation. It must not be used if the caller cannot be
  // identified (Unauthenticated).
  PermissionDenied = "permission_denied",

  // Unauthenticated indicates the request does not have valid authentication
  // credentials for the operation.
  Unauthenticated = "unauthenticated",

  // ResourceExhausted indicates some resource has been exhausted, perhaps a
  // per-user quota, or perhaps the entire file system is out of space.
  ResourceExhausted = "resource_exhausted",

  // FailedPrecondition indicates operation was rejected because the system is
  // not in a state required for the operation's execution. For example, doing
  // an rmdir operation on a directory that is non-empty, or on a non-directory
  // object, or when having conflicting read-modify-write on the same resource.
  FailedPrecondition = "failed_precondition",

  // Aborted indicates the operation was aborted, typically due to a concurrency
  // issue like sequencer check failures, transaction aborts, etc.
  Aborted = "aborted",

  // OutOfRange means operation was attempted past the valid range. For example,
  // seeking or reading past end of a paginated collection.
  //
  // Unlike InvalidArgument, this error indicates a problem that may be fixed if
  // the system state changes (i.e. adding more items to the collection).
  //
  // There is a fair bit of overlap between FailedPrecondition and OutOfRange.
  // We recommend using OutOfRange (the more specific error) when it applies so
  // that callers who are iterating through a space can easily look for an
  // OutOfRange error to detect when they are done.
  OutOfRange = "out_of_range",

  // Unimplemented indicates operation is not implemented or not
  // supported/enabled in this service.
  Unimplemented = "unimplemented",

  // Internal errors. When some invariants expected by the underlying system
  // have been broken. In other words, something bad happened in the library or
  // backend service. Do not confuse with HTTP Internal Server Error; an
  // Internal error could also happen on the client code, i.e. when parsing a
  // server response.
  Internal = "internal",

  // Unavailable indicates the service is currently unavailable. This is a most
  // likely a transient condition and may be corrected by retrying with a
  // backoff.
  Unavailable = "unavailable",

  // DataLoss indicates unrecoverable data loss or corruption.
  DataLoss = "data_loss",
}

// ServerHTTPStatusFromErrorCode maps a Twirp error type into a similar HTTP
// response status. It is used by the Twirp server handler to set the HTTP
// response status code. Returns 0 if the ErrorCode is invalid.
export function httpStatusFromErrorCode(code: TwirpErrorCode): number {
  switch (code) {
    case TwirpErrorCode.Canceled:
      return 408; // RequestTimeout
    case TwirpErrorCode.Unknown:
      return 500; // Internal Server Error
    case TwirpErrorCode.InvalidArgument:
      return 400; // BadRequest
    case TwirpErrorCode.Malformed:
      return 400; // BadRequest
    case TwirpErrorCode.DeadlineExceeded:
      return 408; // RequestTimeout
    case TwirpErrorCode.NotFound:
      return 404; // Not Found
    case TwirpErrorCode.BadRoute:
      return 404; // Not Found
    case TwirpErrorCode.AlreadyExists:
      return 409; // Conflict
    case TwirpErrorCode.PermissionDenied:
      return 403; // Forbidden
    case TwirpErrorCode.Unauthenticated:
      return 401; // Unauthorized
    case TwirpErrorCode.ResourceExhausted:
      return 429; // Too Many Requests
    case TwirpErrorCode.FailedPrecondition:
      return 412; // Precondition Failed
    case TwirpErrorCode.Aborted:
      return 409; // Conflict
    case TwirpErrorCode.OutOfRange:
      return 400; // Bad Request
    case TwirpErrorCode.Unimplemented:
      return 501; // Not Implemented
    case TwirpErrorCode.Internal:
      return 500; // Internal Server Error
    case TwirpErrorCode.Unavailable:
      return 503; // Service Unavailable
    case TwirpErrorCode.DataLoss:
      return 500; // Internal Server Error
    default:
      return 0; // Invalid!
  }
}

// IsValidErrorCode returns true if is one of the valid predefined constants.
export function isValidErrorCode(code: TwirpErrorCode): boolean {
  return httpStatusFromErrorCode(code) != 0;
}
