"use client";

import { useEffect, useState } from "react";
import { Building2, HousePlug } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

export type WorkMode = "office" | "remote";

export function WorkModeSwitch({
  variant = "compact",
}: {
  variant?: "compact" | "full";
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<WorkMode>("office");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/work-mode")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { mode?: WorkMode };
        if (data.mode) setMode(data.mode);
      })
      .finally(() => setLoading(false));

    function sync(event: Event) {
      const next = (event as CustomEvent<{ mode: WorkMode }>).detail?.mode;
      if (next) setMode(next);
    }
    window.addEventListener("incora-work-mode", sync);
    return () => window.removeEventListener("incora-work-mode", sync);
  }, []);

  async function toggle() {
    if (busy || loading) return;
    const previous = mode;
    const next: WorkMode = mode === "office" ? "remote" : "office";
    setMode(next);
    setBusy(true);
    const response = await fetch("/api/work-mode", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    if (!response.ok) setMode(previous);
    else {
      window.dispatchEvent(
        new CustomEvent("incora-work-mode", { detail: { mode: next } }),
      );
    }
    setBusy(false);
  }

  const remote = mode === "remote";
  return (
    <button
      type="button"
      className={`work-mode-switch ${variant} ${remote ? "remote" : "office"}`}
      role="switch"
      aria-checked={remote}
      aria-label={t("Work mode")}
      onClick={toggle}
      disabled={loading || busy}
    >
      <span className="work-mode-icon">
        {remote ? <HousePlug size={15} /> : <Building2 size={15} />}
      </span>
      <span className="work-mode-copy">
        {variant === "full" && <small>{t("Working today")}</small>}
        <strong>{remote ? t("Remote") : t("In office")}</strong>
      </span>
      <span className="work-mode-track" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
