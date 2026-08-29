import { api } from "../api/client";
import { ProjectIssue, IssueComment } from "./types";

/** Sample data for now - no backend call yet. Swap point: replace `list()`/
 *  `advance()` with real requests once wired to the `project`/`task`
 *  entity-factory modules already in the backend's tool registry. */
let SAMPLE: ProjectIssue[] = [
  {
    id: "p1",
    key: "ERP-101",
    title: "Factory Floor Expansion - Unit 2 civil work sign-off",
    status: "In Progress",
    assignee: "Karthik Singh",
    priority: "High",
    comments: [
      { author: "Karthik Singh", text: "Civil work contractor confirmed start date.", at: "2026-08-01T09:00:00Z" },
    ],
    action: { label: "Check project status", prompt: "show me the status of the Factory Floor Expansion project" },
  },
  {
    id: "p2",
    key: "ERP-102",
    title: "ISO 9001:2015 internal audit findings",
    status: "Todo",
    assignee: "Rohit Desai",
    priority: "Medium",
    comments: [],
    action: { label: "List open tasks", prompt: "list open tasks for the ISO 9001 recertification project" },
  },
  {
    id: "p3",
    key: "ERP-103",
    title: "ERP rollout - user training sessions",
    status: "In Progress",
    assignee: "Vidya Subramaniam",
    priority: "Medium",
    comments: [
      { author: "System", text: "Status moved to In Progress", at: "2026-07-28T10:00:00Z", auto: true },
    ],
    action: { label: "Check task list", prompt: "list tasks for the ERP Digital Transformation Rollout project" },
  },
  {
    id: "p4",
    key: "ERP-104",
    title: "Rooftop solar - grid connection approval",
    status: "Done",
    assignee: "Sunil Krishnan",
    priority: "Low",
    comments: [
      { author: "System", text: "Status moved to Done", at: "2026-07-20T16:00:00Z", auto: true },
    ],
  },
];

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const NEXT_STATUS: Record<ProjectIssue["status"], ProjectIssue["status"]> = {
  Todo: "In Progress",
  "In Progress": "Done",
  Done: "Done",
};

export const projectsService = {
  list: (): Promise<ProjectIssue[]> => delay([...SAMPLE]),
  // Real, not sample: comments actually posted via the project.comment
  // tool (see backend routes/agent.routes.ts GET /workflow-actions,
  // modules/projects/index.ts), keyed by issue key so Projects.tsx can
  // merge them into each issue's comment list.
  realComments: async (): Promise<Record<string, IssueComment[]>> => {
    const { actions } = await api.workflowActions("project_issue");
    const byIssue: Record<string, IssueComment[]> = {};
    for (const a of actions as { recordKey: string; detail: string; createdAt: string }[]) {
      (byIssue[a.recordKey] ??= []).push({ author: "You", text: a.detail, at: a.createdAt });
    }
    return byIssue;
  },
  /** Advances the issue to its next status and appends an automatic status comment. */
  advance: (id: string): Promise<ProjectIssue> => {
    SAMPLE = SAMPLE.map((p) => {
      if (p.id !== id) return p;
      const nextStatus = NEXT_STATUS[p.status];
      return {
        ...p,
        status: nextStatus,
        comments: [...p.comments, { author: "System", text: `Status moved to ${nextStatus}`, at: new Date().toISOString(), auto: true }],
      };
    });
    return delay(SAMPLE.find((p) => p.id === id)!, 300);
  },
};
