import { AgentResponse } from "./types";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "agent";
  prompt: string | null;
  response: AgentResponse | null;
  silent: boolean;
  createdAt: string;
}

// A short, readable thread title from the first prompt — pure text
// utility, no store/business content, kept fully functional.
export function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed || "New chat";
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : 60)}…`;
}

class ConversationStore {
  async create(_userEmail: string, firstPrompt: string): Promise<ConversationSummary> {
    const now = new Date().toISOString();
    return { id: "", title: titleFromPrompt(firstPrompt), createdAt: now, lastMessageAt: now };
  }

  async listRecent(_userEmail: string, _sinceDays: number): Promise<ConversationSummary[]> {
    return [];
  }

  async listOlder(_userEmail: string, _beforeIso: string, _limit: number): Promise<ConversationSummary[]> {
    return [];
  }

  async getMessages(_conversationId: string, _userEmail: string): Promise<StoredMessage[]> {
    return [];
  }

  async appendUserMessage(_conversationId: string, _prompt: string, _silent: boolean): Promise<void> {}

  async appendAgentMessage(_conversationId: string, _response: AgentResponse): Promise<void> {}

  async belongsToUser(_conversationId: string, _userEmail: string): Promise<boolean> {
    return false;
  }
}

export const conversationStore = new ConversationStore();
