import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCompensationRouteHandlers } from "../modules/compensation/handlers.ts";
import {
  compensationMutationAccessResponse,
  createCompensationMutationHandlers,
} from "../modules/compensation/management-handlers.ts";
import { compensationUpdateSchema } from "../modules/compensation/contracts.ts";
import { mergeCompensationUpdate } from "../modules/compensation/domain.ts";
import { createFileDownloadHandler } from "../modules/files/download-handler.ts";
import { canReadCompensationAttachment } from "../modules/people/privacy.ts";
import { canReadEmployeeSensitiveData } from "../modules/people/privacy.ts";
import {
  commitBeforeAttachmentCleanup,
  deleteCoreBeforeAttachmentCleanup,
  isCompensationAttachmentForRecord,
} from "../modules/compensation/security.ts";
import { storedFileDeletionAuditDetails } from "../modules/files/audit.ts";

const amountCents = 987654321;

function user(employeeId, role = "employee") {
  return {
    userId: employeeId,
    email: `person-${employeeId}@example.test`,
    role,
    employeeId,
  };
}

function compensationHandlers(currentUser) {
  const audit = [];
  const record = { id: 19, employeeId: 7, amountCents, currency: "UAH" };
  const handlers = createCompensationRouteHandlers({
    getCurrentUser: async () => {
      if (currentUser === null) {
        const error = new Error("No session");
        error.name = "AuthenticationRequiredError";
        throw error;
      }
      return currentUser;
    },
    getAccessPolicy: async (viewer) => ({
      viewSensitiveData:
        viewer.role === "hr_admin" || viewer.role === "super_admin",
    }),
    canReadSensitiveData: canReadEmployeeSensitiveData,
    employeeExists: async () => true,
    getCompensationList: async () => [
      {
        id: 19,
        employeeId: 7,
        kind: "base",
        label: null,
        effectiveFrom: "2024-01-01",
        currency: "UAH",
        period: "month",
        paymentSchedule: "monthly",
        comment: "Synthetic fixture",
        isCurrent: true,
        amountCents,
        amount: "9876543.21",
        attachments: [
          { id: "file-a", name: "contract.pdf", bucketKey: "do-not-expose" },
          { id: "file-b", name: "amendment.pdf" },
        ],
      },
    ],
    getCompensationForReveal: async () => record,
    writeRevealAudit: async (_viewer, revealed) => {
      audit.push({
        action: "employee.compensation_revealed",
        entityId: String(revealed.id),
        details: "Compensation amount revealed by an authorized user",
      });
    },
  });
  return { handlers, audit };
}

const params = Promise.resolve({ id: "7", compensationId: "19" });
const request = new Request("https://local.test/api/employees/7/compensations");

