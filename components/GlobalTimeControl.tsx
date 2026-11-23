"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Building2,
  Coffee,
  ExternalLink,
  HousePlug,
  Play,
  Square,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { useDismissibleLayer } from "@/components/ui/useDismissibleLayer";
import type {
  BreakEntryDto as BreakEntry,
  TimeEntryDto as Entry,
} from "@/modules/time/types";

export function GlobalTimeControl() {
  const { t } = useI18n();
  const layerRef = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<Entry | undefined>();
  const [openBreak, setOpenBreak] = useState<BreakEntry | undefined>();
  const [linked, setLinked] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedMode, setSelectedMode] = useState<"office" | "remote" | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  useDismissibleLayer(menuOpen, layerRef, () => setMenuOpen(false));

  useEffect(() => {
    fetch("/api/time/status")
      .then(
        async (response) =>
          (await response.json()) as {
            linked: boolean;
            entry?: Entry;
            openBreak?: BreakEntry;
          },
      )
      .then((data) => {
        setLinked(data.linked);
        setEntry(data.entry);
        setSelectedMode(data.entry?.workMode ?? null);
        setOpenBreak(data.openBreak);
      })
      .catch(() => setLinked(false));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function toggle() {
    if (!entry && !selectedMode) {
      setError(t("Choose where you are working before starting."));
      setMenuOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(
      entry ? "/api/time/clock-out" : "/api/time/clock-in",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry ? {} : { workMode: selectedMode }),
      },
    );
    const result = (await response.json()) as {
      entry?: Entry;
      mode?: "started" | "already_running" | "stopped" | "already_stopped";
      error?: string;
    };
    if (response.ok) {
      setEntry(
        result.mode === "started" || result.mode === "already_running"
          ? result.entry
          : undefined,
      );
      if (result.mode === "stopped" || result.mode === "already_stopped") {
        setSelectedMode(null);
      }
      setOpenBreak(undefined);
    } else {
      setError(result.error ?? "Could not update the timer.");
      setMenuOpen(true);
    }
    setBusy(false);
  }

  async function toggleBreak() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/time/break/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        openBreak
          ? { action: "end", breakId: openBreak.id }
          : { action: "start" },
      ),
    });
    const result = (await response.json()) as {
      entry?: BreakEntry;
      mode?: "break_start" | "break_end";
      error?: string;
    };
    if (response.ok && result.entry)
      setOpenBreak(result.mode === "break_start" ? result.entry : undefined);
    else {
      setError(result.error ?? "Could not update the break.");
      setMenuOpen(true);
    }
    setBusy(false);
  }

  const elapsed = entry
    ? formatElapsed(now - new Date(entry.clockIn).getTime())
    : "";
  if (!linked) return null;

  return (
    <div className="dropdown-anchor global-timer" ref={layerRef}>
      <div
        className={
          entry ? "global-timer-control active" : "global-timer-control"
        }
      >
        <button
          className="timer-main"
          onClick={toggle}
          disabled={busy}
          aria-label={entry ? t("Stop time tracker") : t("Start time tracker")}
        >
          {entry ? (
            <Square size={13} fill="currentColor" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          <span>
            {busy
              ? t("Saving…")
              : entry
                ? openBreak
                  ? `${t("On break")} · ${elapsed}`
                  : `${t("Stop")} · ${elapsed}`
                : t("Start timer")}
          </span>
        </button>
        <button
          className="timer-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={t("Time tracker options")}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {menuOpen && (
        <div className="dropdown-panel timer-menu">
          <div className="timer-menu-status">
            <Clock3 size={17} />
            <span>
              <strong>
                {entry ? t("Tracking now") : t("Timer is stopped")}
              </strong>
              <small>
                {entry
                  ? `${t("Started at")} ${entry.clockIn.slice(11, 16)} · ${elapsed}`
                  : t("Start tracking without leaving this page")}
              </small>
            </span>
          </div>
          {error && <p className="timer-error">{error}</p>}
          {!entry && (
            <div className="timer-work-mode-picker">
              <span>{t("Where are you working?")}</span>
              <div role="radiogroup" aria-label={t("Work mode")}>
                <button
                  className={selectedMode === "office" ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={selectedMode === "office"}
                  onClick={() => {
                    setSelectedMode("office");
                    setError("");
                  }}
                >
                  <Building2 size={15} /> {t("In office")}
                </button>
                <button
                  className={selectedMode === "remote" ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={selectedMode === "remote"}
                  onClick={() => {
                    setSelectedMode("remote");
                    setError("");
                  }}
                >
                  <HousePlug size={15} /> {t("Remote")}
                </button>
              </div>
              <button
                className="button primary-button full-button"
                type="button"
                disabled={!selectedMode || busy}
                onClick={toggle}
              >
                <Play size={14} fill="currentColor" /> {t("Start timer")}
              </button>
            </div>
          )}
          {entry && (
            <button onClick={toggleBreak}>
              <Coffee size={15} />
              <span>
                <strong>{openBreak ? t("End break") : t("Start break")}</strong>
                <small>{t("Keep the work session running")}</small>
              </span>
            </button>
          )}
          <Link href="/time" onClick={() => setMenuOpen(false)}>
            <ExternalLink size={15} />
            <span>
              <strong>{t("Open timesheet")}</strong>
              <small>{t("Calendar, entries and corrections")}</small>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
