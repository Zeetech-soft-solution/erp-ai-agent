import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsService } from "../services/projectsService";
import { ProjectIssue, IssueComment } from "../services/types";
import { formatRelativeTime } from "../components/StatusBadge";

const STATUS_ORDER: ProjectIssue["status"][] = ["Todo", "In Progress", "Done"];
const POLL_MS = 15000;

/**
 * Comments here follow the same rule as Email's reply: "Add comment"
 * routes silently into chat, the agent drafts one with the issue's real
 * context, and only once the user confirms does project.comment actually
 * fire (see backend modules/projects/index.ts) - `realComments` is that
 * tool's output read back, merged into each issue's comment list, not a
 * locally-guessed entry. Sample comments (the "System: status moved to…"
 * ones from `advance`) stay client-side, same as before.
 */
export function Projects() {
  const [items, setItems] = useState<ProjectIssue[]>([]);
  const [realComments, setRealComments] = useState<Record<string, IssueComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const pollStarted = useRef(false);

  useEffect(() => {
    projectsService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  useEffect(() => {
    if (pollStarted.current) return;
    pollStarted.current = true;
    let cancelled = false;
    function loadComments() {
      projectsService.realComments().then((r) => { if (!cancelled) setRealComments(r); }).catch(() => {});
    }
    loadComments();
    const interval = setInterval(loadComments, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function allComments(p: ProjectIssue): IssueComment[] {
    return [...p.comments, ...(realComments[p.key] || [])];
  }

  function advance(id: string) {
    projectsService.advance(id).then((updated) => {
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    });
  }

  function checkStatus(p: ProjectIssue) {
    const prompt = `I have this project issue:\n${p.key} - ${p.title}\nAssignee: ${p.assignee}\nPriority: ${p.priority}\nStatus: ${p.status}\n\nWhat should I do about this?`;
    navigate("/chat", { state: { autoPrompt: prompt, silent: true } });
  }

  function addComment(p: ProjectIssue) {
    const prompt = `I want to add a comment to this project issue:\n${p.key} - ${p.title}\nAssignee: ${p.assignee}\nStatus: ${p.status}\n\nDraft a short status-update comment, and once I confirm it, post it as a comment on ${p.key}.`;
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
            {items.filter((i) => i.status === status).map((p) => {
              const comments = allComments(p);
              const latest = comments[comments.length - 1];
              return (
                <div className="issue-card" key={p.id}>
                  <div className="issue-card-top" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    <span className="issue-key">{p.key}</span>
                    <span className={`priority-tag priority-${p.priority.toLowerCase()}`}>{p.priority}</span>
                  </div>
                  <div className="issue-title">{p.title}</div>
                  <div className="issue-assignee">{p.assignee}</div>

                  <div className="issue-status-bar" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    {comments.length ? (
                      <>
                        <span className="issue-comment-count">{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
                        <span className="issue-latest-comment">{latest.author}: {latest.text}</span>
                      </>
                    ) : (
                      <span className="issue-comment-count">No comments yet</span>
                    )}
                  </div>

                  {expanded === p.id && (
                    <div className="issue-comments">
                      {comments.map((c, i) => (
                        <div className={`issue-comment${c.auto ? " auto" : ""}`} key={i}>
                          <span className="comment-author">{c.author}</span>
                          <span className="comment-text">{c.text}</span>
                          <span className="comment-time">{formatRelativeTime(c.at)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="issue-card-actions">
                    <button type="button" className="action-btn secondary small" onClick={() => addComment(p)}>
                      Add comment
                    </button>
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
