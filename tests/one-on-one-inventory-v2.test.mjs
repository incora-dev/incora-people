import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canReadConversationNote,
  classifyOneOnOnePlan,
  countOneOnOnePlansByDay,
  filterAndSortOneOnOneDirectory,
  filterOneOnOnePlansByDay,
  filterOneOnOnePlansForCalendar,
  sortOneOnOneConversations,
} from "../modules/one-on-one/domain.ts";
import { isValidInventoryCountSelection } from "../modules/inventory/domain.ts";

test("one-on-one employee directory filters coverage and sorts dates with missing dates last", () => {
  const people = [
    { id: 1, firstName: "Demo4", lastName: "Zhuk", nextDueDate: "2026-12-01" },
    {
      id: 2,
      firstName: "Demo9",
      lastName: "FixtureSurname12",
      nextDueDate: null,
    },
    {
      id: 3,
      firstName: "Demo6",
      lastName: "Koval",
      nextDueDate: "2026-11-30",
    },
  ];
  const plans = [
    { id: 11, employeeId: 1, active: true, dueAt: "2026-12-01" },
    { id: 12, employeeId: 2, active: false, dueAt: "2026-10-01" },
    { id: 13, employeeId: 3, active: true, dueAt: "2026-11-30" },
  ];
  const options = {
    query: "",
    planFilter: "all",
    sort: "date-asc",
    selectedDay: null,
    locale: "uk-UA",
  };

  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, options).map(
      (person) => person.id,
    ),
    [3, 1, 2],
  );
  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, {
      ...options,
      sort: "date-desc",
    }).map((person) => person.id),
    [1, 3, 2],
  );
  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, {
      ...options,
      planFilter: "has-plan",
    }).map((person) => person.id),
    [3, 1],
  );
  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, {
      ...options,
      planFilter: "no-plan",
    }).map((person) => person.id),
    [2],
  );
  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, {
      ...options,
      selectedDay: "2026-11-30",
    }).map((person) => person.id),
    [3],
  );
  assert.deepEqual(
    filterAndSortOneOnOneDirectory(people, plans, {
      ...options,
      query: "demo9",
    }).map((person) => person.id),
    [2],
  );
});

test("planned and overdue calendars use actual due-by days and remain separate", () => {
  const plans = [
    { id: 3, active: true, dueAt: "2026-11-03" },
    { id: 1, active: true, dueAt: "2026-10-31" },
    { id: 2, active: true, dueAt: "2026-11-03" },
    { id: 4, active: false, dueAt: "2026-10-01" },
  ];
  assert.equal(classifyOneOnOnePlan(plans[0], "2026-11-03"), "planned");
  assert.equal(classifyOneOnOnePlan(plans[1], "2026-11-03"), "overdue");
  assert.equal(classifyOneOnOnePlan(plans[3], "2026-11-03"), null);
  const overdue = filterOneOnOnePlansForCalendar(
    plans,
    "overdue",
    "2026-11-03",
  );
  const planned = filterOneOnOnePlansForCalendar(
    plans,
    "planned",
    "2026-11-03",
  );
  assert.deepEqual(
    overdue.map((plan) => plan.id),
    [1],
  );
  assert.deepEqual(
    planned.map((plan) => plan.id),
    [2, 3],
  );
  assert.deepEqual([...countOneOnOnePlansByDay(planned)], [["2026-11-03", 2]]);
  assert.deepEqual(
    filterOneOnOnePlansByDay(planned, "2026-11-03").map((plan) => plan.id),
    [2, 3],
  );
  assert.equal(filterOneOnOnePlansByDay(planned, "2026-11-02").length, 0);
});

test("conversation history sorts by creation time, with stable ID ties", () => {
  const rows = [
    { id: 9, createdAt: "2026-11-01T12:00:00Z" },
    { id: 4, createdAt: "2026-11-02T12:00:00Z" },
    { id: 2, createdAt: "2026-11-01T12:00:00Z" },
  ];
  assert.deepEqual(
    sortOneOnOneConversations(rows).map((row) => row.id),
    [4, 9, 2],
  );
  assert.deepEqual(
    sortOneOnOneConversations(rows, "oldest").map((row) => row.id),
    [2, 9, 4],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [9, 4, 2],
    "sorting does not mutate source data",
  );
});

test("conversation notes are readable only by their author or explicit recipient", () => {
  const note = { authorUserId: 10, recipientUserIds: [21, 22] };
  assert.equal(canReadConversationNote(note, 10), true);
  assert.equal(canReadConversationNote(note, 21), true);
  assert.equal(canReadConversationNote(note, 23), false);
  assert.equal(canReadConversationNote(note, null), false);
});

test("inventory count selection requires explicit, unique, scope-matching items", () => {
  assert.equal(isValidInventoryCountSelection("item", 5, [5]), true);
  assert.equal(isValidInventoryCountSelection("item", 5, [6]), false);
  assert.equal(isValidInventoryCountSelection("item", 5, [5, 5]), false);
  assert.equal(isValidInventoryCountSelection("group", 2, [5, 6]), true);
  assert.equal(isValidInventoryCountSelection("group", 2, []), false);
  assert.equal(isValidInventoryCountSelection("group", 2, [5, 5]), false);
  assert.equal(isValidInventoryCountSelection("group", 0, [5]), false);
});

test("V2 migration preserves legacy records and applies only explicitly included count lines", async () => {
  const sql = await readFile(
    new URL("../migrations/0070_hr_1on1_inventory_v2.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ALTER TABLE one_on_one_meetings\s+ADD COLUMN risk_status/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS one_on_one_conversation_notes/);
  assert.match(sql, /one_on_one_meetings_updated_at_legacy_insert/);
  assert.match(sql, /ADD COLUMN included INTEGER NOT NULL DEFAULT 1/);
  assert.match(sql, /included = 1 AND counted_quantity IS NULL/);
  assert.match(
    sql,
    /line\.included = 1 AND line\.counted_quantity <> line\.expected_quantity/,
  );
  assert.doesNotMatch(
    sql,
    /DROP TABLE\s+(one_on_one_meetings|inventory_count_lines)/i,
  );
  assert.doesNotMatch(
    sql,
    /DELETE\s+FROM\s+(one_on_one_meetings|inventory_count_lines)/i,
  );
});

test("inventory UI has no implicit first item and count APIs persist explicit selection", async () => {
  const [component, api] = await Promise.all([
    readFile(
      new URL(
        "../components/inventory/InventoryWorkspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(
    component,
    /const \[itemId, setItemId\] = useState<number \| null>\(null\)/,
  );
  assert.doesNotMatch(component, /setItemId\(visibleItems\[0\]/);
  assert.match(component, /itemIds: countItemIds/);
  assert.match(api, /validateCountSelection\(/);
  assert.match(api, /command\.itemIds/);
  assert.match(api, /included\s*=\s*1/);
});
