import assert from "node:assert/strict";
import test from "node:test";

const { localizeNotification } = await import("../lib/notification-text.ts");

test("localizes known leave and reimbursement notifications for Ukrainian users", () => {
  assert.deepEqual(
    localizeNotification(
      {
        title: "New leave request",
        message: "sofiia@example.com requested 2 Vacation days.",
      },
      "uk",
    ),
    {
      title: "Новий запит на відпустку",
      message: "sofiia@example.com подав(ла) запит на відпустку: 2 дн.",
    },
  );
  assert.deepEqual(
    localizeNotification(
      {
        title: "New reimbursement request",
        message: "danylo@example.com submitted 320 грн for Sport.",
      },
      "uk",
    ),
    {
      title: "Новий запит на відшкодування",
      message: "danylo@example.com подав(ла) витрату 320 грн: спорт.",
    },
  );
});

test("keeps English and user-authored announcement notifications unchanged", () => {
  const notification = {
    title: "Team sync",
    message: "Join us at 16:30.",
  };
  assert.deepEqual(localizeNotification(notification, "en"), notification);
  assert.deepEqual(localizeNotification(notification, "uk"), notification);
});
