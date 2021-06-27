import {chainInterceptors, Interceptor} from "../interceptors";
import {TwirpContext} from "../context";
import {TwirpContentType} from "../server";


describe("Interceptor", () => {

    it("will chain interceptors", async () => {
        const spy = jest.fn()
        const interceptor0: Interceptor<TwirpContext, any, any> = async (ctx, typedRequest, next) => {
            spy();
            const response = await next(ctx, typedRequest);
            spy();
            return response;
        }

        const spy1 = jest.fn()
        const interceptor1: Interceptor<TwirpContext, any, any> = async (ctx, typedRequest, next) => {
            spy1();
            return next(ctx, typedRequest);
        }

        const chain = chainInterceptors(interceptor0, interceptor1) as Interceptor<TwirpContext, any, any>;
        const ctx: TwirpContext = {
            req: jest.fn() as any,
            res: jest.fn() as any,
            contentType: TwirpContentType.Unknown,
            packageName: "",
            methodName: "",
            serviceName: "",
        }

        const response = await chain(ctx, {},async (ctx1, typedRequest) => {
            return { test: "test" }
        })

        expect(response).toEqual({test: "test"});
        expect(spy).toBeCalledTimes(2)
        expect(spy1).toBeCalledTimes(1)
    })
})