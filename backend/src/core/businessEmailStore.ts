export interface InboxThread {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  status: "none" | "replied" | "action_taken" | "resolved";
  quickReplyable: boolean;
  action?: { label: string; prompt: string };
  priority?: "Low" | "Medium" | "High";
  requester?: string;
}

class BusinessEmailStore {
  async list(_userEmail: string, _kind: "email" | "ticket", _limit = 50): Promise<InboxThread[]> {
    return [];
  }

  async insertTestSend(_args: { fromEmail: string; fromName: string; toEmail: string; subject: string; body: string }): Promise<InboxThread> {
    throw new Error("Email store not available in this tier");
  }
}

export const businessEmailStore = new BusinessEmailStore();
