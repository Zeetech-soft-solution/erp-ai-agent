import { Session } from "../types";

function freshStore() {
  jest.resetModules();
  return require("../sessionStore").sessionStore;
}

function session(sub: string): Session {
  return { sub, erpnext_roles: ["Sales User"], allowed_tools: ["quotation.list"], credential: {} as any };
}

describe("sessionStore", () => {
  afterEach(() => jest.useRealTimers());

  it("create() returns a sessionId that get() resolves back to the same session", () => {
    const store = freshStore();
    const id = store.create(session("a@x.com"));
    expect(store.get(id)?.sub).toBe("a@x.com");
  });

  it("get() returns null for an unknown sessionId", () => {
    const store = freshStore();
    expect(store.get("does-not-exist")).toBeNull();
  });

  it("destroy() removes the session immediately", () => {
    const store = freshStore();
    const id = store.create(session("a@x.com"));
    store.destroy(id);
    expect(store.get(id)).toBeNull();
  });

  it("a session expires after its TTL and get() both returns null and evicts it", () => {
    jest.useFakeTimers();
    const store = freshStore();
    const id = store.create(session("a@x.com"));
    jest.advanceTimersByTime(8 * 60 * 60 * 1000 + 1);
    expect(store.get(id)).toBeNull();
    // Evicted, not just reported expired — getActiveSessions must not still count it.
    expect(store.getActiveSessions()).toEqual([]);
  });

  it("destroyAllForUser() removes every session for that user, across multiple logins, without touching other users' sessions", () => {
    const store = freshStore();
    const id1 = store.create(session("a@x.com"));
    const id2 = store.create(session("a@x.com"));
    const idOther = store.create(session("b@x.com"));
    store.destroyAllForUser("a@x.com");
    expect(store.get(id1)).toBeNull();
    expect(store.get(id2)).toBeNull();
    expect(store.get(idOther)?.sub).toBe("b@x.com");
  });

  it("getActiveSessions() dedupes multiple logins by the same user down to one entry", () => {
    const store = freshStore();
    store.create(session("a@x.com"));
    store.create(session("a@x.com"));
    store.create(session("b@x.com"));
    const actives = store.getActiveSessions().map((s: Session) => s.sub).sort();
    expect(actives).toEqual(["a@x.com", "b@x.com"]);
  });

  it("getActiveSessions() excludes an expired session", () => {
    jest.useFakeTimers();
    const store = freshStore();
    store.create(session("a@x.com"));
    jest.advanceTimersByTime(8 * 60 * 60 * 1000 + 1);
    expect(store.getActiveSessions()).toEqual([]);
  });
});
