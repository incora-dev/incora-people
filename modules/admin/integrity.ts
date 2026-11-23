import { getD1 } from "@/db";

export type IntegrityCheck = {
  key: string;
  count: number;
  severity: "critical" | "warning";
  label: string;
};

export async function getDataIntegrityReport() {
  const db = getD1();
  const statements = [
    check(
      db,
      "foreign_keys",
      "critical",
      "Broken database relationships",
      "SELECT COUNT(*) AS count FROM pragma_foreign_key_check",
    ),
    check(
      db,
      "employee_accounts",
      "critical",
      "Employees without linked user accounts",
      "SELECT COUNT(*) AS count FROM employees e LEFT JOIN users u ON u.employee_id=e.id WHERE u.id IS NULL",
    ),
    check(
      db,
      "access_policies",
      "critical",
      "Required access groups missing from configuration",
      "SELECT 4-COUNT(*) AS count FROM access_policies WHERE role IN ('super_admin','hr_admin','manager','employee')",
    ),
    check(
      db,
      "organization_references",
      "critical",
      "Employees with incomplete organization references",
      "SELECT COUNT(*) AS count FROM employees WHERE division_unit_id IS NULL OR department_unit_id IS NULL OR position_value_id IS NULL OR employment_type_id IS NULL OR (team IS NOT NULL AND trim(team)<>'' AND team_unit_id IS NULL) OR (level IS NOT NULL AND trim(level)<>'' AND level_value_id IS NULL)",
    ),
    check(
      db,
      "manager_names",
      "warning",
      "Cached manager names out of sync",
      "SELECT COUNT(*) AS count FROM employees e JOIN employees m ON m.id=e.manager_id WHERE trim(coalesce(e.manager_name,''))<>trim(m.first_name || ' ' || m.last_name)",
    ),
    check(
      db,
      "manager_cycles",
      "critical",
      "Cycles in the reporting hierarchy",
      "SELECT COUNT(*) AS count FROM employees root WHERE EXISTS (WITH RECURSIVE chain(id,path,cycle) AS (SELECT root.manager_id,printf(',%d,',root.id),0 UNION ALL SELECT employee.manager_id,path || printf('%d,',employee.id),instr(path,printf(',%d,',employee.id))>0 FROM employees employee JOIN chain ON employee.id=chain.id WHERE chain.id IS NOT NULL AND chain.cycle=0) SELECT 1 FROM chain WHERE cycle=1)",
    ),
    check(
      db,
      "leave_ledger",
      "critical",
      "Leave balances that differ from the immutable ledger",
      "SELECT COUNT(*) AS count FROM leave_balances b WHERE abs(b.used-coalesce((SELECT sum(l.delta) FROM leave_ledger l WHERE l.employee_id=b.employee_id AND l.leave_type_id=b.leave_type_id AND l.year=b.year),0))>0.0001",
    ),
    check(
      db,
      "missing_balances",
      "critical",
      "Active employees missing current-year leave balances",
      "SELECT COUNT(*) AS count FROM employees e CROSS JOIN leave_types t LEFT JOIN leave_balances b ON b.employee_id=e.id AND b.leave_type_id=t.id AND b.year=CAST(strftime('%Y','now') AS INTEGER) WHERE e.status='active' AND b.id IS NULL",
    ),
    check(
      db,
      "orphan_files",
      "critical",
      "Stored file metadata without a valid owner",
      "SELECT COUNT(*) AS count FROM stored_files f LEFT JOIN employees e ON e.id=f.owner_employee_id WHERE f.owner_employee_id IS NOT NULL AND e.id IS NULL",
    ),
    check(
      db,
      "duplicate_open_time",
      "critical",
      "Employees with multiple open time entries",
      "SELECT COUNT(*) AS count FROM (SELECT employee_id FROM time_entries WHERE clock_out IS NULL GROUP BY employee_id HAVING COUNT(*)>1)",
    ),
    check(
      db,
      "duplicate_user_links",
      "critical",
      "Employee records linked to multiple accounts",
      "SELECT COUNT(*) AS count FROM (SELECT employee_id FROM users WHERE employee_id IS NOT NULL GROUP BY employee_id HAVING COUNT(*)>1)",
    ),
    check(
      db,
      "technology_references",
      "critical",
      "Skills outside the managed technology catalogue",
      "SELECT COUNT(*) AS count FROM employee_profile_records record LEFT JOIN reference_values value ON value.id=record.reference_value_id AND value.kind='technology' WHERE record.kind='skill' AND (value.id IS NULL OR value.label<>record.title)",
    ),
    check(
      db,
      "legal_entity_references",
      "critical",
      "Private profile records with invalid legal entity references",
      "SELECT COUNT(*) AS count FROM employee_private_details detail LEFT JOIN reference_values value ON value.id=detail.legal_entity_value_id AND value.kind='legal_entity' WHERE detail.legal_entity_value_id IS NOT NULL AND value.id IS NULL",
    ),
    check(
      db,
      "compensation_records",
      "critical",
      "Compensation records with invalid employee or base-date uniqueness",
      "SELECT (SELECT COUNT(*) FROM employee_compensations c LEFT JOIN employees e ON e.id=c.employee_id WHERE e.id IS NULL OR c.amount_cents<0 OR c.kind NOT IN ('base','additional') OR c.currency NOT IN ('USD','EUR','UAH') OR c.period NOT IN ('year','month','week','day','hour') OR c.payment_schedule NOT IN ('weekly','monthly','quarterly')) + (SELECT COUNT(*) FROM (SELECT employee_id,effective_from FROM employee_compensations WHERE kind='base' GROUP BY employee_id,effective_from HAVING COUNT(*)>1)) AS count",
    ),
    check(
      db,
      "legacy_compensation_records",
      "critical",
      "Legacy compensation records require explicit reconciliation before production migration",
      "SELECT COUNT(*) AS count FROM employee_profile_records WHERE kind='compensation'",
    ),
  ];
  const results = await db.batch(statements.map((item) => item.statement));
  const checks = statements.map((item, index) => ({
    key: item.key,
    severity: item.severity,
    label: item.label,
    count: Number(
      (results[index].results?.[0] as { count?: number } | undefined)?.count ??
        0,
    ),
  }));
  return {
    checkedAt: new Date().toISOString(),
    healthy: checks.every((item) => item.count === 0),
    checks,
  };
}

function check(
  db: D1Database,
  key: string,
  severity: IntegrityCheck["severity"],
  label: string,
  sql: string,
) {
  return { key, severity, label, statement: db.prepare(sql) };
}
