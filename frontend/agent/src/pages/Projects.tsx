import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsService } from "../services/projectsService";
import { ProjectIssue } from "../services/types";
import { formatRelativeTime } from "../components/StatusBadge";

const STATUS_ORDER: ProjectIssue["status"][] = ["Todo", "In Progress", "Done"];

export function Projects() {
  const [items, setItems] = useState<ProjectIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    projectsService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  function advance(id: string) {
    projectsService.advance(id).then((updated) => {
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    });
  }

  function checkStatus(p: ProjectIssue) {
    const prompt = `I have this project issue:\n${p.key} - ${p.title}\nAssignee: ${p.assignee}\nPriority: ${p.priority}\nStatus: ${p.status}\n\nWhat should I do about this?`;
    navigate("/chat", { state: { autoPrompt: prompt, silent: true } });
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Projects</h2>
        <p>Issues across active projects, Linear-style - each status move logs its own comment.</p>
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      <div className="issue-board">
        {STATUS_ORDER.map((status) => (
          <div className="issue-column" key={status}>
            <div className="issue-column-title">
              {status} <span className="issue-count">{items.filter((i) => i.status === status).length}</span>
            </div>
            {items.filter((i) => i.status === status).map((p) => (
              <div className="issue-card" key={p.id}>
                <div className="issue-card-top" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  <span className="issue-key">{p.key}</span>
                  <span className={`priority-tag priority-${p.priority.toLowerCase()}`}>{p.priority}</span>
                </div>
                <div className="issue-title">{p.title}</div>
                <div className="issue-assignee">{p.assignee}</div>

                {expanded === p.id && (
                  <div className="issue-comments">
                    {p.comments.map((c, i) => (
                      <div className={`issue-comment${c.auto ? " auto" : ""}`} key={i}>
                        <span className="comment-author">{c.author}</span>
                        <span className="comment-text">{c.text}</span>
                        <span className="comment-time">{formatRelativeTime(c.at)}</span>
                      </div>
                    ))}
                    {!p.comments.length && <div className="issue-comment auto"><span className="comment-text">No activity yet.</span></div>}
                  </div>
                )}

                <div className="issue-card-actions">
                  <button type="button" className="action-btn secondary small" onClick={() => checkStatus(p)}>
                    Ask about this
                  </button>
                  {status !== "Done" && (
                    <button type="button" className="action-btn small" onClick={() => advance(p.id)}>
                      Move to {STATUS_ORDER[STATUS_ORDER.indexOf(status) + 1]}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
