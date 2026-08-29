import { paymentEntryActionsModule } from "../index";
import { systemConnector } from "../../../config/system.config";
import { Session } from "../../../core/types";

jest.mock("../../../config/system.config", () => ({
  systemConnector: { createPaymentEntryForInvoice: jest.fn() },
}));

const credential = { mode: "session", sid: "s" };
const session = { sub: "anil.sharma35@sunriseelectronics.example.in", credential } as unknown as Session;

function tool(name: string) {
  const t = paymentEntryActionsModule.tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe("paymentEntryActionsModule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers payment_entry.create, requiring only invoiceId", () => {
    const t = tool("payment_entry.create");
    expect((t.parameters as any).required).toEqual(["invoiceId"]);
  });

  it("delegates to systemConnector.createPaymentEntryForInvoice with the caller's own credential", async () => {
    (systemConnector.createPaymentEntryForInvoice as jest.Mock).mockResolvedValue({ id: "ACC-PAY-2026-00042" });
    const result = await tool("payment_entry.create").handler({ invoiceId: "ACC-SINV-2026-00973" }, session);
    expect(systemConnector.createPaymentEntryForInvoice).toHaveBeenCalledWith(credential, "ACC-SINV-2026-00973", undefined);
    expect(result).toEqual({ id: "ACC-PAY-2026-00042" });
  });

  it("passes a specific amount through untouched when the caller names a partial payment", async () => {
    (systemConnector.createPaymentEntryForInvoice as jest.Mock).mockResolvedValue({ id: "ACC-PAY-2026-00043" });
    await tool("payment_entry.create").handler({ invoiceId: "ACC-SINV-2026-00973", amount: 5000 }, session);
    expect(systemConnector.createPaymentEntryForInvoice).toHaveBeenCalledWith(credential, "ACC-SINV-2026-00973", 5000);
  });
});
