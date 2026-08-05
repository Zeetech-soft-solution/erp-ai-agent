import { UserCategorySettings } from "../components/UserCategorySettings";

export function ProjectSettings() {
  return (
    <UserCategorySettings
      category="projplan"
      title="Project settings"
      subtitle="Per-person project-planning preferences — default project, preferred view, and assignment notifications."
    />
  );
}
