"use client";

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Pencil,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type {
  EmployeeManagerOption,
  EmployeeEditDto,
} from "@/modules/people/types";
import type { OrgUnitDto, ReferenceValueDto } from "@/modules/admin/types";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { SearchableEmployeeSelect } from "@/components/ui/SearchableEmployeeSelect";
import { DateField } from "@/components/ui/DateField";
import { OrgPlacementFields } from "@/components/OrgPlacementFields";
import { localDateKey } from "@/modules/shared/date";
import type { EmployeeInvitationSummary } from "@/modules/invitations/queries";
import { isEmployeeDeletionConfirmed } from "@/modules/people/deletion-policy";

type EditablePrivateDetails = {
  taxCode: string | null;
  contractEndDate: string | null;
  passportNumber: string | null;
  passportDate: string | null;
  passportAuthority: string | null;
  legalEntityValueId: number | null;
};

export function EmployeeProfileActions({
  employee,
  editableEmployee,
  privateDetails,
  canEditSensitive = false,
  managerOptions,
  orgUnits,
  referenceValues,
  technologies,
  canTerminate = false,
  terminationReasons = [],
  accountAccess,
  canManageAccountAccess = false,
  canExportCsv = false,
  canViewAsEmployee = false,
  canDeleteEmployee = false,
  canManageInvitations = false,
  invitationSummary = null,
}: {
  employee: Pick<EmployeeEditDto, "id" | "email" | "firstName" | "lastName">;
  editableEmployee?: EmployeeEditDto;
  privateDetails?: EditablePrivateDetails | null;
  canEditSensitive?: boolean;
  managerOptions: EmployeeManagerOption[];
  orgUnits: OrgUnitDto[];
  referenceValues: ReferenceValueDto[];
  technologies: string[];
  canTerminate?: boolean;
  terminationReasons?: readonly { code: string; label: string }[];
  accountAccess?: { userId: number; enabled: boolean } | null;
  canManageAccountAccess?: boolean;
  canExportCsv?: boolean;
  canViewAsEmployee?: boolean;
  canDeleteEmployee?: boolean;
  canManageInvitations?: boolean;
  invitationSummary?: EmployeeInvitationSummary | null;
}) {
  const { t } = useI18n();
  const [terminating, setTerminating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [invitationSummaryState, setInvitationSummaryState] =
    useState(invitationSummary);
  const [invitationRequestId, setInvitationRequestId] = useState<string | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteReauthenticateUrl, setDeleteReauthenticateUrl] = useState("");
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [confirmsErroneousTestRecord, setConfirmsErroneousTestRecord] =
    useState(false);
  const [deletionRequestId, setDeletionRequestId] = useState("");
  const menuRoot = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const firstItem = menuPanel.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    );
    firstItem?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!menuRoot.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
        !menuPanel.current
      ) {
        return;
      }
      const items = Array.from(
        menuPanel.current.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ),
      );
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function changeAccountAccess() {
    if (!accountAccess || !canManageAccountAccess) return;
    setAccountBusy(true);
    setAccountError("");
    const response = await fetch(
      `/api/employees/${employee.id}/account-access`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !accountAccess.enabled }),
      },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setAccountError(t(result.error ?? "Could not update system access."));
      setAccountBusy(false);
      return;
    }
    window.location.reload();
  }

  async function startEmployeePreview() {
    if (!canViewAsEmployee || previewBusy) return;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const response = await fetch("/api/view-as", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id }),
      });
      const result = (await response.json()) as {
        returnPath?: string;
        error?: string;
        reauthenticateUrl?: string;
      };
      if (response.status === 428 && result.reauthenticateUrl) {
        window.location.assign(result.reauthenticateUrl);
        return;
      }
      if (!response.ok) {
        setPreviewError(t(result.error ?? "Could not start employee preview."));
        setPreviewBusy(false);
        return;
      }
      window.location.assign(result.returnPath ?? `/employees/${employee.id}`);
    } catch {
      setPreviewError(t("Could not start employee preview."));
      setPreviewBusy(false);
    }
  }

  const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
  const deleteConfirmed = isEmployeeDeletionConfirmed(
    deleteConfirmationName,
    employeeName,
    confirmsErroneousTestRecord,
  );

  const latestInvitation = invitationSummaryState?.recentAttempts[0] ?? null;
  const staleSending = latestInvitation?.staleSending ?? false;

  async function sendInvitation() {
    const summary = invitationSummaryState;
    if (
      !canManageInvitations ||
      invitationBusy ||
      !summary?.eligible ||
      !summary.deliveryConfigured
    ) {
      return;
    }
    const currentAttempt = summary.recentAttempts[0] ?? null;
    const unresolvedAttempt =
      currentAttempt?.status === "uncertain" ||
      currentAttempt?.status === "sending";
    if (currentAttempt && unresolvedAttempt && !currentAttempt.retrySafe) {
      setInvitationError(
        t("Check the email provider before creating another attempt."),
      );
      return;
    }
    if (
      currentAttempt?.status === "sending" &&
      Date.now() - new Date(currentAttempt.updatedAt).getTime() < 90_000
    ) {
      return;
    }
    if (currentAttempt?.status === "uncertain" || staleSending) {
      const confirmed = window.confirm(
        t(
          "The provider may have accepted this email. Retry the same request safely with its idempotency key?",
        ),
      );
      if (!confirmed) return;
    }
    const isReminder = summary.loginActivity === "logged_in";
    if (
      isReminder &&
      !window.confirm(
        t(
          "This employee has already signed in. This email is only a reminder, not new access. Send it?",
        ),
      )
    ) {
      return;
    }

    const attemptId =
      currentAttempt && unresolvedAttempt
        ? currentAttempt.id
        : (invitationRequestId ?? crypto.randomUUID());
    setInvitationRequestId(attemptId);
    setInvitationBusy(true);
    setInvitationError("");
    try {
      const response = await fetch(`/api/employees/${employee.id}/invitation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId,
          acknowledgeReminder: isReminder,
        }),
      });
      const result = (await response.json()) as EmployeeInvitationSummary & {
        error?: string;
        result?: { attemptId: string; status: string; retrySafe: boolean };
      };
      if (Array.isArray(result.recentAttempts)) {
        setInvitationSummaryState(result);
      }
      if (
        result.result?.status === "sent" ||
        result.result?.status === "failed"
      ) {
        setInvitationRequestId(null);
      }
      if (!response.ok) {
        setInvitationError(t(result.error ?? "Could not send the invitation."));
      } else if (result.result?.status === "sent") {
        setInvitationError("");
      } else if (result.result?.status === "uncertain") {
        setInvitationError(
          t(
            "The provider result is uncertain. Check the status before resending.",
          ),
        );
      }
    } catch {
      setInvitationError(
        t(
          "The connection was interrupted. Check the invitation status before retrying.",
        ),
      );
    } finally {
      setInvitationBusy(false);
    }
  }

  async function deleteErroneousEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDeleteEmployee || deleteBusy || !deleteConfirmed) return;
    setDeleteBusy(true);
    setDeleteError("");
    setDeleteReauthenticateUrl("");
    try {
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: deletionRequestId,
          confirmationName: deleteConfirmationName,
          confirmsErroneousTestRecord,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        blockerCategories?: string[];
        reauthenticateUrl?: string;
      };
      if (response.status === 428 && result.reauthenticateUrl) {
        setDeleteReauthenticateUrl(result.reauthenticateUrl);
      }
      if (!response.ok || result.ok !== true) {
        const blockerDetails = result.blockerCategories?.length
          ? `${t("Related records:")} ${result.blockerCategories.map(t).join(", ")}`
          : "";
        setDeleteError(
          [
            t(result.error ?? "Could not safely remove the employee."),
            blockerDetails,
          ]
            .filter(Boolean)
            .join(" "),
        );
        setDeleteBusy(false);
        return;
      }
      setDeletingEmployee(false);
      window.location.replace("/employees?notice=employee-deleted");
    } catch {
      setDeleteError(t("Could not safely remove the employee."));
      setDeleteBusy(false);
    }
  }

  return (
    <div className="profile-actions">
      <a
        className="button ghost-button"
        href={`https://chat.google.com/u/0/#search/${encodeURIComponent(employee.email)}`}
      >
        <MessageCircle size={17} /> {t("Write in Google Chat")}
      </a>
      {(editableEmployee ||
        canTerminate ||
        canExportCsv ||
        canViewAsEmployee ||
        canDeleteEmployee ||
        canManageInvitations) && (
        <div className="profile-actions-menu" ref={menuRoot}>
          <button
            ref={menuButton}
            type="button"
            className="button ghost-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="employee-actions-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {t("Actions")} <ChevronDown size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              ref={menuPanel}
              id="employee-actions-menu"
              className="profile-actions-menu-panel"
              role="menu"
              aria-label={t("Employee actions")}
            >
              {canViewAsEmployee && (
                <button
                  type="button"
                  className="profile-actions-menu-item"
                  role="menuitem"
                  onClick={() => void startEmployeePreview()}
                  disabled={previewBusy}
                >
                  <Eye size={15} aria-hidden="true" />
                  {previewBusy ? t("Starting preview…") : t("View as employee")}
                </button>
              )}
              {editableEmployee && (
                <button
                  type="button"
                  className="profile-actions-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditingProfile(true);
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                  {t("Edit profile")}
                </button>
              )}
              {canExportCsv && (
                <a
                  className="profile-actions-menu-item"
                  role="menuitem"
                  href={`/api/employees/export?employeeId=${employee.id}`}
                >
                  <Download size={15} aria-hidden="true" />
                  {t("Export CSV")}
                </a>
              )}
              {(canExportCsv || editableEmployee) && canManageAccountAccess && (
                <div
                  className="profile-actions-menu-separator"
                  role="separator"
                />
              )}
              {canManageAccountAccess && accountAccess && (
                <button
                  type="button"
                  className="profile-actions-menu-item"
                  role="menuitem"
                  onClick={() => void changeAccountAccess()}
                  disabled={accountBusy}
                >
                  {t(
                    accountAccess.enabled
                      ? "Disable system access"
                      : "Enable system access",
                  )}
                </button>
              )}
              {canManageInvitations && invitationSummaryState && (
                <div
                  className="profile-invitation-summary"
                  role="group"
                  aria-label={t("Employee invitation status")}
                >
                  <div className="profile-invitation-summary-heading">
                    <strong>{t("Invitation")}</strong>
                    <span
                      className={`status-badge ${invitationStatusClass(latestInvitation?.status)}`}
                    >
                      {t(invitationStatusLabel(latestInvitation?.status))}
                    </span>
                  </div>
                  {latestInvitation && (
                    <small>
                      {t("Last attempt")}:{" "}
                      {formatInvitationDate(latestInvitation.requestedAt)}
                    </small>
                  )}
                  <small>
                    {t("Access")}:{" "}
                    {t(
                      invitationLoginLabel(
                        invitationSummaryState.loginActivity,
                      ),
                    )}
                    {invitationSummaryState.lastLoginAt
                      ? ` · ${formatInvitationDate(invitationSummaryState.lastLoginAt)}`
                      : ""}
                  </small>
                </div>
              )}
              {canManageInvitations && invitationSummaryState && (
                <button
                  type="button"
                  className="profile-actions-menu-item"
                  role="menuitem"
                  onClick={() => void sendInvitation()}
                  disabled={
                    invitationBusy ||
                    !invitationSummaryState.eligible ||
                    !invitationSummaryState.deliveryConfigured ||
                    (latestInvitation?.status === "sending" && !staleSending) ||
                    ((latestInvitation?.status === "uncertain" ||
                      staleSending) &&
                      !latestInvitation?.retrySafe)
                  }
                  title={
                    !invitationSummaryState.deliveryConfigured
                      ? t("No invitation delivery is configured.")
                      : !invitationSummaryState.eligible
                        ? t(
                            invitationEligibilityLabel(
                              invitationSummaryState.eligibilityCode,
                            ),
                          )
                        : undefined
                  }
                >
                  <Mail size={15} aria-hidden="true" />
                  {t(
                    invitationActionLabel({
                      busy: invitationBusy,
                      latestStatus: latestInvitation?.status,
                      loginActivity: invitationSummaryState.loginActivity,
                      retrySafe: latestInvitation?.retrySafe ?? false,
                      staleSending,
                    }),
                  )}
                </button>
              )}
              {canTerminate && editableEmployee && (
                <div
                  className="profile-actions-menu-separator"
                  role="separator"
                />
              )}
              {canDeleteEmployee && (
                <>
                  <div
                    className="profile-actions-menu-separator"
                    role="separator"
                  />
                  <button
                    type="button"
                    className="profile-actions-menu-item profile-actions-menu-danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteError("");
                      setDeleteReauthenticateUrl("");
                      setDeleteConfirmationName("");
                      setConfirmsErroneousTestRecord(false);
                      setDeletionRequestId(crypto.randomUUID());
                      setDeletingEmployee(true);
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    {t("Delete employee")}
                  </button>
                </>
              )}
              {canTerminate && editableEmployee && (
                <button
                  type="button"
                  className="profile-actions-menu-item profile-actions-menu-danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setTerminating(true);
                  }}
                >
                  <UserMinus size={15} aria-hidden="true" />
                  {t("End employment")}
                </button>
              )}
              {accountError && (
                <p className="profile-actions-menu-error" role="alert">
                  {accountError}
                </p>
              )}
              {invitationError && (
                <p className="profile-actions-menu-error" role="alert">
                  {t(invitationError)}
                </p>
              )}
              {previewError && (
                <p className="profile-actions-menu-error" role="alert">
                  {previewError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {editingProfile && editableEmployee && (
        <EditEmployeeDialog
          employee={editableEmployee}
          privateDetails={privateDetails}
          canEditSensitive={canEditSensitive}
          managerOptions={managerOptions}
          orgUnits={orgUnits}
          referenceValues={referenceValues}
          technologies={technologies}
          mode="profile"
          onClose={() => setEditingProfile(false)}
        />
      )}
      {terminating && editableEmployee && (
        <TerminateEmployeeDialog
          employee={editableEmployee}
          managerOptions={managerOptions}
          catalogReasons={terminationReasons}
          onClose={() => setTerminating(false)}
        />
      )}
      {deletingEmployee && (
        <DialogBackdrop
          onClose={() => {
            if (deleteBusy) return;
            setDeletingEmployee(false);
          }}
        >
          <form
            className="dialog compact-dialog employee-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-employee-title"
            onSubmit={deleteErroneousEmployee}
          >
            <h2 id="delete-employee-title">
              {t("Delete employee permanently")}
            </h2>
            <p>
              {t("You are about to permanently remove")}{" "}
              <strong>{employeeName}</strong>.{" "}
              {t("This action cannot be undone.")}
            </p>
            <p>
              {t(
                "This is not termination or disabling system access. The employee and linked account will be removed only if no protected HR or shared business records exist.",
              )}
            </p>
            <div className="form-grid">
              <label className="employee-delete-confirmation span-two">
                {t("Type the employee name to confirm")}
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={employeeName}
                  maxLength={240}
                  value={deleteConfirmationName}
                  disabled={deleteBusy}
                  onChange={(event) =>
                    setDeleteConfirmationName(event.target.value)
                  }
                  required
                />
              </label>
            </div>
            <label className="employee-delete-attestation">
              <input
                type="checkbox"
                required
                disabled={deleteBusy}
                checked={confirmsErroneousTestRecord}
                onChange={(event) =>
                  setConfirmsErroneousTestRecord(event.target.checked)
                }
              />
              <span>
                {t(
                  "I confirm this employee was created by mistake or for testing.",
                )}
              </span>
            </label>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
            {deleteReauthenticateUrl && (
              <a className="button ghost-button" href={deleteReauthenticateUrl}>
                {t("Sign in again to continue")}
              </a>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                disabled={deleteBusy}
                onClick={() => setDeletingEmployee(false)}
              >
                {t("Cancel")}
              </button>
              <button
                className="button danger-button"
                type="submit"
                disabled={deleteBusy || !deleteConfirmed}
                aria-busy={deleteBusy}
              >
                {deleteBusy ? t("Removing…") : t("Delete permanently")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </div>
  );
}

export function EmployeeProfileEditButton({
  employee,
  privateDetails,
  canEditSensitive = false,
  managerOptions,
  orgUnits,
  referenceValues,
  technologies,
  buttonLabel,
  buttonClassName = "button primary-button",
  icon,
  mode = "profile",
  ariaLabel,
  iconOnly = false,
  onActivate,
}: {
  employee: EmployeeEditDto;
  privateDetails?: EditablePrivateDetails | null;
  canEditSensitive?: boolean;
  managerOptions: EmployeeManagerOption[];
  orgUnits: OrgUnitDto[];
  referenceValues: ReferenceValueDto[];
  technologies: string[];
  buttonLabel: string;
  buttonClassName?: string;
  icon?: ReactNode;
  mode?: "profile" | "employment-change" | "employment-edit";
  ariaLabel?: string;
  iconOnly?: boolean;
  onActivate?: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        role={
          buttonClassName.includes("profile-actions-menu-item")
            ? "menuitem"
            : undefined
        }
        aria-label={ariaLabel ? t(ariaLabel) : undefined}
        onClick={() => {
          onActivate?.();
          setEditing(true);
        }}
      >
        {icon ?? <Pencil size={17} />}
        {iconOnly ? (
          <span className="sr-only">{t(buttonLabel)}</span>
        ) : (
          t(buttonLabel)
        )}
      </button>
      {editing && (
        <EditEmployeeDialog
          employee={employee}
          privateDetails={privateDetails}
          canEditSensitive={canEditSensitive}
          managerOptions={managerOptions}
          orgUnits={orgUnits}
          referenceValues={referenceValues}
          technologies={technologies}
          mode={mode}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

const terminationReasons = [
  ["workload", "Велике навантаження"],
  ["another_company", "Інша компанія"],
  ["career_change", "Зміна напряму"],
  ["stress", "Високий рівень стресу"],
  ["no_growth", "Немає карʼєрного зростання"],
  ["no_recognition", "Немає визнання"],
  ["management_communication", "Комунікація з керівництвом"],
  ["team_conflict", "Конфлікти в колективі"],
  ["role_mismatch", "Невідповідність посаді"],
  ["low_salary", "Недостатня зарплата"],
  ["performance", "Незадовільний перформанс"],
  ["commute", "Незручна дорога"],
  ["expectations", "Очікування не справдилися"],
  ["relocation", "Переїзд"],
  ["project_closed", "Закриття проєкту"],
  ["low_productivity", "Низька продуктивність"],
] as const;

function TerminateEmployeeDialog({
  employee,
  managerOptions,
  catalogReasons,
  onClose,
}: {
  employee: EmployeeEditDto;
  managerOptions: EmployeeManagerOption[];
  catalogReasons: readonly { code: string; label: string }[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [lastWorkingDay, setLastWorkingDay] = useState(localDateKey());
  const [terminationType, setTerminationType] = useState("resignation");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [pendingPayload, setPendingPayload] = useState<{
    lastWorkingDay: string;
    terminationType: string;
    reasonCodes: string[];
    description: string;
    rehireEligible: boolean;
    taskTransferEmployeeId: string | null;
  } | null>(null);
  const today = localDateKey();

  useEffect(() => {
    if (!reviewing) return;
    const frame = window.requestAnimationFrame(() => {
      reviewHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reviewing]);

  const reasons = catalogReasons.length ? catalogReasons : terminationReasons;
  async function confirmTermination() {
    if (!pendingPayload) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/employees/${employee.id}/terminate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingPayload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      const serverError = result.error ?? "";
      setError(
        serverError === "Check the submitted fields."
          ? t("Please correct the highlighted fields.")
          : serverError || t("Could not end employment."),
      );
      setBusy(false);
      setReviewing(false);
      return;
    }
    window.location.reload();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!lastWorkingDay || lastWorkingDay > today) {
      setError(t("Choose a valid last working day."));
      return;
    }
    if (selectedReasons.length === 0) {
      setError(t("Select at least one termination reason."));
      document.getElementById("termination-reasons")?.focus();
      return;
    }
    const form = new FormData(event.currentTarget);
    setPendingPayload({
      lastWorkingDay,
      terminationType,
      reasonCodes: selectedReasons,
      description: description.trim(),
      rehireEligible: form.get("rehireEligible") === "on",
      taskTransferEmployeeId:
        String(form.get("taskTransferEmployeeId") || "") || null,
    });
    setReviewing(true);
  }
  return (
    <DialogBackdrop onClose={onClose} confirmWhenDirty>
      <div
        className="dialog termination-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="termination-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Core HR")}</p>
            <h2 id="termination-dialog-title">{t("End employment")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        {reviewing && pendingPayload ? (
          <div
            className="termination-review"
            aria-live="polite"
            aria-labelledby="termination-review-title"
          >
            <h3
              id="termination-review-title"
              ref={reviewHeadingRef}
              tabIndex={-1}
            >
              {t("Confirm employment end")}
            </h3>
            <p>
              {employee.firstName} {employee.lastName} · {t("Last working day")}
              : <strong>{pendingPayload.lastWorkingDay}</strong>
            </p>
            <p>
              {t(
                "Pending leave, reimbursement, correction and task workflows will be closed or transferred.",
              )}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setReviewing(false)}
                disabled={busy}
              >
                {t("Continue editing")}
              </button>
              <button
                type="button"
                className="button danger-button"
                onClick={() => void confirmTermination()}
                disabled={busy}
              >
                {busy ? t("Saving…") : t("Confirm and end employment")}
              </button>
            </div>
          </div>
        ) : (
          <form className="form-grid" onSubmit={submit}>
            <DateField
              name="lastWorkingDay"
              label={t("Last working day")}
              value={lastWorkingDay}
              max={today}
              required
              onValueChange={setLastWorkingDay}
            />
            <label>
              {t("Termination type")}
              <select
                name="terminationType"
                value={terminationType}
                onChange={(event) => setTerminationType(event.target.value)}
              >
                <option value="resignation">{t("Resignation")}</option>
                <option value="mutual_agreement">
                  {t("Mutual agreement")}
                </option>
                <option value="involuntary">{t("Involuntary")}</option>
                <option value="project_completion">
                  {t("Project completion")}
                </option>
              </select>
            </label>
            <fieldset
              className="span-two managed-multi-select"
              id="termination-reasons"
              tabIndex={-1}
              aria-describedby={error ? "termination-error" : undefined}
              aria-invalid={selectedReasons.length === 0 && Boolean(error)}
            >
              <legend>{t("Termination reasons")}</legend>
              <div>
                {reasons.map((item) => {
                  const [code, label] =
                    "code" in item ? [item.code, item.label] : item;
                  return (
                    <label key={code}>
                      <input
                        type="checkbox"
                        name="reasonCodes"
                        value={code}
                        checked={selectedReasons.includes(code)}
                        onChange={(event) =>
                          setSelectedReasons((current) =>
                            event.target.checked
                              ? [...current, code]
                              : current.filter((item) => item !== code),
                          )
                        }
                      />{" "}
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="span-two">
              {t("Additional description")}
              <textarea
                name="description"
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="span-two">
              {t("Transfer open tasks to")}
              <SearchableEmployeeSelect
                name="taskTransferEmployeeId"
                defaultValue={employee.managerId ?? ""}
                options={managerOptions.filter(
                  (item) => item.id !== employee.id,
                )}
                placeholder={t("Leave unassigned")}
                searchPlaceholder={t("Search by name or position")}
                emptyLabel={t("No employees found.")}
              />
            </label>
            <label className="checkbox-row span-two">
              <input type="checkbox" name="rehireEligible" />{" "}
              {t("Eligible for rehire")}
            </label>
            {error && (
              <p
                className="form-error span-two"
                id="termination-error"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={onClose}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="button danger-button"
                disabled={
                  busy || !lastWorkingDay || selectedReasons.length === 0
                }
              >
                {busy ? t("Saving…") : t("End employment")}
              </button>
            </div>
          </form>
        )}
      </div>
    </DialogBackdrop>
  );
}

function EditEmployeeDialog({
  employee,
  privateDetails,
  canEditSensitive = false,
  managerOptions,
  orgUnits,
  referenceValues,
  technologies,
  mode,
  onClose,
}: {
  employee: EmployeeEditDto;
  privateDetails?: EditablePrivateDetails | null;
  canEditSensitive?: boolean;
  managerOptions: EmployeeManagerOption[];
  orgUnits: OrgUnitDto[];
  referenceValues: ReferenceValueDto[];
  technologies: string[];
  mode: "profile" | "employment-change" | "employment-edit";
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const employmentFields = {
      jobTitle: values.jobTitle,
      division: values.division,
      department: values.department,
      team: values.team,
      divisionUnitId: values.divisionUnitId,
      departmentUnitId: values.departmentUnitId,
      teamUnitId: values.teamUnitId,
      level: values.level,
      location: values.location,
      employmentType: values.employmentType,
      managerId: values.managerId,
    };
    const payload =
      mode === "employment-change"
        ? {
            ...employmentFields,
            changeReason: values.changeReason,
            effectiveDate: values.effectiveDate,
            employmentChange: true,
          }
        : mode === "employment-edit"
          ? { ...employmentFields, employmentEdit: true }
          : {
              ...values,
              technologies: form.getAll("technologies").map(String),
            };
    const response = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(t(result.error ?? "Could not update this profile."));
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Core HR")}</p>
            <h2 id="edit-profile-title">
              {t(
                mode === "employment-change"
                  ? "Add position"
                  : mode === "employment-edit"
                    ? "Edit position"
                    : "Edit employee profile",
              )}
            </h2>
            {mode === "employment-change" && (
              <p className="muted">
                {t("Record a meaningful employment change for this employee.")}
              </p>
            )}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {mode === "profile" && (
            <>
              <div className="form-section-title span-two">
                {t("Personal details")}
              </div>
              <label>
                {t("First name")}
                <input
                  name="firstName"
                  defaultValue={employee.firstName}
                  required
                />
              </label>
              <label>
                {t("Last name")}
                <input
                  name="lastName"
                  defaultValue={employee.lastName}
                  required
                />
              </label>
              <label className="span-two">
                {t("Full name in Ukrainian")}
                <input
                  name="ukrainianName"
                  defaultValue={employee.ukrainianName ?? ""}
                />
              </label>
              <label className="span-two">
                {t("Work email")}
                <input
                  name="email"
                  type="email"
                  defaultValue={employee.email}
                  required
                />
              </label>
              {canEditSensitive && (
                <>
                  <label>
                    {t("Personal email")}
                    <input
                      name="personalEmail"
                      type="email"
                      defaultValue={employee.personalEmail ?? ""}
                    />
                  </label>
                  <label>
                    {t("Phone")}
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={employee.phone ?? ""}
                    />
                  </label>
                  <DateField
                    name="birthDate"
                    label={t("Birth date")}
                    value={employee.birthDate ?? ""}
                  />
                  <label>
                    {t("Gender")}
                    <select name="gender" defaultValue={employee.gender ?? ""}>
                      <option value="">{t("Not specified")}</option>
                      <option value="Female">{t("Female")}</option>
                      <option value="Male">{t("Male")}</option>
                      <option value="Non-binary">{t("Non-binary")}</option>
                    </select>
                  </label>
                  <label className="span-two">
                    {t("Address")}
                    <input
                      name="address"
                      defaultValue={employee.address ?? ""}
                    />
                  </label>
                  <div className="form-section-title span-two">
                    {t("Sensitive HR information")}
                  </div>
                  <label>
                    {t("Tax Code")}
                    <input
                      name="taxCode"
                      defaultValue={privateDetails?.taxCode ?? ""}
                      maxLength={40}
                    />
                  </label>
                  <DateField
                    name="contractEndDate"
                    label={t("Contract End Date")}
                    value={privateDetails?.contractEndDate ?? ""}
                  />
                  <label>
                    {t("Passport Number")}
                    <input
                      name="passportNumber"
                      defaultValue={privateDetails?.passportNumber ?? ""}
                      maxLength={80}
                    />
                  </label>
                  <DateField
                    name="passportDate"
                    label={t("Passport Date")}
                    value={privateDetails?.passportDate ?? ""}
                  />
                  <label>
                    {t("Passport Authority")}
                    <input
                      name="passportAuthority"
                      defaultValue={privateDetails?.passportAuthority ?? ""}
                      maxLength={200}
                    />
                  </label>
                  <label>
                    {t("Legal Entity")}
                    <select
                      name="legalEntityValueId"
                      defaultValue={privateDetails?.legalEntityValueId ?? ""}
                    >
                      <option value="">{t("Not specified")}</option>
                      {referenceValues
                        .filter(
                          (item) => item.kind === "legal_entity" && item.active,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </>
          )}
          <div className="form-section-title span-two">{t("Employment")}</div>
          {mode === "profile" && (
            <label>
              {t("Employee ID")}
              <input
                name="employeeCode"
                defaultValue={employee.employeeCode ?? ""}
              />
            </label>
          )}
          <label>
            {t("Job title")}
            <select name="jobTitle" defaultValue={employee.jobTitle} required>
              {optionsWithCurrent(
                referenceValues,
                "position",
                employee.jobTitle,
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <OrgPlacementFields
            units={orgUnits}
            initialDivisionId={employee.divisionUnitId}
            initialDepartmentId={employee.departmentUnitId}
            initialTeamId={employee.teamUnitId}
            division={employee.division}
            department={employee.department}
            team={employee.team ?? ""}
          />
          <label>
            {t("Level")}
            <select name="level" defaultValue={employee.level ?? ""}>
              <option value="">{t("Not specified")}</option>
              {optionsWithCurrent(referenceValues, "level", employee.level)
                .filter(Boolean)
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </label>
          <label>
            {t("Location")}
            <input name="location" defaultValue={employee.location} />
          </label>
          {mode === "profile" && (
            <fieldset className="span-two managed-multi-select">
              <legend>{t("Technologies")}</legend>
              <p>
                {t("Select values maintained in admin profile dictionaries.")}
              </p>
              <div>
                {referenceValues
                  .filter((item) => item.kind === "technology" && item.active)
                  .map((item) => (
                    <label key={item.id}>
                      <input
                        name="technologies"
                        type="checkbox"
                        value={item.label}
                        defaultChecked={technologies.includes(item.label)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
              </div>
            </fieldset>
          )}
          <label>
            {t("Employment")}
            <select
              name="employmentType"
              defaultValue={employee.employmentType}
            >
              {optionsWithCurrent(
                referenceValues,
                "employment_type",
                employee.employmentType,
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="span-two">
            {t("Manager")}
            <SearchableEmployeeSelect
              name="managerId"
              defaultValue={employee.managerId ?? ""}
              options={managerOptions.filter(
                (person) => person.id !== employee.id,
              )}
              placeholder={t("Not assigned")}
              searchPlaceholder={t("Search by name or position")}
              emptyLabel={t("No employees found.")}
            />
          </label>
          {mode === "profile" ? (
            <>
              <label>
                {t("Status")}
                <select name="status" defaultValue={employee.status}>
                  <option value="active">{t("Active")}</option>
                  <option value="on_leave">{t("On leave")}</option>
                  <option value="inactive">{t("Inactive")}</option>
                </select>
              </label>
              <DateField
                name="startDate"
                label={t("Start date")}
                value={employee.startDate}
                required
                readOnly
              />
              <DateField
                name="probationEnd"
                label={t("Probation end")}
                value={employee.probationEnd ?? ""}
              />
            </>
          ) : mode === "employment-change" ? (
            <DateField
              name="effectiveDate"
              label={t("Effective date")}
              value={localDateKey()}
              required
            />
          ) : null}
          {mode === "employment-change" && (
            <label className="span-two">
              {t("Reason for change")}
              <input
                name="changeReason"
                placeholder={t("Promotion, transfer, profile correction…")}
                required
              />
            </label>
          )}
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button" disabled={busy}>
              {busy ? t("Saving…") : t("Save changes")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function optionsWithCurrent(
  values: ReferenceValueDto[],
  kind: ReferenceValueDto["kind"],
  current?: string | null,
) {
  return [
    ...new Set([
      ...(current ? [current] : []),
      ...values
        .filter((value) => value.kind === kind && value.active)
        .map((value) => value.label),
    ]),
  ];
}

function invitationEligibilityLabel(code: string | null) {
  const labels: Record<string, string> = {
    employee_missing: "Employee not found.",
    account_missing: "This employee does not have a linked system account.",
    identity_ambiguous:
      "The employee and account relationship is ambiguous; the invitation was not sent.",
    email_mismatch:
      "The employee work email and linked account email do not match.",
    invalid_email: "The employee does not have a valid work email.",
    account_disabled:
      "System access is disabled. Enable access before sending an invitation.",
    employee_terminated:
      "Terminated employees cannot receive a system invitation.",
    system_account:
      "Invitations cannot be sent to protected or non-employee system accounts.",
  };
  return labels[code ?? ""] ?? "Employee invitation is unavailable.";
}

function invitationStatusLabel(
  status?: "sending" | "sent" | "failed" | "uncertain",
) {
  switch (status) {
    case "sending":
      return "Sending invitation…";
    case "sent":
      return "Accepted by email provider";
    case "failed":
      return "Invitation sending failed";
    case "uncertain":
      return "Invitation result is uncertain";
    default:
      return "Not sent";
  }
}

function invitationStatusClass(
  status?: "sending" | "sent" | "failed" | "uncertain",
) {
  if (status === "sent") return "approved";
  if (status === "failed") return "rejected";
  return "pending";
}

function invitationLoginLabel(
  activity: "logged_in" | "not_logged_in" | "unknown",
) {
  if (activity === "logged_in") return "Already signed in";
  if (activity === "not_logged_in") return "Has not signed in yet";
  return "Sign-in history unavailable";
}

function invitationActionLabel(input: {
  busy: boolean;
  latestStatus?: "sending" | "sent" | "failed" | "uncertain";
  loginActivity: "logged_in" | "not_logged_in" | "unknown";
  retrySafe: boolean;
  staleSending: boolean;
}) {
  if (input.busy) return "Sending invitation…";
  if (
    input.latestStatus === "uncertain" ||
    (input.latestStatus === "sending" && input.staleSending)
  ) {
    return input.retrySafe
      ? "Safely check invitation status"
      : "Check provider status before retrying";
  }
  if (input.latestStatus === "sending") return "Sending invitation…";
  if (input.latestStatus === "sent" || input.latestStatus === "failed") {
    return "Resend invitation";
  }
  if (input.loginActivity === "logged_in") return "Send invitation reminder";
  return "Send system invitation";
}

function formatInvitationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
