import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEmploymentTenureDays,
  calculateTotalExperienceDays,
  formatEmployeeTenure,
  tenureYears,
} from "../modules/people/tenure.ts";

test("tenure shows elapsed days instead of zero months", () => {
  assert.equal(
    formatEmployeeTenure(
      { startDate: "2026-07-28", status: "active" },
      "uk",
      "2026-08-13",
    ),
    "16 днів",
  );
});

test("future start dates are explicit and do not match tenure filters", () => {
  assert.equal(
    formatEmployeeTenure(
      { startDate: "2026-08-20", status: "active" },
      "uk",
      "2026-08-13",
    ),
    "Початок через 7 днів",
  );
  assert.equal(
    tenureYears({ startDate: "2026-08-20", status: "active" }, "2026-08-13"),
    -1,
  );
});

test("terminated employee tenure freezes at last working day", () => {
  const employee = {
    startDate: "2020-01-01",
    status: "inactive",
    lastWorkingDay: "2024-01-01",
  };
  assert.equal(formatEmployeeTenure(employee, "uk", "2026-09-30"), "4 р.");
  assert.equal(
    calculateEmploymentTenureDays(employee, "2026-09-30"),
    calculateEmploymentTenureDays(employee, "2030-09-30"),
  );
});

test("missing termination date falls back to today", () => {
  assert.equal(
    calculateEmploymentTenureDays(
      { startDate: "2024-01-01", status: "inactive" },
      "2026-01-01",
    ),
    731,
  );
});

test("same-day and one-day employment boundaries are stable", () => {
  const sameDay = {
    startDate: "2026-09-30",
    status: "inactive",
    lastWorkingDay: "2026-09-30",
  };
  assert.equal(calculateEmploymentTenureDays(sameDay, "2028-01-01"), 0);
  assert.equal(
    formatEmployeeTenure(sameDay, "uk", "2028-01-01"),
    "Перший день",
  );
  assert.equal(
    calculateEmploymentTenureDays(
      { ...sameDay, lastWorkingDay: "2026-10-01" },
      "2028-01-01",
    ),
    1,
  );
});

test("total work experience does not grow after termination", () => {
  const employee = {
    startDate: "2020-01-01",
    status: "inactive",
    lastWorkingDay: "2024-01-01",
  };
  assert.equal(
    calculateTotalExperienceDays(365, employee, "2026-09-30"),
    calculateTotalExperienceDays(365, employee, "2030-09-30"),
  );
  assert.equal(
    calculateTotalExperienceDays(null, employee, "2026-09-30"),
    null,
  );
});
