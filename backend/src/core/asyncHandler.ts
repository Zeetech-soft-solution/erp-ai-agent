import { RequestHandler } from "express";

/**
 * Express 4 does not catch rejections thrown inside an async route
 * handler — they become unhandled promise rejections and, by default,
 * crash the whole Node process (killing every other in-flight request
 * too, not just the one that errored). Wrap any async handler with
 * this so its errors reach the global error middleware in server.ts
 * instead.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    // Every route in this codebase passes an `async` function, which by JS
    // semantics never throws synchronously (a throw inside one always
    // produces a rejected promise) — but wrapping the call itself in
    // try/catch, not just chaining .catch() onto its result, means this
    // helper stays correct even for a plain non-async handler that throws
    // before ever returning a promise, instead of crashing the process the
    // same way this file exists to prevent in the first place.
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}
