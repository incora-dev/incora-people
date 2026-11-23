"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Maximize2, Minus, Move, Plus } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

type OrgPerson = {
  id: number;
  managerId: number | null;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  photoFileId: string | null;
};

export function OrgChart({ people }: { people: OrgPerson[] }) {
  const { t } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const roots = people.filter(
    (person) =>
      person.managerId === null ||
      !people.some((candidate) => candidate.id === person.managerId),
  );
  function reset() {
    setZoom(1);
    viewport.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }
  return (
    <>
      <div className="org-chart-controls">
        <span>
          <Move size={15} /> {t("Drag to move")}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
          aria-label={t("Zoom out")}
        >
          <Minus size={17} />
        </button>
        <strong>{Math.round(zoom * 100)}%</strong>
        <button
          type="button"
          className="icon-button"
          onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
          aria-label={t("Zoom in")}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={reset}
          aria-label={t("Reset view")}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div
        className="org-viewport"
        ref={viewport}
        onPointerDown={(event) => {
          const current = viewport.current;
          if (!current || (event.target as HTMLElement).closest("a,button"))
            return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: current.scrollLeft,
            top: current.scrollTop,
          };
          current.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = viewport.current;
          if (!current || !drag.current) return;
          current.scrollLeft =
            drag.current.left - (event.clientX - drag.current.x);
          current.scrollTop =
            drag.current.top - (event.clientY - drag.current.y);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="org-tree" style={{ zoom }}>
          {roots.map((root) => (
            <OrgBranch person={root} people={people} depth={0} key={root.id} />
          ))}
        </div>
      </div>
    </>
  );
}

function OrgBranch({
  person,
  people,
  depth,
}: {
  person: OrgPerson;
  people: OrgPerson[];
  depth: number;
}) {
  const reports = people.filter(
    (candidate) => candidate.managerId === person.id,
  );
  return (
    <div className="org-branch">
      <Link
        className={`org-person level-${Math.min(depth, 3)}`}
        href={`/employees/${person.id}`}
      >
        <span className="avatar">
          {person.photoFileId ? (
            <Image
              src={`/api/files/${person.photoFileId}`}
              alt=""
              width={42}
              height={42}
              unoptimized
            />
          ) : (
            <>
              {person.firstName[0]}
              {person.lastName[0]}
            </>
          )}
        </span>
        <span>
          <strong>
            {person.firstName} {person.lastName}
          </strong>
          <small>{person.jobTitle}</small>
          <em>{person.department}</em>
        </span>
        {reports.length > 0 && <b>{reports.length}</b>}
      </Link>
      {reports.length > 0 && (
        <div className="org-reports">
          {reports.map((report) => (
            <OrgBranch
              person={report}
              people={people}
              depth={depth + 1}
              key={report.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
