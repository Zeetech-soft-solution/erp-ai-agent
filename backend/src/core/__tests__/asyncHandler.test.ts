import { asyncHandler } from "../asyncHandler";

describe("asyncHandler", () => {
  it("calls through to the wrapped handler with req/res/next", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const req = {} as any, res = {} as any, next = jest.fn();
    await asyncHandler(fn)(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  it("forwards a rejected promise to next() instead of letting it crash the process", async () => {
    const err = new Error("db exploded");
    const fn = jest.fn().mockRejectedValue(err);
    const next = jest.fn();
    // asyncHandler's inner .catch(next) is async — wait a tick for it to settle.
    asyncHandler(fn)({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it("never calls next() when the handler resolves cleanly", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const next = jest.fn();
    asyncHandler(fn)({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });

  it("also catches a handler that throws synchronously, not just an async rejection", async () => {
    const err = new Error("sync boom");
    const fn = jest.fn(() => { throw err; });
    const next = jest.fn();
    asyncHandler(fn)({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });
});
