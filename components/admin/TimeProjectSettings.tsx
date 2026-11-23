"use client";

import { FormEvent, useState } from "react";
import { Archive, BriefcaseBusiness, Plus, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { TimeProjectDto } from "@/modules/admin/types";

export function TimeProjectSettings({
  projects: initialProjects,
  onMessage,
}: {
  projects: TimeProjectDto[];
  onMessage?: (message: string) => void;
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState(initialProjects);
  const [busy, setBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState("");

  function notify(message: string) {
    if (onMessage) onMessage(message);
    else setLocalMessage(message);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const response = await fetch("/api/admin/time-projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
    });
    const result = (await response.json()) as {
      project?: TimeProjectDto;
      error?: string;
    };
    if (response.ok && result.project) {
      setProjects((items) =>
        [...items, result.project!].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      form.reset();
      notify(t("Project created."));
    } else notify(result.error ?? t("Could not create project."));
    setBusy(false);
  }

  async function setActive(project: TimeProjectDto) {
    const response = await fetch(`/api/admin/time-projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !project.active }),
    });
    const result = (await response.json()) as {
      project?: TimeProjectDto;
      error?: string;
    };
    if (response.ok && result.project) {
      setProjects((items) =>
        items.map((item) => (item.id === project.id ? result.project! : item)),
      );
      notify(project.active ? t("Project archived.") : t("Project activated."));
    } else notify(result.error ?? t("Could not update project."));
  }

  return (
    <section className="panel data-panel time-project-settings">
      <div className="data-panel-heading">
        <div>
          <h2>
            <BriefcaseBusiness size={18} /> {t("Time projects")}
          </h2>
          <span>
            {t(
              "Projects available for time tracking. Archived projects stay in historical entries.",
            )}
          </span>
        </div>
      </div>
      {localMessage && (
        <p className="settings-toast inline-toast">{localMessage}</p>
      )}
      <form className="time-project-create" onSubmit={create}>
        <input name="name" placeholder={t("Project name")} required />
        <input name="code" placeholder={t("Code")} maxLength={20} required />
        <button className="button primary-button" disabled={busy}>
          <Plus size={15} /> {t("Add project")}
        </button>
      </form>
      <div className="time-project-list">
        {projects.map((project) => (
          <div key={project.id}>
            <span>
              <strong>{project.code}</strong>
              <small>{project.name}</small>
            </span>
            <span
              className={`status-badge ${project.active ? "active" : "inactive"}`}
            >
              {project.active ? t("Active") : t("Archived")}
            </span>
            <button
              className="button ghost-button"
              onClick={() => setActive(project)}
            >
              {project.active ? <Archive size={14} /> : <RotateCcw size={14} />}
              {project.active ? t("Archive") : t("Activate")}
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="compact-empty">{t("No time projects yet.")}</p>
        )}
      </div>
    </section>
  );
}
