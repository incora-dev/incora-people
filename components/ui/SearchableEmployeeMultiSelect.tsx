"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type EmployeeMultiSelectOption = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle?: string;
};

export function SearchableEmployeeMultiSelect({
  name,
  options,
  defaultValue = [],
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  selectedLabel,
}: {
  name: string;
  options: EmployeeMultiSelectOption[];
  defaultValue?: number[];
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  selectedLabel: (count: number) => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    [...new Set(defaultValue)].filter((id) =>
      options.some((item) => item.id === id),
    ),
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("uk-UA");
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.firstName} ${option.lastName} ${option.jobTitle ?? ""}`
        .toLocaleLowerCase("uk-UA")
        .includes(normalized),
    );
  }, [options, query]);

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <div
      className="searchable-employee-select searchable-employee-multi-select"
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <span className="field-label">{label}</span>
      <input type="hidden" name={name} value={JSON.stringify(selectedIds)} />
      <button
        type="button"
        className="searchable-employee-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {selected.length > 0 ? selectedLabel(selected.length) : placeholder}
        </span>
        <ChevronDown size={15} />
      </button>
      {selected.length > 0 && (
        <div className="searchable-employee-chips">
          {selected.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => toggle(option.id)}
              aria-label={`${option.firstName} ${option.lastName}`}
            >
              {option.firstName} {option.lastName}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="searchable-employee-menu">
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </label>
          <div role="listbox" aria-label={label} aria-multiselectable="true">
            {filtered.map((option) => {
              const isSelected = selectedIds.includes(option.id);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={option.id}
                  onClick={() => toggle(option.id)}
                >
                  <span className="avatar small">
                    {option.firstName[0]}
                    {option.lastName[0]}
                  </span>
                  <span>
                    <strong>
                      {option.firstName} {option.lastName}
                    </strong>
                    {option.jobTitle && <small>{option.jobTitle}</small>}
                  </span>
                  {isSelected && <Check size={15} />}
                </button>
              );
            })}
            {filtered.length === 0 && <p>{emptyLabel}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
