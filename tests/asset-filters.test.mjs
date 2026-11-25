import assert from "node:assert/strict";
import test from "node:test";
import {
  assetEmploymentCycle,
  buildAssetFilterOptions,
  emptyAssetFilters,
  matchesAssetFilters,
} from "../modules/assets/filter-options.ts";

const assigned = {
  category: "laptop",
  department: "Engineering",
  team: "Frontend",
  division: "Ukraine",
  location: "Lviv",
  assignee: { id: 7, cycle: "working" },
};
const free = {
  category: "phone",
  department: "",
  division: "",
  location: "",
  assignee: null,
};
const withFilter = (key, values, presence = null) => ({
  ...emptyAssetFilters,
  [key]: { values, presence },
});

test("asset filters combine values with OR and groups with AND", () => {
  const filters = {
    ...withFilter("category", ["laptop", "phone"]),
    location: { values: ["Lviv"], presence: null },
  };
  assert.equal(matchesAssetFilters(assigned, filters), true);
  assert.equal(matchesAssetFilters(free, filters), false);
  assert.equal(matchesAssetFilters(free, emptyAssetFilters), true);
});

test("assignment status matches assigned and unassigned assets", () => {
  const unassigned = withFilter("assignment", ["unassigned"]);
  assert.equal(matchesAssetFilters(free, unassigned), true);
  assert.equal(matchesAssetFilters(assigned, unassigned), false);
  const both = withFilter("assignment", ["assigned", "unassigned"]);
  assert.equal(matchesAssetFilters(free, both), true);
  assert.equal(matchesAssetFilters(assigned, both), true);
});

test("location, division and department come from the asset itself", () => {
  const stored = { ...free, location: "Kyiv", division: "Europe" };
  assert.equal(
    matchesAssetFilters(stored, withFilter("location", ["Kyiv"])),
    true,
  );
  assert.equal(
    matchesAssetFilters(stored, withFilter("division", ["Europe"])),
    true,
  );
});

test("empty and not-empty test whether the field has a value", () => {
  assert.equal(
    matchesAssetFilters(free, withFilter("location", [], "empty")),
    true,
  );
  assert.equal(
    matchesAssetFilters(assigned, withFilter("location", [], "empty")),
    false,
  );
  assert.equal(
    matchesAssetFilters(assigned, withFilter("assignee", [], "filled")),
    true,
  );
});

test("department filter matches a department or one of its teams", () => {
  assert.equal(
    matchesAssetFilters(
      assigned,
      withFilter("department", ["department:Engineering"]),
    ),
    true,
  );
  assert.equal(
    matchesAssetFilters(assigned, withFilter("department", ["team:Frontend"])),
    true,
  );
  assert.equal(
    matchesAssetFilters(assigned, withFilter("department", ["team:Design"])),
    false,
  );
});

test("employment cycles group directory lifecycle stages", () => {
  assert.equal(assetEmploymentCycle("on_leave"), "working");
  assert.equal(assetEmploymentCycle("probation"), "hired");
  assert.equal(assetEmploymentCycle("awaiting_invitation"), "hired");
  assert.equal(assetEmploymentCycle("terminated"), "terminated");
});

test("filter options merge departments and expose only public person fields", () => {
  const options = buildAssetFilterOptions(
    [
      { id: 1, type: "division", name: "Ukraine", parentId: null },
      { id: 2, type: "division", name: "Europe", parentId: null },
      { id: 3, type: "department", name: "Sales", parentId: 1 },
      { id: 4, type: "department", name: "Sales", parentId: 2 },
      { id: 5, type: "team", name: "Inbound", parentId: 3 },
      { id: 6, type: "team", name: "Outbound", parentId: 4 },
    ],
    [
      {
        id: 9,
        firstName: "Demo",
        lastName: "Person",
        jobTitle: "CTO",
        location: "Kyiv",
        photoFileId: null,
        email: "person@example.test",
      },
    ],
  );
  assert.deepEqual(options.departments, [
    { name: "Sales", teams: ["Inbound", "Outbound"] },
  ]);
  assert.deepEqual(options.divisions, ["Europe", "Ukraine"]);
  assert.deepEqual(options.locations, ["Kyiv"]);
  assert.deepEqual(Object.keys(options.people[0]).sort(), [
    "firstName",
    "id",
    "jobTitle",
    "lastName",
    "photoFileId",
  ]);
});
