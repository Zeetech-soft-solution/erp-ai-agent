import { emailModule } from "../index";
import { businessEmailStore } from "../../../core/businessEmailStore";
import { mailboxConnector } from "../../../providers/mail/stubMailboxConnector";
import { Session } from "../../../core/types";

jest.mock("../../../core/businessEmailStore", () => ({ businessEmailStore: { list: jest.fn() } }));
jest.mock("../../../providers/mail/stubMailboxConnector", () => ({ mailboxConnector: { send: jest.fn() } }));

const session = { sub: "rahul.menon66@sunriseelectronics.example.in" } as unknown as Session;

function tool(name: string) {
  const t = emailModule.tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe("emailModule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers email.list, email.draft, email.send", () => {
    expect(emailModule.tools.map((t) => t.name).sort()).toEqual(["email.draft", "email.list", "email.send"]);
  });

  it("email.list reads the calling user's own inbox, kind=email, never another user's", async () => {
    (businessEmailStore.list as jest.Mock).mockResolvedValue([{ subject: "RE: PO-1042" }]);
    const result: any = await tool("email.list").handler({}, session);
    expect(businessEmailStore.list).toHaveBeenCalledWith(session.sub, "email");
    expect(result.emails).toEqual([{ subject: "RE: PO-1042" }]);
  });

  it("email.draft never sends — it just echoes back the drafted args", async () => {
    const args = { to: "buyer@acme.com", subject: "Re: Quote", body: "Here's the quote" };
    const result: any = await tool("email.draft").handler(args, session);
    expect(mailboxConnector.send).not.toHaveBeenCalled();
    expect(result.draft).toEqual(args);
  });

  it("email.send actually records a send via mailboxConnector as the calling user", async () => {
    (mailboxConnector.send as jest.Mock).mockResolvedValue({ id: "sent-1" });
    const args = { to: "buyer@acme.com", subject: "Re: Quote", body: "Confirmed" };
    const result: any = await tool("email.send").handler(args, session);
    expect(mailboxConnector.send).toHaveBeenCalledWith(session.sub, args);
    expect(result).toEqual({ ok: true, sent: { id: "sent-1" } });
  });
});
