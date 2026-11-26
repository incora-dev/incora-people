import assert from "node:assert/strict";
import test from "node:test";
import {
  actionsColumnWidth,
  buildExportRows,
  clampPage,
  columnMinWidth,
  columnTrack,
  compareSortValues,
  dataTableReducer,
  gridTemplateFor,
  needsFiller,
  nextHeaderSort,
  pageCountFor,
  pageList,
  pageRange,
  pageSlice,
  parseHiddenKeys,
  pruneSelection,
  resolveSortValue,
  sortOptionsFor,
  sortRows,
  toggleAllSelection,
  toggleRowSelection,
  visibleColumnsFor,
} from "../components/ui/DataTable/logic.ts";

const people = [
  { id: 1, name: "Bohdan", city: "Lviv", tag: "A-10", age: 31 },
  { id: 2, name: "anna", city: "", tag: "A-2", age: null },
  { id: 3, name: "Ярослава", city: "Kyiv", tag: "A-1", age: 25 },
  { id: 4, name: "Євген", city: null, tag: "B-1", age: 40 },
  { id: 5, name: "Андрій", city: "Odesa", tag: "A-3", age: 25 },
];
const columns = [
  { key: "name", header: "Name", cell: () => "", sortValue: (p) => p.name },
  {
    key: "city",
    header: "City",
    cell: () => "",
    sortValue: (p) => p.city,
    hideable: true,
  },
  {
    key: "age",
    header: "Age",
    cell: () => "",
    sortValue: (p) => p.age,
    hideable: true,
    defaultHidden: true,
  },
  { key: "note", header: "Note", cell: () => "" },
];
const ids = (rows) => rows.map((row) => row.id);

test("sorts ascending and descending", () => {
  const byAge = (p) => p.age;
  assert.deepEqual(ids(sortRows(people, byAge, "asc")), [3, 5, 1, 4, 2]);
  assert.deepEqual(ids(sortRows(people, byAge, "desc")), [4, 1, 3, 5, 2]);
  // Stable: equal values keep their original order in both directions.
  assert.deepEqual(ids(sortRows(people, () => "x", "desc")), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(sortRows(people, undefined, "asc")), [1, 2, 3, 4, 5]);
});

test("sorts text with the locale, ignoring case, numbers in natural order", () => {
  const byName = (p) => p.name;
  assert.deepEqual(
    sortRows(people, byName, "asc", "uk").map((p) => p.name),
    ["Андрій", "Євген", "Ярослава", "anna", "Bohdan"],
  );
  // Each locale puts its own script first.
  assert.deepEqual(
    sortRows(people, byName, "asc", "en").map((p) => p.name),
    ["anna", "Bohdan", "Андрій", "Євген", "Ярослава"],
  );
  // Ukrainian collation puts Є after Е, before Ж and Я.
  assert.ok(compareSortValues("Євген", "Жанна", "asc", "uk") < 0);
  assert.ok(compareSortValues("Євген", "Яна", "asc", "uk") < 0);
  assert.equal(compareSortValues("anna", "ANNA", "asc", "uk"), 0);
  assert.deepEqual(
    ids(sortRows(people, (p) => p.tag, "asc", "en")),
    [3, 2, 5, 1, 4],
  );
});

test("empty values go last in both directions", () => {
  const byCity = (p) => p.city;
  assert.deepEqual(ids(sortRows(people, byCity, "asc", "en")), [3, 1, 5, 2, 4]);
  assert.deepEqual(
    ids(sortRows(people, byCity, "desc", "en")),
    [5, 1, 3, 2, 4],
  );
  assert.equal(compareSortValues(undefined, "a", "desc"), 1);
  assert.equal(compareSortValues(0, null, "asc"), -1);
  assert.equal(compareSortValues(Number.NaN, 2, "asc"), 1);
  assert.equal(compareSortValues("", null, "asc"), 0);
});

