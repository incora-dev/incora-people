"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type EmployeeSelectOption = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle?: string;
};

export function SearchableEmployeeSelect({
  name,
  options,
  defaultValue,
  required = false,
  placeholder,
  searchPlaceholder,
  emptyLabel,
}: {
  name: string;
  options: EmployeeSelectOption[];
  defaultValue?: number | string | null;
  required?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialId = defaultValue ? Number(defaultValue) : null;
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("uk-UA");
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.firstName} ${option.lastName} ${option.jobTitle ?? ""}`
        .toLocaleLowerCase("uk-UA")
        .includes(normalized),
    );
  }, [options, query]);

  return (
    <div
      className="searchable-employee-select"
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        type="hidden"
        name={name}
        value={selectedId ?? ""}
        required={required}
      />
      <button
        type="button"
        className="searchable-employee-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {selected
            ? `${selected.firstName} ${selected.lastName}`
            : placeholder}
        </span>
        {selected && !required ? (
          <X
            size={15}
            aria-label={placeholder}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(null);
            }}
          />
        ) : (
          <ChevronDown size={15} />
        )}
      </button>
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
          <div role="listbox" aria-label={placeholder}>
            {filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.id === selectedId}
                key={option.id}
                onClick={() => {
                  setSelectedId(option.id);
                  setOpen(false);
                  setQuery("");
                }}
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
                {option.id === selectedId && <Check size={15} />}
              </button>
            ))}
            {filtered.length === 0 && <p>{emptyLabel}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
