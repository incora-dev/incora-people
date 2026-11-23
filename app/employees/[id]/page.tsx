import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Cake,
  History,
  IdCard,
  Mail,
  Building2,
  MapPin,
  Network,
  Phone,
  Pencil,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  getEmployee,
  getEmployeeHistory,
  getEmployeeTermination,
  getEmployeeManagerOptions,
  getEmployeeProfileRecords,
  getEmployeePrivateDetails,
  getEmployeeProfileRelationships,
  getEffectiveWorkSchedule,
  getEmployeeAccountAccess,
  getOrgUnits,
  getReferenceValues,
} from "@/modules/people/queries";
import {
  getAccessPolicy,
  getCurrentUser,
  hasOrganizationScope,
} from "@/lib/auth";
import {
  EmployeeProfileActions,
  EmployeeProfileEditButton,
} from "@/components/EmployeeProfileActions";
import { ProfileCardHeading } from "@/components/ProfileCardHeading";
import { EmployeeDocuments } from "@/components/EmployeeDocuments";
import { EmployeeProfileRecords } from "@/components/EmployeeProfileRecords";
import { EmployeeProfileMedia } from "@/components/EmployeeProfileMedia";
import { EmployeeAssets } from "@/components/assets/EmployeeAssets";
import { EmployeeCompensation } from "@/components/EmployeeCompensation";
import { getEmployeeAssets } from "@/modules/assets/queries";
import {
  getEmployeeDocuments,
  getEmployeeDocumentFolders,
  getEmployeeProfileMedia,
} from "@/modules/files/storage";
import { getLeaveOverview } from "@/modules/leave/queries";
import { getServerI18n } from "@/lib/i18n-server";
import {
  calculateTotalExperienceDays,
  formatEmployeeTenure,
} from "@/modules/people/tenure";
import { getEmployeeLifecycleStage } from "@/modules/people/directory";
import { getTerminationReasonCatalog } from "@/modules/people/lifecycle";
import {
  calculatePreviousExperienceDays,
  buildEmploymentTimeline,
  formatExperienceDays,
  latestEmploymentStateChangeDate,
} from "@/modules/people/employment-profile";
import { EmployeeProfileTabs } from "@/components/EmployeeProfileTabs";
import { formatCount } from "@/lib/i18n";
import { getCompensationList } from "@/modules/compensation/queries";
import { getEmployeeInvitationSummary } from "@/modules/invitations/queries";
import { getDateContext } from "@/modules/shared/date";
import { isEligiblePreviewTarget } from "@/modules/view-as/policy";
import {
  canReadEmployeeSensitiveData,
  canReadEmployeePrivateDetails,
  toEmployeeEditDto,
} from "@/modules/people/privacy";

export const metadata: Metadata = { title: "Employee profile" };