test("compensation list route DTO never exposes amount and returns every attachment", async () => {
  const { handlers } = compensationHandlers(user(7));
  const response = await handlers.GET(request, {
    params: Promise.resolve({ id: "7" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal("amountCents" in body.items[0], false);
  assert.equal("amount" in body.items[0], false);
  assert.deepEqual(body.items[0].attachments, [
    { id: "file-a", name: "contract.pdf" },
    { id: "file-b", name: "amendment.pdf" },
  ]);
  assert.equal("bucketKey" in body.items[0].attachments[0], false);
});

test("coworker cannot reveal another employee compensation", async () => {
  const { handlers, audit } = compensationHandlers(user(8));
  const response = await handlers.reveal(request, { params });
  assert.equal(response.status, 403);
  assert.equal(audit.length, 0);
});

test("self can reveal amount and audit records access without plaintext amount", async () => {
  const { handlers, audit } = compensationHandlers(user(7));
  const response = await handlers.reveal(request, { params });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { amountCents, currency: "UAH" });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "employee.compensation_revealed");
  assert.equal(JSON.stringify(audit).includes(String(amountCents)), false);
});

test("HR with sensitive-data grant can reveal compensation", async () => {
  const { handlers } = compensationHandlers(user(90, "hr_admin"));
  const response = await handlers.reveal(request, { params });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { amountCents, currency: "UAH" });
});

test("unauthenticated compensation reveal returns 401", async () => {
  const { handlers } = compensationHandlers(null);
  const response = await handlers.reveal(request, { params });
  assert.equal(response.status, 401);
});

const baseCompensation = {
  id: 19,
  employeeId: 7,
  kind: "base",
  label: null,
  effectiveFrom: "2025-01-01",
  amountCents,
  currency: "UAH",
  period: "month",
  paymentSchedule: "monthly",
  comment: "Synthetic fixture",
};

function managementHandlers(viewer, accessOverride) {
  const audit = [];
  const deletedFiles = [];
  const records = new Map([
    [19, { ...baseCompensation, attachments: ["file-a", "file-b"] }],
    [
      20,
      {
        ...baseCompensation,
        id: 20,
        amountCents: 32100,
        attachments: ["file-c"],
      },
    ],
  ]);
  const handlers = createCompensationMutationHandlers({
    getCurrentUser: async () => {
      if (viewer === null) {
        const error = new Error("No session");
        error.name = "AuthenticationRequiredError";
        throw error;
      }
      return viewer;
    },
    getAccessPolicy: async (current) =>
      accessOverride ?? {
        managePeople:
          current.role === "hr_admin" || current.role === "super_admin",
        viewSensitiveData:
          current.role === "hr_admin" || current.role === "super_admin",
      },
    validateUpdateInput: (payload) =>
      compensationUpdateSchema.safeParse(payload),
    getCompensationForUpdate: async (employeeId, id) => {
      const record = records.get(id);
      return record?.employeeId === employeeId ? { ...record } : undefined;
    },
    getCompensationList: async (employeeId) =>
      [...records.values()]
        .filter((record) => record.employeeId === employeeId)
        .map(({ attachments, ...record }) => ({
          ...record,
          isCurrent: record.id === 19,
          attachments: attachments
            .map((id) => id + ".pdf")
            .map((name, index) => ({
              id: attachments[index],
              name,
            })),
        })),
    updateCompensation: async (current, input, _files, currentUser) => {
      const next = mergeCompensationUpdate(current, input);
      const prior = records.get(current.id);
      if (!prior) return false;
      records.set(current.id, { ...prior, ...next });
      audit.push({
        action: "employee.compensation_updated",
        entityId: String(current.id),
        details: "Compensation record updated",
        actor: currentUser.email,
      });
      return true;
    },
    deleteCompensation: async (current, currentUser) => {
      const record = records.get(current.id);
      if (!record) return false;
      deletedFiles.push(...record.attachments);
      records.delete(current.id);
      audit.push({
        action: "employee.compensation_deleted",
        entityId: String(current.id),
        details: "Compensation record deleted",
        actor: currentUser.email,
      });
      return true;
    },
  });
  return { handlers, records, audit, deletedFiles };
}

const compensationUrl = new Request(
  "https://local.test/api/employees/7/compensations/19",
);
const compensationContext = {
  params: Promise.resolve({ id: "7", compensationId: "19" }),
};

test("compensation PATCH without amount preserves stored amount and does not expose it", async () => {
  const { handlers, records, audit } = managementHandlers(user(90, "hr_admin"));
  const response = await handlers.PATCH(
    new Request(compensationUrl, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Updated without changing the confidential amount",
      }),
    }),
    compensationContext,
  );
  assert.equal(response.status, 200);
  assert.equal(records.get(19).amountCents, amountCents);
  const body = await response.json();
  assert.equal("amountCents" in body.items[0], false);
  assert.equal("amount" in body.items[0], false);
  assert.equal(audit[0].action, "employee.compensation_updated");
  assert.equal(JSON.stringify(audit).includes(String(amountCents)), false);
});

test("coworker cannot PATCH or DELETE compensation", async () => {
  const { handlers, records, audit, deletedFiles } = managementHandlers(
    user(8),
  );
  const patch = await handlers.PATCH(
    new Request(compensationUrl, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "attempt" }),
    }),
    compensationContext,
  );
  const deletion = await handlers.DELETE(compensationUrl, compensationContext);
  assert.equal(patch.status, 403);
  assert.equal(deletion.status, 403);
  assert.equal(records.size, 2);
  assert.equal(audit.length, 0);
  assert.deepEqual(deletedFiles, []);
});

test("managePeople without viewSensitiveData cannot mutate compensation", async () => {
  const { handlers, records, audit, deletedFiles } = managementHandlers(
    user(90, "hr_admin"),
    { managePeople: true, viewSensitiveData: false },
  );
  const patch = await handlers.PATCH(
    new Request(compensationUrl, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "attempt" }),
    }),
    compensationContext,
  );
  const deletion = await handlers.DELETE(compensationUrl, compensationContext);
  assert.equal(patch.status, 403);
  assert.equal(deletion.status, 403);
  assert.equal(
    compensationMutationAccessResponse({
      managePeople: true,
      viewSensitiveData: false,
    }).status,
    403,
  );
  assert.equal(records.size, 2);
  assert.equal(audit.length, 0);
  assert.deepEqual(deletedFiles, []);
  const postRoute = await readFile(
    new URL(
      "../app/api/employees/[id]/compensations/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(postRoute, /compensationMutationAccessResponse/);
});

