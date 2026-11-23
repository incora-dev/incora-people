import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  announcementPolls,
  employeeCompensations,
  employees,
  knowledgeArticles,
  storedFiles,
} from "@/db/schema";
import {
  getAccessPolicy,
  type AccessPolicy,
  type CurrentUser,
} from "@/lib/auth";
import {
  canReadKnowledgeArticle,
  getKnowledgeArticleAccess,
} from "@/modules/knowledge/access";
import { isFileScanAvailable } from "@/modules/files/scanning";
import { canReadCompensationAttachment } from "@/modules/people/privacy";

export async function getAuthorizedStoredFile(id: string, user: CurrentUser) {
  const [record] = await getDb()
    .select({
      id: storedFiles.id,
      kind: storedFiles.kind,
      category: storedFiles.category,
      visibility: storedFiles.visibility,
      ownerEmployeeId: storedFiles.ownerEmployeeId,
      ownerManagerId: employees.managerId,
      objectKey: storedFiles.objectKey,
      originalName: storedFiles.originalName,
      contentType: storedFiles.contentType,
      sizeBytes: storedFiles.sizeBytes,
      scanStatus: storedFiles.scanStatus,
      relatedEntityType: storedFiles.relatedEntityType,
      relatedEntityId: storedFiles.relatedEntityId,
    })
    .from(storedFiles)
    .innerJoin(employees, eq(storedFiles.ownerEmployeeId, employees.id))
    .where(eq(storedFiles.id, id))
    .limit(1);
  if (!record) return undefined;

  if (!isFileScanAvailable(record.scanStatus)) return null;

  const access = await getAccessPolicy(user);
  if (
    (record.kind === "compensation_attachment" ||
      record.kind === "employee_document") &&
    record.relatedEntityType === "employee_compensation"
  ) {
    const compensationId = Number(record.relatedEntityId);
    if (!Number.isInteger(compensationId) || compensationId <= 0) return null;
    const [compensation] = await getDb()
      .select({ employeeId: employeeCompensations.employeeId })
      .from(employeeCompensations)
      .where(eq(employeeCompensations.id, compensationId))
      .limit(1);
    if (!compensation || compensation.employeeId !== record.ownerEmployeeId)
      return null;
    return canReadCompensationAttachment({
      fileOwnerEmployeeId: record.ownerEmployeeId,
      compensationOwnerEmployeeId: compensation.employeeId,
      viewerEmployeeId: user.employeeId,
      viewSensitiveData: access.viewSensitiveData,
    })
      ? record
      : null;
  }
  if (record.kind === "compensation_attachment") return null;
  if (record.kind === "announcement_image") {
    if (
      record.relatedEntityType !== "announcement" ||
      !record.relatedEntityId
    ) {
      return null;
    }
    const [announcement] = await getDb()
      .select({
        active: announcements.active,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
      })
      .from(announcements)
      .where(eq(announcements.id, Number(record.relatedEntityId)))
      .limit(1);
    const now = new Date().toISOString();
    if (
      !announcement ||
      (!access.manageSettings &&
        (!announcement.active ||
          announcement.publishedAt > now ||
          (announcement.expiresAt !== null && announcement.expiresAt < now)))
    ) {
      return null;
    }
    return record;
  }
  if (record.kind === "announcement_poll_option_image") {
    if (
      record.relatedEntityType !== "announcement_poll_option" ||
      !record.relatedEntityId
    ) {
      return null;
    }
    const announcementId = Number(record.relatedEntityId.split(":", 1)[0]);
    if (!Number.isInteger(announcementId) || announcementId <= 0) return null;
    const [poll] = await getDb()
      .select({
        announcementId: announcementPolls.announcementId,
        active: announcementPolls.active,
      })
      .from(announcementPolls)
      .where(eq(announcementPolls.announcementId, announcementId))
      .limit(1);
    const [announcement] = await getDb()
      .select({
        active: announcements.active,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
      })
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);
    const now = new Date().toISOString();
    if (
      !poll ||
      !poll.active ||
      !announcement ||
      (!access.manageSettings &&
        (!announcement.active ||
          announcement.publishedAt > now ||
          (announcement.expiresAt !== null && announcement.expiresAt < now)))
    ) {
      return null;
    }
    return record;
  }
  if (record.kind === "knowledge_attachment") {
    if (
      record.relatedEntityType !== "knowledge_article" ||
      !record.relatedEntityId
    ) {
      return null;
    }
    const [article] = await getDb()
      .select({
        minimumRole: knowledgeArticles.minimumRole,
        published: knowledgeArticles.published,
        authorEmail: knowledgeArticles.authorEmail,
      })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, Number(record.relatedEntityId)))
      .limit(1);
    const sharedEmployeeIds = await getKnowledgeArticleAccess([
      Number(record.relatedEntityId),
    ]);
    if (
      !article ||
      !canReadKnowledgeArticle(
        article,
        user,
        sharedEmployeeIds.get(Number(record.relatedEntityId)) ?? [],
      ) ||
      (!article.published &&
        !access.managePeople &&
        article.authorEmail !== user.email)
    ) {
      return null;
    }
    return record;
  }
  return canRead(record, user, access) ? record : null;
}

function canRead(
  record: {
    kind: string;
    visibility: string;
    ownerEmployeeId: number;
    ownerManagerId: number | null;
  },
  user: CurrentUser,
  access: AccessPolicy,
) {
  if (record.kind === "employee_document" && record.visibility === "hr_only") {
    return access.viewSensitiveData;
  }
  if (user.employeeId === record.ownerEmployeeId) return true;
  if (record.kind === "profile_photo" || record.kind === "profile_cover") {
    return true;
  }
  if (record.kind === "certificate_attachment") return true;
  if (record.kind === "company_document") {
    return true;
  }
  if (access.viewSensitiveData) return true;
  if (record.kind === "bug_screenshot") return false;
  if (
    record.kind === "reimbursement_receipt" &&
    access.approveExpenses &&
    record.ownerManagerId === user.employeeId
  ) {
    return true;
  }
  return false;
}
