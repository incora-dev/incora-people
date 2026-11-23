/**
 * Compatibility facade for existing page imports.
 *
 * New code should import from `modules/<feature>/queries` directly. Keeping
 * this file as re-exports makes the feature split non-breaking and lets page
 * migrations happen independently.
 */
export { getAdminSettingsData } from "@/modules/admin/queries";
export { getAuditEvents } from "@/modules/audit/queries";
export {
  getAnnouncements,
  getDashboardData,
} from "@/modules/dashboard/queries";
export { getLeaveCalendar, getLeaveOverview } from "@/modules/leave/queries";
export { getNotifications } from "@/modules/notifications/queries";
export {
  getEmployee,
  getEmployeeDirectory,
  getEmployeeHistory,
  getEmployeeManagerOptions,
  getEmployeeProfileRecords,
  getOrgPeople,
  getOrgUnits,
  getReferenceValues,
} from "@/modules/people/queries";
export { getReimbursementOverview } from "@/modules/reimbursements/queries";
export {
  getActiveTimeProjects,
  getPendingCorrections,
  getTimeOverview,
} from "@/modules/time/queries";
