import { UserCategorySettings } from "../components/UserCategorySettings";

export function EmailSettings() {
  return (
    <UserCategorySettings
      category="email"
      title="Email settings"
      subtitle="Per-person email preferences — reply-to, signature, and an optional SMTP override for someone who sends through a different mailbox than the org's shared server (see Global settings)."
    />
  );
}
