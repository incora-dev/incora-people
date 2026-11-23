"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Flag,
  Plus,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";
import { SearchableEmployeeSelect } from "@/components/ui/SearchableEmployeeSelect";
import type { PeopleTaskDto, TaskAssigneeDto } from "@/modules/tasks/types";

export function TaskWorkspace({
  tasks: initialTasks,
  assignees,
  canCreate,
  readOnlyPreview = false,
}: {
  tasks: PeopleTaskDto[];
  assignees: TaskAssigneeDto[];
  canCreate: boolean;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [tasks, setTasks] = useState(initialTasks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState("open");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === "open") return task.status === "todo";
        if (filter === "done") return task.status === "done";
        return task.category === filter;
      }),
    [filter, tasks],
  );
  const grouped = useMemo(() => groupTasksByDate(visible), [visible]);
  const taskDates = useMemo(
    () =>
      new Set(visible.flatMap((task) => (task.dueDate ? [task.dueDate] : []))),
    [visible],
  );
  const openCount = tasks.filter((task) => task.status === "todo").length;
  const onboardingCount = tasks.filter(
    (task) => task.category === "onboarding" && task.status === "todo",
  ).length;

  async function toggleTask(task: PeopleTaskDto) {
    if (readOnlyPreview) return;
    const status = task.status === "done" ? "todo" : "done";
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      setTasks((items) =>
        items.map((item) => (item.id === task.id ? { ...item, status } : item)),
      );
    }
  }

  function moveMonth(offset: number) {
    setMonthCursor(
      (value) =>
        new Date(
          Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1),
        ),
    );
  }

  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("People operations")}</p>
          <h1>{t("Tasks")}</h1>
          <p>{t("Personal work, onboarding and offboarding checklists.")}</p>
        </div>
        {canCreate && (
          <button
            className="button primary-button"
            onClick={() => setDialogOpen(true)}
          >
            <Plus size={16} /> {t("Add task")}
          </button>
        )}
      </section>

      <section className="task-summary-grid">
        <TaskSummary
          icon={<ClipboardCheck />}
          value={openCount}
          label={t("Open tasks")}
        />
        <TaskSummary
          icon={<UserRoundCheck />}
          value={onboardingCount}
          label={t("Onboarding")}
        />
        <TaskSummary
          icon={<CheckCircle2 />}
          value={tasks.length - openCount}
          label={t("Completed")}
        />
      </section>

      <nav className="section-tabs" aria-label={t("Task filters")}>
        {[
          ["open", "Open"],
          ["onboarding", "Onboarding"],
          ["offboarding", "Offboarding"],
          ["done", "Completed"],
        ].map(([value, label]) => (
          <button
            type="button"
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            key={value}
          >
            {t(label)}
          </button>
        ))}
      </nav>

      <section className="task-planner-layout">
        <div className="task-date-stream">
          {grouped.map(([date, dateTasks]) => (
            <section
              className="task-date-group"
              id={`tasks-date-${date}`}
              key={date}
            >
              <header>
                <div>
                  <span>
                    {date === "undated"
                      ? t("No due date")
                      : weekday(date, locale)}
                  </span>
                  <h2>
                    {date === "undated" ? t("Later") : formatDate(date, locale)}
                  </h2>
                </div>
                <strong>{dateTasks.length}</strong>
              </header>
              <div className="panel task-list">
                {dateTasks.map((task) => (
                  <TaskRow
                    task={task}
                    key={task.id}
                    onToggle={toggleTask}
                    t={t}
                    readOnlyPreview={readOnlyPreview}
                  />
                ))}
              </div>
            </section>
          ))}
          {visible.length === 0 && (
            <div className="panel compact-empty">
              <Check size={18} /> {t("Nothing in this list.")}
            </div>
          )}
        </div>

        <aside className="panel task-mini-calendar">
          <header>
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label={t("Previous month")}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>{monthLabel(monthCursor, locale)}</strong>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label={t("Next month")}
            >
              <ChevronRight size={17} />
            </button>
          </header>
          <div className="task-calendar-weekdays" aria-hidden="true">
            {weekdays(locale).map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="task-calendar-days">
            {calendarCells(monthCursor).map((cell, index) =>
              cell ? (
                <button
                  type="button"
                  className={taskDates.has(cell.iso) ? "has-tasks" : ""}
                  key={cell.iso}
                  onClick={() =>
                    document
                      .getElementById(`tasks-date-${cell.iso}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  disabled={!taskDates.has(cell.iso)}
                  aria-label={`${formatDate(cell.iso, locale)}${
                    taskDates.has(cell.iso) ? ` · ${t("Tasks")}` : ""
                  }`}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              ),
            )}
          </div>
          <p>
            <Flag size={14} />
            {t("Select a highlighted date to jump to its tasks.")}
          </p>
        </aside>
      </section>

      {dialogOpen && (
        <TaskDialog
          assignees={assignees}
          onClose={() => setDialogOpen(false)}
          onCreated={(task) => {
            setTasks((items) => [task, ...items]);
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

function TaskRow({
  task,
  onToggle,
  t,
  readOnlyPreview = false,
}: {
  task: PeopleTaskDto;
  onToggle: (task: PeopleTaskDto) => void;
  t: (value: string) => string;
  readOnlyPreview?: boolean;
}) {
  return (
    <article className={task.status === "done" ? "done" : ""}>
      {readOnlyPreview ? (
        <span className="task-check" aria-hidden="true">
          {task.status === "done" ? <CheckCircle2 /> : <Circle />}
        </span>
      ) : (
        <button
          className="task-check"
          onClick={() => onToggle(task)}
          aria-label={
            task.status === "done"
              ? `${t("Reopen")} ${task.title}`
              : `${t("Complete")} ${task.title}`
          }
        >
          {task.status === "done" ? <CheckCircle2 /> : <Circle />}
        </button>
      )}
      <div>
        <div className="task-row-labels">
          <span className={`task-priority ${task.priority}`}>
            {t(capitalize(task.priority))}
          </span>
          <span className={`task-category ${task.category}`}>
            {t(capitalize(task.category))}
          </span>
        </div>
        <h2>{task.title}</h2>
        {task.description && <p>{task.description}</p>}
        <small>
          {task.assigneeFirstName} {task.assigneeLastName}
        </small>
      </div>
    </article>
  );
}

function TaskSummary({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <article className="panel">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function TaskDialog({
  assignees,
  onClose,
  onCreated,
}: {
  assignees: TaskAssigneeDto[];
  onClose: () => void;
  onCreated: (task: PeopleTaskDto) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      task?: PeopleTaskDto;
      error?: string;
    };
    if (response.ok && result.task) {
      onCreated(result.task);
      return;
    }
    setError(result.error ?? t("Could not create the task."));
    setBusy(false);
  }

  return (
    <DialogBackdrop onClose={onClose} confirmWhenDirty>
      <div
        className="dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("People operations")}</p>
            <h2 id="task-dialog-title">{t("Add task")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="span-two">
            {t("Task")}
            <input name="title" required autoFocus />
          </label>
          <label>
            {t("Category")}
            <select name="category" defaultValue="general">
              <option value="general">{t("General")}</option>
              <option value="onboarding">{t("Onboarding")}</option>
              <option value="offboarding">{t("Offboarding")}</option>
            </select>
          </label>
          <label>
            {t("Priority")}
            <select name="priority" defaultValue="medium">
              <option value="low">{t("Low")}</option>
              <option value="medium">{t("Medium")}</option>
              <option value="high">{t("High")}</option>
            </select>
          </label>
          <div className="span-two">
            <DateField name="dueDate" label={t("Due date")} />
          </div>
          <label className="span-two">
            {t("Assignee")}
            <SearchableEmployeeSelect
              name="assigneeEmployeeId"
              options={assignees}
              defaultValue={assignees[0]?.id}
              required
              placeholder={t("Select employee")}
              searchPlaceholder={t("Search by name or position")}
              emptyLabel={t("No employees found.")}
            />
          </label>
          <label className="span-two">
            {t("Description")}
            <textarea name="description" rows={3} />
          </label>
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button" disabled={busy}>
              {busy ? t("Creating…") : t("Create task")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function groupTasksByDate(tasks: PeopleTaskDto[]) {
  const groups = new Map<string, PeopleTaskDto[]>();
  for (const task of tasks) {
    const key = task.dueDate ?? "undated";
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return a.localeCompare(b);
  });
}

function calendarCells(month: Date) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstWeekday =
    (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      return {
        day,
        iso: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      };
    }),
  ];
}

function weekdays(locale: "uk" | "en") {
  return locale === "uk"
    ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

function monthLabel(value: Date, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function weekday(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