test("authorized delete removes only the requested record and its files", async () => {
  const { handlers, records, audit, deletedFiles } = managementHandlers(
    user(90, "hr_admin"),
  );
  const response = await handlers.DELETE(compensationUrl, compensationContext);
  assert.equal(response.status, 200);
  assert.equal(records.has(19), false);
  assert.equal(records.has(20), true);
  assert.deepEqual(deletedFiles, ["file-a", "file-b"]);
  assert.deepEqual(
    audit.map(({ action, entityId }) => ({ action, entityId })),
    [{ action: "employee.compensation_deleted", entityId: "19" }],
  );
  assert.equal(JSON.stringify(audit).includes(String(amountCents)), false);
});

test("compensation DB delete failure does not begin attachment cleanup", async () => {
  let cleanupCalls = 0;
  await assert.rejects(
    deleteCoreBeforeAttachmentCleanup(
      ["owned-file"],
      async () => {
        throw new Error("D1 batch failed");
      },
      async () => {
        cleanupCalls++;
      },
    ),
  );
  assert.equal(cleanupCalls, 0);
});

test("compensation update failure preserves requested-to-remove attachments", async () => {
  let cleanupCalls = 0;
  await assert.rejects(
    commitBeforeAttachmentCleanup(
      ["owned-file"],
      async () => {
        throw new Error("D1 update failed");
      },
      async () => {
        cleanupCalls++;
      },
    ),
  );
  assert.equal(cleanupCalls, 0);
});

test("post-commit attachment cleanup failures are reported without undoing deletion", async () => {
  const outcome = await deleteCoreBeforeAttachmentCleanup(
    ["owned-file"],
    async () => true,
    async () => {
      throw new Error("R2 unavailable");
    },
  );
  assert.deepEqual(outcome, { deleted: true, failedIds: ["owned-file"] });
});

test("compensation file cleanup requires exact kind, owner and parent", () => {
  const expected = {
    id: "file-a",
    kind: "compensation_attachment",
    ownerEmployeeId: 7,
    relatedEntityType: "employee_compensation",
    relatedEntityId: "19",
    expectedId: "file-a",
    employeeId: 7,
    compensationId: 19,
  };
  assert.equal(isCompensationAttachmentForRecord(expected), true);
  assert.equal(
    isCompensationAttachmentForRecord({ ...expected, expectedId: "other" }),
    false,
  );
  assert.equal(
    isCompensationAttachmentForRecord({ ...expected, ownerEmployeeId: 8 }),
    false,
  );
  assert.equal(
    isCompensationAttachmentForRecord({ ...expected, relatedEntityId: "20" }),
    false,
  );
});

test("compensation file deletion audit does not include original filename", () => {
  const compensationDetails = storedFileDeletionAuditDetails(
    "compensation_attachment",
    "salary-confidential.pdf",
  );
  assert.equal(compensationDetails, "Compensation attachment deleted");
  assert.equal(compensationDetails.includes("salary-confidential"), false);
  assert.match(
    storedFileDeletionAuditDetails("employee_document", "policy.pdf"),
    /policy\.pdf/,
  );
});

test("compensation update merge only changes amount when one is explicitly sent", () => {
  assert.equal(
    mergeCompensationUpdate(baseCompensation, {
      removeAttachmentIds: [],
      comment: "No amount included",
    }).amountCents,
    amountCents,
  );
  assert.equal(
    mergeCompensationUpdate(baseCompensation, {
      amount: 250.5,
      removeAttachmentIds: [],
    }).amountCents,
    25050,
  );
});

function attachmentRoute(viewer) {
  const file = {
    objectKey: "private/compensation/contract.pdf",
    originalName: "contract.pdf",
    contentType: "application/pdf",
    sizeBytes: 32,
    kind: "compensation_attachment",
  };
  return createFileDownloadHandler({
    getCurrentUser: async () => {
      if (viewer === null) {
        const error = new Error("No session");
        error.name = "AuthenticationRequiredError";
        throw error;
      }
      return viewer;
    },
    getAuthorizedFile: async (_id, current) =>
      canReadCompensationAttachment({
        fileOwnerEmployeeId: 7,
        compensationOwnerEmployeeId: 7,
        viewerEmployeeId: current.employeeId,
        viewSensitiveData:
          current.role === "hr_admin" || current.role === "super_admin",
      })
        ? file
        : null,
    getFileObject: async () => ({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    }),
  });
}

const fileRequest = new Request(
  "https://local.test/api/files/file-a?preview=1",
);
const fileContext = { params: Promise.resolve({ id: "file-a" }) };

test("compensation attachment route denies coworker and permits self and HR", async () => {
  assert.equal(
    (await attachmentRoute(user(8))(fileRequest, fileContext)).status,
    403,
  );
  assert.equal(
    (await attachmentRoute(user(7))(fileRequest, fileContext)).status,
    200,
  );
  assert.equal(
    (await attachmentRoute(user(90, "hr_admin"))(fileRequest, fileContext))
      .status,
    200,
  );
  assert.equal(
    (await attachmentRoute(null)(fileRequest, fileContext)).status,
    401,
  );
});