test("header click and sort menu share one sort", () => {
  assert.deepEqual(nextHeaderSort(null, "name"), {
    key: "name",
    direction: "asc",
  });
  assert.deepEqual(nextHeaderSort({ key: "name", direction: "asc" }, "name"), {
    key: "name",
    direction: "desc",
  });
  assert.deepEqual(nextHeaderSort({ key: "name", direction: "desc" }, "age"), {
    key: "age",
    direction: "asc",
  });
  assert.deepEqual(
    sortOptionsFor(columns, true).map((option) => option.key),
    ["name", "city", "age"],
  );
  const code = { key: "code", label: "Code", sortValue: (p) => p.tag };
  const options = sortOptionsFor(columns, [code, { key: "name", label: "N" }]);
  assert.equal(resolveSortValue("code", columns, options)(people[0]), "A-10");
  assert.equal(resolveSortValue("name", columns, options)(people[0]), "Bohdan");
  assert.equal(resolveSortValue(undefined, columns, options), undefined);
});

test("changing the sort returns to page 1", () => {
  let state = { sort: { key: "name", direction: "asc" }, page: 1 };
  state = dataTableReducer(state, { type: "page", page: 3 });
  assert.equal(state.page, 3);
  state = dataTableReducer(state, {
    type: "sort",
    sort: nextHeaderSort(state.sort, "name"),
  });
  assert.deepEqual(state, {
    sort: { key: "name", direction: "desc" },
    page: 1,
  });
  state = dataTableReducer(state, { type: "page", page: 0 });
  assert.equal(state.page, 1);
});

test("page list shows gaps around the current page", () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageList(1, 10), [1, 2, 3, 4, 5, "gap", 10]);
  assert.deepEqual(pageList(4, 10), [1, 2, 3, 4, 5, "gap", 10]);
  assert.deepEqual(pageList(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
  assert.deepEqual(pageList(7, 10), [1, "gap", 6, 7, 8, 9, 10]);
  assert.deepEqual(pageList(10, 10), [1, "gap", 6, 7, 8, 9, 10]);
});

