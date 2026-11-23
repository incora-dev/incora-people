"use client";

import { FormEvent, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { ReferenceValueDto } from "@/modules/admin/types";

const groups = [
  "technology",
  "level",
  "position",
  "legal_entity",
  "employment_type",
] as const;

export function ReferenceDataSettings({
  initialValues,
}: {
  initialValues: ReferenceValueDto[];
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [message, setMessage] = useState("");

  async function create(
    event: FormEvent<HTMLFormElement>,
    kind: ReferenceValueDto["kind"],
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") ?? "");
    const response = await fetch(
      kind === "employment_type"
        ? "/api/admin/employment-types"
        : "/api/admin/reference-values",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, label, sortOrder: 100 }),
      },
    );
    const result = (await response.json()) as {
      item?: ReferenceValueDto;
      error?: string;
    };
    if (response.ok && result.item) {
      setValues((items) => [...items, result.item!]);
      form.reset();
      setMessage(t("Reference value added."));
    } else setMessage(result.error ?? t("Could not save reference value."));
  }

  async function save(item: ReferenceValueDto, form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await fetch(
      item.kind === "employment_type"
        ? `/api/admin/employment-types/${item.id}`
        : `/api/admin/reference-values/${item.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: data.get("label"),
          sortOrder: data.get("sortOrder"),
          active: data.get("active") === "on",
        }),
      },
    );
    const result = (await response.json()) as {
      item?: ReferenceValueDto;
      error?: string;
    };
    if (response.ok && result.item) {
      setValues((items) =>
        items.map((value) => (value.id === item.id ? result.item! : value)),
      );
      setMessage(t("Reference value saved."));
    } else setMessage(result.error ?? t("Could not save reference value."));
  }

  return (
    <div className="reference-data-grid">
      {message && (
        <p className="settings-toast span-two">
          <Check size={14} /> {message}
        </p>
      )}
      {groups.map((kind) => (
        <article className="panel reference-data-card" key={kind}>
          <header>
            <div>
              <h3>
                {t(
                  kind === "technology"
                    ? "Technologies"
                    : kind === "level"
                      ? "Levels"
                      : kind === "position"
                        ? "Positions"
                        : kind === "legal_entity"
                          ? "Legal entities"
                          : "Employment types",
                )}
              </h3>
              <p>{t("Managed values used in profiles and people filters.")}</p>
            </div>
          </header>
          <form
            className="reference-add-row"
            onSubmit={(event) => create(event, kind)}
          >
            <input name="label" required placeholder={t("New value")} />
            <button className="button primary-button">
              <Plus size={15} /> {t("Add")}
            </button>
          </form>
          <div className="reference-value-list">
            {values
              .filter((item) => item.kind === kind)
              .map((item) => (
                <form
                  key={item.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(item, event.currentTarget);
                  }}
                >
                  <input name="label" defaultValue={item.label} required />
                  <input
                    name="sortOrder"
                    type="number"
                    min="0"
                    defaultValue={item.sortOrder}
                    aria-label={t("Order")}
                  />
                  <label className="inline-check">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={item.active}
                    />{" "}
                    {t("Active")}
                  </label>
                  <button
                    className="button ghost-button"
                    aria-label={`${t("Save")} ${item.label}`}
                  >
                    {t("Save")}
                  </button>
                </form>
              ))}
          </div>
        </article>
      ))}
    </div>
  );
}
