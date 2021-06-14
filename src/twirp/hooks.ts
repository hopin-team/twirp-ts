import {TwirpContext} from "./context";
import {TwirpError} from "./errors";

// ServerHooks is a container for callbacks that can instrument a
// Twirp-generated server. These callbacks all accept a context and return a
// context. They can use this to add to the request context as it threads
// through the system, appending values or deadlines to it.
//
// The RequestReceived and RequestRouted hooks are special: they can return
// errors. If they return a non-nil error, handling for that request will be
// stopped at that point. The Error hook will be triggered, and the error will
// be sent to the client. This can be used for stuff like auth checks before
// deserializing a request.
//
// The RequestReceived hook is always called first, and it is called for every
// request that the Twirp server handles. The last hook to be called in a
// request's lifecycle is always ResponseSent, even in the case of an error.
//
// Details on the timing of each hook are documented as comments on the fields
// of the ServerHooks type.
export interface ServerHooks {
    requestReceived?: (ctx: TwirpContext) => void | Promise<void>
    requestRouted?: (ctx: TwirpContext) => void | Promise<void>
    requestPrepared?: (ctx: TwirpContext) => void | Promise<void>
    requestSent?: (ctx: TwirpContext) => void | Promise<void>
    error?: (ctx: TwirpContext, err: TwirpError) => void | Promise<void>
}

// ChainHooks creates a new ServerHook which chains the callbacks in
// each of the constituent hooks passed in. Each hook function will be
// called in the order of the ServerHooks values passed in.
//
// For the erroring hooks, RequestReceived and RequestRouted, any returned
// errors prevent processing by later hooks.
export function chainHooks(...hooks: ServerHooks[]): ServerHooks | null {
    if (hooks.length === 0) {
        return null;
    }

    if (hooks.length === 1) {
        return hooks[0];
    }

    const serverHook: ServerHooks = {
        async requestReceived(ctx) {
            for (const hook of hooks) {
                if (!hook.requestReceived) {
                    continue;
                }
                await hook.requestReceived(ctx);
            }
        },
        async requestPrepared(ctx) {
            for (const hook of hooks) {
                if (!hook.requestPrepared) {
                    continue;
                }
                await hook.requestPrepared(ctx);
            }
        },
        async requestSent(ctx) {
            for (const hook of hooks) {
                if (!hook.requestSent) {
                    continue;
                }
                await hook.requestSent(ctx);
            }
        },
        async requestRouted(ctx) {
            for (const hook of hooks) {
                if (!hook.requestRouted) {
                    continue;
                }
                await hook.requestRouted(ctx);
            }
        },
        async error(ctx, err) {
            for (const hook of hooks) {
                if (!hook.error) {
                    continue;
                }
                await hook.error(ctx, err);
            }
        }
    }

    return serverHook;
}

export function isHook(object: any): object is ServerHooks {
    return (
        'requestReceived' in object ||
        'requestPrepared' in object ||
        'requestSent' in object ||
        'requestRouted' in object ||
        'error' in object
    );
}