export default async function EmployeeProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const { id } = await params;
  const employeeId = Number(id);
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const canReadRequestedEmployeePrivateFields = canReadEmployeeSensitiveData(
    employeeId,
    user.employeeId,
    access.viewSensitiveData,
  );
  const employee = await getEmployee(
    employeeId,
    canReadRequestedEmployeePrivateFields,
  );
  if (!employee) notFound();
  const isPreview = user.isPreview === true;
  const canEditEmployee = access.managePeople && !isPreview;
  const isSelf = user.employeeId === employee.id;
  const isDirectManager = user.employeeId === employee.managerId;
  const canViewSensitive = canReadEmployeeSensitiveData(
    employee.id,
    user.employeeId,
    access.viewSensitiveData,
  );
  const canViewPrivateDetails = canReadEmployeePrivateDetails(
    access.viewSensitiveData,
  );
  const employeeEditDto = toEmployeeEditDto(employee, access.viewSensitiveData);
  const canViewLeave =
    canViewSensitive || (isDirectManager && access.approveLeave);
  const [
    history,
    leave,
    managerOptions,
    documents,
    documentFolders,
    profileRecords,
    profileMedia,
    assets,
    orgUnits,
    referenceValues,
    terminationReasons,
    privateDetails,
    relationships,
    schedule,
    terminationRows,
    compensationItems,
    accountAccess,
    invitationSummary,
  ] = await Promise.all([
    canViewSensitive ? getEmployeeHistory(employee.id) : Promise.resolve([]),
    canViewLeave
      ? getLeaveOverview(employee.id, user)
      : Promise.resolve({
          balances: [],
          requests: [],
          pending: [],
          holidays: [],
        }),
    access.managePeople ? getEmployeeManagerOptions() : Promise.resolve([]),
    canViewSensitive
      ? getEmployeeDocuments(employee.id, access.viewSensitiveData)
      : Promise.resolve([]),
    canViewSensitive
      ? getEmployeeDocumentFolders(employee.id, access.viewSensitiveData)
      : Promise.resolve([]),
    getEmployeeProfileRecords(employee.id, canViewSensitive),
    getEmployeeProfileMedia(employee.id),
    isSelf || access.managePeople || isDirectManager
      ? getEmployeeAssets(employee.id, isSelf || access.managePeople)
      : Promise.resolve([]),
    access.managePeople ? getOrgUnits() : Promise.resolve([]),
    access.managePeople ? getReferenceValues() : Promise.resolve([]),
    access.managePeople ? getTerminationReasonCatalog() : Promise.resolve([]),
    canViewPrivateDetails
      ? getEmployeePrivateDetails(employee.id)
      : Promise.resolve(null),
    getEmployeeProfileRelationships(employee.id),
    getEffectiveWorkSchedule(employee.id),
    canViewSensitive
      ? getEmployeeTermination(employee.id)
      : Promise.resolve([]),
    canViewSensitive ? getCompensationList(employee.id) : Promise.resolve([]),
    user.role === "super_admin"
      ? getEmployeeAccountAccess(employee.id)
      : Promise.resolve(null),
    access.managePeople && !isPreview
      ? getEmployeeInvitationSummary(employee.id)
      : Promise.resolve(null),
  ]);
  const visibleRelationships = isPreview
    ? {
        manager: relationships.manager
          ? { ...relationships.manager, photoFileId: null }
          : null,
        directReports: relationships.directReports.map((person) => ({
          ...person,
          photoFileId: null,
        })),
        teammates: relationships.teammates.map((person) => ({
          ...person,
          photoFileId: null,
        })),
      }
    : relationships;
  const canViewAsEmployee = Boolean(
    user.role === "super_admin" &&
    accountAccess &&
    accountAccess.linkedAccountCount === 1 &&
    isEligiblePreviewTarget({
      userId: accountAccess.userId,
      employeeId: employee.id,
      email: accountAccess.email,
      employeeEmail: employee.email,
      role: accountAccess.role,
      enabled: accountAccess.enabled,
      protectedAdmin: accountAccess.protectedAdmin === 1,
      employeeStatus: employee.status,
    }),
  );
  const termination = terminationRows.at(0) ?? null;
  const { today } = getDateContext();
  const lifecycleStage = getEmployeeLifecycleStage(
    employee.status,
    employee.probationEnd,
    today,
  );
  const lastStateChange = latestEmploymentStateChangeDate(
    history,
    employee.startDate,
  );
  const experienceRecords = profileRecords.filter(
    (record) => record.kind === "experience",
  );
  const previousExperienceDays = canViewSensitive
    ? calculatePreviousExperienceDays(experienceRecords, employee.startDate)
    : null;
  const tenureEmployee = {
    startDate: employee.startDate,
    status: employee.status,
    lastWorkingDay: termination?.lastWorkingDay,
  };
  const totalExperience = calculateTotalExperienceDays(
    previousExperienceDays,
    tenureEmployee,
    today,
  );
  const employmentTimeline = buildEmploymentTimeline({
    startDate: employee.startDate,
    probationEnd: employee.probationEnd,
    currentState: {
      jobTitle: employee.jobTitle,
      level: employee.level,
      managerId: employee.managerId,
      location: employee.location,
      division: employee.division,
      department: employee.department,
      team: employee.team,
      employmentType: employee.employmentType,
      status: employee.status,
    },
    snapshots: history,
    terminations: terminationRows,
  });
  const reasonLabels = new Map(
    terminationReasons.map((item) => [item.code, item.label]),
  );
  let terminationReasonsText = "";
  if (termination) {
    try {
      const codes: unknown = JSON.parse(termination.reasonCodesJson || "[]");
      terminationReasonsText = Array.isArray(codes)
        ? codes
            .filter((code): code is string => typeof code === "string")
            .map((code) => reasonLabels.get(code) ?? code)
            .join(", ")
        : "";
    } catch {
      terminationReasonsText = t("Unavailable");
    }
  }

  return (
    <>
      <Link className="back-link" href="/employees">
        <ArrowLeft size={17} /> {t("Back to people")}
      </Link>
      <EmployeeProfileMedia
        employeeId={employee.id}
        firstName={employee.firstName}
        lastName={employee.lastName}
        photo={isPreview ? null : profileMedia.photo}
        cover={isPreview ? null : profileMedia.cover}
        canEdit={!isPreview && (access.managePeople || isSelf)}
      >
        <div className="profile-title">
          <span className={`status-badge ${employee.status}`}>
            {employee.status === "on_leave"
              ? t("On leave")
              : employee.status === "inactive"
                ? t("Inactive")
                : t("Active")}
          </span>
          <h1>
            {employee.firstName} {employee.lastName}
          </h1>
          <p>
            {employee.jobTitle} · {employee.department}
          </p>
        </div>
        <div className="profile-hero-actions-column">
          {!isPreview && (
            <EmployeeProfileActions
              key={employee.id}
              employee={{
                id: employee.id,
                email: employee.email,
                firstName: employee.firstName,
                lastName: employee.lastName,
              }}
              editableEmployee={canEditEmployee ? employeeEditDto : undefined}
              privateDetails={
                access.viewSensitiveData ? privateDetails : undefined
              }
              canEditSensitive={access.viewSensitiveData}
              managerOptions={managerOptions}
              orgUnits={orgUnits}
              referenceValues={referenceValues}
              technologies={profileRecords
                .filter((record) => record.kind === "skill")
                .map((record) => record.title)}
              canTerminate={
                user.role === "super_admin" && employee.status !== "inactive"
              }
              terminationReasons={terminationReasons}
              accountAccess={
                accountAccess
                  ? {
                      userId: accountAccess.userId,
                      enabled: accountAccess.enabled,
                    }
                  : null
              }
              canManageAccountAccess={
                user.role === "super_admin" && access.manageSettings
              }
              canManageInvitations={access.managePeople && !isPreview}
              invitationSummary={invitationSummary}
              canExportCsv={hasOrganizationScope(user)}
              canViewAsEmployee={canViewAsEmployee}
              canDeleteEmployee={user.role === "super_admin"}
            />
          )}
        </div>
      </EmployeeProfileMedia>

      <EmployeeProfileTabs
        ariaLabel={t("Profile sections")}
        tabs={[
          {
            id: "personal",
            label: t("Personal"),
            content: (
              <div className="profile-personal-layout">
                <div className="profile-personal-left">
                  <article className="panel profile-primary-panel">
                    <ProfileCardHeading
                      title={t("Personal information")}
                      actions={
                        canEditEmployee ? (
                          <EmployeeProfileEditButton
                            employee={employeeEditDto}
                            privateDetails={
                              access.viewSensitiveData
                                ? privateDetails
                                : undefined
                            }
                            canEditSensitive={access.viewSensitiveData}
                            managerOptions={managerOptions}
                            orgUnits={orgUnits}
                            referenceValues={referenceValues}
                            technologies={profileRecords
                              .filter((record) => record.kind === "skill")
                              .map((record) => record.title)}
                            buttonLabel="Edit profile"
                            buttonClassName="icon-button"
                            ariaLabel="Edit profile"
                            icon={<Pencil size={16} />}
                            iconOnly
                          />
                        ) : undefined
                      }
                    />
                    <dl className="detail-list">
                      <Detail
                        icon={<Users />}
                        label={t("First name")}
                        value={employee.firstName}
                      />
                      <Detail
                        icon={<IdCard />}
                        label={t("Employee ID")}
                        value={
                          employee.employeeCode ??
                          `INC-${String(employee.id).padStart(3, "0")}`
                        }
                      />
                      <Detail
                        icon={<Users />}
                        label={t("Last name")}
                        value={employee.lastName}
                      />
                      <Detail
                        icon={<Users />}
                        label={t("Full name in Ukrainian")}
                        value={employee.ukrainianName ?? t("Not provided")}
                      />
                      <Detail
                        icon={<Mail />}
                        label={t("Work email")}
                        value={employee.email}
                      />
                      <Detail
                        icon={<Mail />}
                        label={t("Personal email")}
                        value={
                          canViewSensitive
                            ? (employee.personalEmail ?? t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<Cake />}
                        label={t("Birth date")}
                        value={
                          canViewSensitive && employee.birthDate
                            ? formatDate(employee.birthDate, locale)
                            : canViewSensitive
                              ? t("Not provided")
                              : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<Users />}
                        label={t("Gender")}
                        value={
                          canViewSensitive
                            ? (employee.gender ?? t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<ShieldCheck />}
                        label={t("Tax Code")}
                        value={
                          canViewPrivateDetails
                            ? (privateDetails?.taxCode ?? t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<CalendarDays />}
                        label={t("Contract End Date")}
                        value={
                          canViewPrivateDetails &&
                          privateDetails?.contractEndDate
                            ? formatDate(privateDetails.contractEndDate, locale)
                            : canViewPrivateDetails
                              ? t("Not provided")
                              : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<IdCard />}
                        label={t("Passport Number")}
                        value={
                          canViewPrivateDetails
                            ? (privateDetails?.passportNumber ??
                              t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<CalendarDays />}
                        label={t("Passport Date")}
                        value={
                          canViewPrivateDetails && privateDetails?.passportDate
                            ? formatDate(privateDetails.passportDate, locale)
                            : canViewPrivateDetails
                              ? t("Not provided")
                              : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<IdCard />}
                        label={t("Passport Authority")}
                        value={
                          canViewPrivateDetails
                            ? (privateDetails?.passportAuthority ??
                              t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<Building2 />}
                        label={t("Legal Entity")}
                        value={
                          canViewPrivateDetails
                            ? (privateDetails?.legalEntity ?? t("Not provided"))
                            : t("Restricted")
                        }
                      />
                    </dl>
                  </article>
                  <EmployeeProfileRecords
                    employeeId={employee.id}
                    initialRecords={profileRecords}
                    canEdit={canEditEmployee}
                    technologyOptions={referenceValues}
                    readOnlyPreview={isPreview}
                    personalLayout
                    visibleKinds={["emergency_contact"]}
                    cardTitle="Contacts"
                    intro={
                      <dl className="detail-list profile-contact-intro">
                        <Detail
                          icon={<Phone />}
                          label={t("Mobile phone")}
                          value={
                            canViewSensitive
                              ? (employee.phone ?? t("Not provided"))
                              : t("Restricted")
                          }
                        />
                        <Detail
                          icon={<MapPin />}
                          label={t("Address")}
                          value={
                            canViewSensitive
                              ? (employee.address ?? t("Not provided"))
                              : t("Restricted")
                          }
                        />
                      </dl>
                    }
                  />
                  <EmployeeProfileRecords
                    employeeId={employee.id}
                    initialRecords={profileRecords}
                    canEdit={canEditEmployee}
                    technologyOptions={referenceValues}
                    readOnlyPreview={isPreview}
                    personalLayout
                    visibleKinds={["skill"]}
                  />
                  <EmployeeProfileRecords
                    employeeId={employee.id}
                    initialRecords={profileRecords}
                    canEdit={canEditEmployee}
                    technologyOptions={referenceValues}
                    readOnlyPreview={isPreview}
                    personalLayout
                    visibleKinds={["education"]}
                  />
                  <EmployeeProfileRecords
                    employeeId={employee.id}
                    initialRecords={profileRecords}
                    canEdit={canEditEmployee}
                    technologyOptions={referenceValues}
                    readOnlyPreview={isPreview}
                    personalLayout
                    visibleKinds={["certification"]}
                  />
                </div>
                <div className="profile-personal-right">
                  <article className="panel profile-primary-panel">
                    <ProfileCardHeading title={t("Main")} />
                    <dl className="detail-list">
                      <Detail
                        icon={<Phone />}
                        label={t("Mobile phone")}
                        value={
                          canViewSensitive
                            ? (employee.phone ?? t("Not provided"))
                            : t("Restricted")
                        }
                      />
                      <Detail
                        icon={<CalendarDays />}
                        label={t("Start date")}
                        value={formatDate(employee.startDate, locale)}
                      />
                      <Detail
                        icon={<BriefcaseBusiness />}
                        label={t("Employment type")}
                        value={employee.employmentType}
                      />
                      <Detail
                        icon={<BriefcaseBusiness />}
                        label={t("Position")}
                        value={employee.jobTitle}
                      />
                      <Detail
                        icon={<BriefcaseBusiness />}
                        label={t("Level")}
                        value={employee.level ?? t("Not specified")}
                      />
                      <Detail
                        icon={<Network />}
                        label={t("Department")}
                        value={employee.department}
                      />
                      <Detail
                        icon={<Network />}
                        label={t("Division")}
                        value={employee.division}
                      />
                      <Detail
                        icon={<MapPin />}
                        label={t("Location")}
                        value={employee.location}
                      />
                      <Detail
                        icon={<CalendarDays />}
                        label={t("Time at company")}
                        value={formatEmployeeTenure(
                          tenureEmployee,
                          locale,
                          today,
                        )}
                      />
                    </dl>
                  </article>
                  <RelationshipCard
                    title={t("Manager")}
                    emoji="👤"
                    items={
                      visibleRelationships.manager
                        ? [visibleRelationships.manager]
                        : []
                    }
                    empty={t("No manager assigned.")}
                  />
                  <RelationshipCard
                    title={t("Direct reports")}
                    emoji="👥"
                    items={visibleRelationships.directReports}
                    empty={t("No direct reports.")}
                  />
                  <article className="panel profile-primary-panel">
                    <ProfileCardHeading title={t("Teams")} emoji="👥" />
                    <RelationshipList
                      items={visibleRelationships.teammates}
                      empty={t("No active teammates.")}
                    />
                  </article>
                </div>
              </div>
            ),
          },
          {
            id: "work",
            label: t("Work"),
            content: (
              <div className="profile-work-layout">
                <div className="profile-work-left">
                  <article className="panel profile-primary-panel">
                    <ProfileCardHeading
                      title={t("Positions")}
                      emoji="💼"
                      actions={
                        canEditEmployee && employee.status !== "inactive" ? (
                          <div className="profile-position-actions">
                            <EmployeeProfileEditButton
                              employee={employeeEditDto}
                              privateDetails={
                                access.viewSensitiveData
                                  ? privateDetails
                                  : undefined
                              }
                              canEditSensitive={access.viewSensitiveData}
                              managerOptions={managerOptions}
                              orgUnits={orgUnits}
                              referenceValues={referenceValues}
                              technologies={profileRecords
                                .filter((record) => record.kind === "skill")
                                .map((record) => record.title)}
                              buttonLabel="Add position"
                              buttonClassName="button ghost-button"
                              icon={<Plus size={15} />}
                              mode="employment-change"
                            />
                            <EmployeeProfileEditButton
                              employee={employeeEditDto}
                              privateDetails={
                                access.viewSensitiveData
                                  ? privateDetails
                                  : undefined
                              }
                              canEditSensitive={access.viewSensitiveData}
                              managerOptions={managerOptions}
                              orgUnits={orgUnits}
                              referenceValues={referenceValues}
                              technologies={profileRecords
                                .filter((record) => record.kind === "skill")
                                .map((record) => record.title)}
                              buttonLabel="Edit"
                              buttonClassName="icon-button"
                              ariaLabel="Edit position"
                              icon={<Pencil size={15} />}
                              iconOnly
                              mode="employment-edit"
                            />
                          </div>
                        ) : undefined
                      }
                    />
                    <p className="profile-updated-note">
                      {t("Effective since")}{" "}
                      {formatShortDate(lastStateChange, locale)}
                    </p>
                    <dl className="detail-list profile-work-facts">
                      <Detail
                        icon={<BriefcaseBusiness />}
                        label={t("Position")}
                        value={employee.jobTitle}
                      />
                      <Detail
                        icon={<BriefcaseBusiness />}
                        label={t("Level")}
                        value={employee.level ?? t("Not specified")}
                      />
                      <Detail
                        icon={<Network />}
                        label={t("Manager")}
                        value={
                          visibleRelationships.manager
                            ? `${visibleRelationships.manager.firstName} ${visibleRelationships.manager.lastName}`
                            : t("Not assigned")
                        }
                      />
                      <Detail
                        icon={<MapPin />}
                        label={t("Location")}
                        value={employee.location}
                      />
                      <Detail
                        icon={<Network />}
                        label={t("Division")}
                        value={employee.division}
                      />
                      <Detail
                        icon={<Network />}
                        label={t("Department")}
                        value={employee.department}
                      />
                    </dl>
                  </article>
                  <article className="panel profile-primary-panel">
                    <ProfileCardHeading
                      title={t("Employment cycle")}
                      emoji="🔄"
                    />
                    <div className="employment-cycle-groups">
                      <section className="employment-cycle-group">
                        <dl className="detail-list employment-cycle-facts">
                          <Detail
                            icon={<BriefcaseBusiness />}
                            label={t("Lifecycle stage")}
                            value={t(
                              lifecycleStage === "working"
                                ? "Working"
                                : lifecycleStage === "probation"
                                  ? "Probation"
                                  : lifecycleStage === "on_leave"
                                    ? "On leave"
                                    : "Terminated",
                            )}
                          />
                          <Detail
                            icon={<BriefcaseBusiness />}
                            label={t("Employment type")}
                            value={employee.employmentType}
                          />
                          <Detail
                            icon={<CalendarDays />}
                            label={t("Probation end")}
                            value={
                              employee.probationEnd
                                ? formatDate(employee.probationEnd, locale)
                                : t("Not set")
                            }
                          />
                          <Detail
                            icon={<CalendarDays />}
                            label={t("Work schedule")}
                            value={
                              schedule.source === "default"
                                ? t("By default")
                                : formatSchedule(schedule, locale, t)
                            }
                          />
                          <Detail
                            icon={<CalendarDays />}
                            label={t("Start date")}
                            value={formatDate(employee.startDate, locale)}
                          />
                          <Detail
                            icon={<CalendarDays />}
                            label={t("Time at company")}
                            value={formatEmployeeTenure(
                              tenureEmployee,
                              locale,
                              today,
                            )}
                          />
                          <Detail
                            icon={<CalendarDays />}
                            label={t("Termination date")}
                            value={
                              termination
                                ? formatDate(termination.lastWorkingDay, locale)
                                : t("Not applicable")
                            }
                          />
                          <Detail
                            icon={<BriefcaseBusiness />}
                            label={t("Termination type")}
                            value={
                              termination
                                ? t(termination.terminationType)
                                : t("Not applicable")
                            }
                          />
                          <Detail
                            icon={<ShieldCheck />}
                            label={t("Eligible for rehire")}
                            value={
                              termination
                                ? termination.rehireEligible
                                  ? t("Yes")
                                  : t("No")
                                : t("Not applicable")
                            }
                          />
                        </dl>
                      </section>
                      <section className="employment-cycle-group">
                        <dl className="detail-list employment-cycle-facts">
                          <Detail
                            icon={<History />}
                            label={t("Experience before employment")}
                            value={
                              previousExperienceDays === null
                                ? t("Not available")
                                : formatExperienceDays(
                                    previousExperienceDays,
                                    locale,
                                  )
                            }
                          />
                          <Detail
                            icon={<History />}
                            label={t("Total work experience")}
                            value={
                              totalExperience === null
                                ? t("Not available")
                                : formatExperienceDays(totalExperience, locale)
                            }
                          />
                          <Detail
                            icon={<History />}
                            label={t("Termination reasons")}
                            value={
                              terminationReasonsText || t("Not applicable")
                            }
                          />
                          <Detail
                            icon={<History />}
                            label={t("Description")}
                            value={
                              termination?.description || t("Not applicable")
                            }
                          />
                        </dl>
                      </section>
                    </div>
                  </article>
                </div>
                <article className="panel profile-primary-panel profile-work-timeline">
                  <ProfileCardHeading title={t("Timeline")} emoji="🕘" />
                  <div className="history-timeline">
                    {employmentTimeline.map((item, index) => (
                      <TimelineItem
                        key={`${item.kind}-${item.date}-${index}`}
                        date={item.date}
                        title={
                          item.kind === "hired"
                            ? t("Hired")
                            : item.kind === "probation"
                              ? t(
                                  item.date <= today
                                    ? "Probation completed"
                                    : "Probation ends",
                                )
                              : item.kind === "termination"
                                ? t("Employment ended")
                                : formatEmploymentReason(
                                    item.state.changeReason,
                                    t,
                                  ) || t("Employment changed")
                        }
                        detail={
                          item.kind === "termination"
                            ? item.terminationType
                              ? t(item.terminationType)
                              : ""
                            : item.kind === "probation"
                              ? t("Probation period")
                              : [
                                  item.state.jobTitle,
                                  item.state.department,
                                  item.state.level,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                        }
                        locale={locale}
                      />
                    ))}
                  </div>
                </article>
              </div>
            ),
          },
          ...(canViewSensitive
            ? [
                {
                  id: "compensation",
                  label: t("Compensation"),
                  content: (
                    <EmployeeCompensation
                      employeeId={employee.id}
                      initialItems={compensationItems}
                      canEdit={canEditEmployee && access.viewSensitiveData}
                      canReveal={!isPreview}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "leave",
            label: t("Leave"),
            content: (
              <article className="panel profile-primary-panel">
                <ProfileCardHeading title={t("Balances")} emoji="🏖️" />
                <div className="mini-data-list">
                  {canViewLeave &&
                    leave.balances.map((balance) => (
                      <div key={balance.id}>
                        <i style={{ background: balance.color }} />
                        <span>{t(balance.name)}</span>
                        <strong>
                          {formatCount(
                            locale,
                            balance.allowance +
                              balance.adjustment -
                              balance.used,
                            { one: "день", few: "дні", many: "днів" },
                            { one: "day", many: "days" },
                          )}
                        </strong>
                      </div>
                    ))}
                  {!canViewLeave && (
                    <p className="muted profile-empty-state">
                      {t("Leave details are restricted.")}
                    </p>
                  )}
                  {canViewLeave && leave.balances.length === 0 && (
                    <p className="muted profile-empty-state">
                      {t("No balance assigned.")}
                    </p>
                  )}
                </div>
              </article>
            ),
          },
          ...(canViewSensitive
            ? [
                {
                  id: "documents",
                  label: t("Documents"),
                  content: (
                    <EmployeeDocuments
                      employeeId={employee.id}
                      initialDocuments={documents}
                      initialFolders={documentFolders}
                      canUpload={!isPreview && (access.managePeople || isSelf)}
                      canDelete={!isPreview && access.managePeople}
                      canManageFolders={!isPreview && access.managePeople}
                      readOnlyPreview={isPreview}
                    />
                  ),
                },
              ]
            : []),
          ...(isSelf || access.managePeople || isDirectManager
            ? [
                {
                  id: "assets",
                  label: t("Assets"),
                  content: (
                    <EmployeeAssets
                      assets={assets}
                      canManage={!isPreview && access.managePeople}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "history",
            label: t("History"),
            content: (
              <article className="panel profile-history profile-primary-panel">
                <ProfileCardHeading title={t("Timeline")} emoji="🕘" />
                <div className="history-timeline">
                  {canViewSensitive &&
                    history.map((item) => (
                      <div key={item.id}>
                        <span className="history-icon">
                          <History size={15} />
                        </span>
                        <span>
                          <strong>
                            {formatEmploymentReason(item.changeReason, t)}
                          </strong>
                          <small>
                            {item.jobTitle} · {item.department}
                          </small>
                        </span>
                        <time>{formatDate(item.effectiveDate, locale)}</time>
                      </div>
                    ))}
                  {!canViewSensitive && (
                    <p className="muted profile-empty-state">
                      {t("Employment history is restricted.")}
                    </p>
                  )}
                </div>
              </article>
            ),
          },
          {
            id: "more",
            label: t("More"),
            content: (
              <div className="profile-tab-grid">
                <EmployeeProfileRecords
                  employeeId={employee.id}
                  initialRecords={profileRecords}
                  canEdit={canEditEmployee}
                  technologyOptions={referenceValues}
                  readOnlyPreview={isPreview}
                  visibleKinds={["dependent", "experience"]}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt>
        {icon}
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function RelationshipCard({
  title,
  emoji,
  items,
  empty,
}: {
  title: string;
  emoji: string;
  items: Parameters<typeof RelationshipList>[0]["items"];
  empty: string;
}) {
  return (
    <article className="panel profile-primary-panel profile-relationship-card">
      <ProfileCardHeading title={title} emoji={emoji} />
      <RelationshipList items={items} empty={empty} />
    </article>
  );
}

function RelationshipList({
  items,
  empty,
}: {
  items: Array<{
    id: number;
    firstName: string;
    lastName: string;
    jobTitle: string;
    department: string;
    photoFileId: string | null;
  }>;
  empty: string;
}) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <div className="profile-relationship-list">
      {items.map((person) => (
        <Link
          href={`/employees/${person.id}`}
          key={person.id}
          className="profile-relationship-person"
        >
          {person.photoFileId ? (
            <Image
              src={`/api/files/${person.photoFileId}`}
              alt=""
              width={38}
              height={38}
              unoptimized
            />
          ) : (
            <span className="profile-relationship-initials" aria-hidden="true">
              {person.firstName[0]}
              {person.lastName[0]}
            </span>
          )}
          <span>
            <strong>
              {person.firstName} {person.lastName}
            </strong>
            <small>
              {person.jobTitle} · {person.department}
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}

function TimelineItem({
  date,
  title,
  detail,
  locale,
}: {
  date: string;
  title: string;
  detail: string;
  locale: "uk" | "en";
}) {
  return (
    <div>
      <span className="history-icon">
        <History size={15} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <time>{formatDate(date, locale)}</time>
    </div>
  );
}

function formatSchedule(
  schedule: {
    workDays: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  },
  locale: "uk" | "en",
  t: (key: string) => string,
) {
  const labels =
    locale === "uk"
      ? ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
      : ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = schedule.workDays
    .split(",")
    .map(Number)
    .filter((day) => day >= 1 && day <= 7)
    .map((day) => labels[day]);
  const dayText =
    days.length === 5 && days.join(",") === labels.slice(1, 6).join(",")
      ? `${labels[1]}–${labels[5]}`
      : days.join(", ") || t("No work days configured");
  return `${dayText}, ${schedule.startTime}–${schedule.endTime}, ${schedule.breakMinutes} ${t("min break")}`;
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatEmploymentReason(reason: string, t: (key: string) => string) {
  if (reason === "Profile updated") return t("Employment details changed");
  if (reason === "Employment details changed")
    return t("Employment details changed");
  if (reason === "Employee created") return t("Employee created");
  if (reason === "Employee rehired") return t("Employee rehired");
  if (reason === "Employment change recorded") return t("Employment changed");
  if (reason === "Current employment details corrected")
    return t("Employment details corrected");
  return reason;
}

function formatShortDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
