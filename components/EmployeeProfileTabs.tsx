"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export type EmployeeProfileTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function EmployeeProfileTabs({
  tabs,
  ariaLabel,
}: {
  tabs: EmployeeProfileTab[];
  ariaLabel: string;
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  if (!active) return null;

  return (
    <section className="employee-profile-workspace">
      <nav
        className="profile-section-navigation"
        aria-label={ariaLabel}
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            id={`profile-tab-${tab.id}`}
            className={tab.id === active.id ? "active" : ""}
            role="tab"
            aria-selected={tab.id === active.id}
            aria-controls={`profile-panel-${tab.id}`}
            onClick={() => setActiveId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {tabs.map((tab) => (
        <div
          className="employee-profile-tab-content"
          id={`profile-panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
          aria-labelledby={`profile-tab-${tab.id}`}
          hidden={tab.id !== active.id}
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
