import { useSession } from "../context/SessionContext";

export function DemoBanner() {
  const { isDemo } = useSession();
  if (!isDemo) return null;
  return (
    <div className="demo-banner">
      Demo login — viewing only. Fields show real saved settings, but nothing can be saved and secrets are hidden.
    </div>
  );
}