test("pages are counted and clamped to their bounds", () => {
  assert.equal(pageCountFor(0, 20), 1);
  assert.equal(pageCountFor(20, 20), 1);
  assert.equal(pageCountFor(21, 20), 2);
  assert.equal(pageCountFor(500, false), 1);
  assert.equal(clampPage(5, 2), 2);
  assert.equal(clampPage(0, 2), 1);
  assert.equal(clampPage(Number.NaN, 3), 1);
  const rows = Array.from({ length: 45 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(rows, 3, 20), [41, 42, 43, 44, 45]);
  assert.equal(pageSlice(rows, 1, false).length, 45);
  assert.deepEqual(pageRange(1, 20, 45), { from: 1, to: 20 });
  assert.deepEqual(pageRange(3, 20, 45), { from: 41, to: 45 });
  assert.deepEqual(pageRange(1, 20, 0), { from: 0, to: 0 });
  assert.deepEqual(pageRange(1, false, 7), { from: 1, to: 7 });
});

test("export uses visible columns, exportValue and the given row order", () => {
  const exportColumns = [
    {
      key: "name",
      header: "Name",
      cell: () => "",
      exportHeader: ["Name", "Tag"],
      exportValue: (p) => [p.name, p.tag],
    },
    ...columns.slice(1),
  ];
  const visible = visibleColumnsFor(exportColumns, ["city", "age"]);
  assert.deepEqual(
    visible.map((column) => column.key),
    ["name", "note"],
  );
  const sorted = sortRows(people, (p) => p.age, "desc");
  const rows = buildExportRows(sorted.slice(0, 2), visible, (key) =>
    key === "Name" ? "Ім’я" : key,
  );
  assert.deepEqual(rows, [
    ["Ім’я", "Tag", "Note"],
    ["Євген", "B-1", ""],
    ["Bohdan", "A-10", ""],
  ]);
  // Without exportValue the sort value is exported; empty values are blank.
  assert.deepEqual(
    buildExportRows(people.slice(0, 2), visibleColumnsFor(columns, [])),
    [
      ["Name", "City", "Age", "Note"],
      ["Bohdan", "Lviv", "31", ""],
      ["anna", "", "", ""],
    ],
  );
});

test("hidden columns come from defaults or storage, never unhideable ones", () => {
  assert.deepEqual(parseHiddenKeys(null, columns), ["age"]);
  assert.deepEqual(parseHiddenKeys('["city","name","x"]', columns), ["city"]);
  assert.deepEqual(parseHiddenKeys("[]", columns), []);
  assert.deepEqual(parseHiddenKeys("{bad", columns), ["age"]);
  assert.deepEqual(
    visibleColumnsFor(columns, ["age", "name"]).map((column) => column.key),
    ["name", "city", "note"],
  );
});

test("one grid template covers selection, columns and actions", () => {
  assert.equal(
    gridTemplateFor(columns.slice(0, 2), {
      selectable: true,
      actionsWidth: actionsColumnWidth(1),
    }),
    "44px max-content max-content 1fr calc(42px + var(--data-table-inset, 15px))",
  );
  assert.equal(
    actionsColumnWidth(2),
    "calc(80px + var(--data-table-inset, 15px))",
  );
  assert.equal(gridTemplateFor([{ ...columns[0], width: "200px" }]), "200px");
});

test("columns grow to their content unless truncated", () => {
  const base = { key: "a", header: "A", cell: () => "" };
  assert.equal(columnTrack(base), "max-content");
  assert.equal(columnMinWidth(base), "130px");
  const wide = { ...base, minWidth: 280, grow: 1.4 };
  assert.equal(columnTrack(wide), "minmax(max-content, 1.4fr)");
  assert.equal(columnMinWidth(wide), "280px");
  const truncated = { ...wide, truncate: true };
  assert.equal(columnTrack(truncated), "minmax(280px, 1.4fr)");
  assert.equal(columnMinWidth(truncated), undefined);
  assert.equal(columnTrack({ ...base, truncate: true }), "130px");
  // Spare width goes to an empty track only when no column takes it.
  assert.equal(needsFiller([base, truncated]), false);
  assert.equal(needsFiller([base, { ...base, truncate: true }]), true);
  assert.equal(gridTemplateFor([base, base]), "max-content max-content 1fr");
  assert.equal(
    gridTemplateFor([base, wide]),
    "max-content minmax(max-content, 1.4fr)",
  );
  const raw = { ...wide, width: "90px" };
  assert.equal(columnTrack(raw), "90px");
  assert.equal(columnMinWidth(raw), undefined);
});

test("selection toggles rows and the whole page", () => {
  assert.deepEqual(toggleRowSelection([1], 2), [1, 2]);
  assert.deepEqual(toggleRowSelection([1, 2], 1), [2]);
  assert.deepEqual(toggleAllSelection([9, 1], [1, 2, 3]), [9, 1, 2, 3]);
  assert.deepEqual(toggleAllSelection([9, 1, 2, 3], [1, 2, 3]), [9]);
});

test("sort menu drops options that would not sort anything", () => {
  const options = sortOptionsFor(columns, [
    { key: "code", label: "Code", sortValue: (p) => p.tag },
    { key: "name", label: "Name" },
    { key: "note", label: "Note" },
    { key: "missing", label: "Missing" },
  ]);
  assert.deepEqual(
    options.map((option) => option.key),
    ["code", "name"],
  );
});

test("export cells line up with their headers", () => {
  const row = { name: "Laptop", tag: "A-1", extra: "x", date: 1795219200000 };
  const exportColumns = [
    {
      key: "long",
      header: "Name",
      cell: () => "",
      // More values than headers: cut to one.
      exportValue: (r) => [r.name, r.tag, r.extra],
    },
    {
      key: "short",
      header: "Ignored",
      exportHeader: ["Tag", "Extra"],
      cell: () => "",
      // Fewer values than headers: padded.
      exportValue: (r) => [r.tag],
    },
    {
      key: "date",
      header: "Date",
      // Plain-text cell is exported as shown, not the raw sort value.
      cell: () => "2026-11-20",
      sortValue: (r) => r.date,
    },
    {
      key: "jsx",
      header: "Rich",
      cell: () => ({ type: "span" }),
      sortValue: (r) => r.name,
    },
    { key: "none", header: "None", cell: () => null },
  ];
  assert.deepEqual(buildExportRows([row], exportColumns), [
    ["Name", "Tag", "Extra", "Date", "Rich", "None"],
    ["Laptop", "A-1", "", "2026-11-20", "Laptop", ""],
  ]);
});

test("selection keeps only keys that still have a row", () => {
  assert.deepEqual(pruneSelection([1, 4, 9], [1, 2, 3, 4]), [1, 4]);
  assert.deepEqual(pruneSelection([], [1]), []);
});
