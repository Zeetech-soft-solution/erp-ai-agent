interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  refreshKey,
  windowDays = 3,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  windowDays?: number;
}) {
  const conversations: ConversationSummary[] = [];
  void activeId;
  void onSelect;
  void refreshKey;
  void windowDays;

  return (
    <div className="conversation-list">
      <button type="button" className="conversation-new-btn" onClick={onNew}>
        + New chat
      </button>
      {!conversations.length && <div className="conversation-empty">No conversations yet</div>}
    </div>
  );
}
