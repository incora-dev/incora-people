import type { EmployeeRecord, EmployeeEditDto } from "@/modules/people/types";

/** Self and explicitly granted sensitive-data access are the only read paths. */
export function canReadEmployeeSensitiveData(
  employeeId: number,
  viewerEmployeeId: number | null,
  viewSensitiveData: boolean,
) {
  return viewerEmployeeId === employeeId || viewSensitiveData;
}

/** HR-only private-record fields require the explicit sensitive-data grant. */
export function canReadEmployeePrivateDetails(viewSensitiveData: boolean) {
  return viewSensitiveData;
}

const sensitiveEmployeeMutationFields = new Set([
  "personalEmail",
  "phone",
  "birthDate",
  "gender",
  "address",
  "taxCode",
  "contractEndDate",
  "passportNumber",
  "passportDate",
  "passportAuthority",
  "legalEntityValueId",
]);

export function sensitiveEmployeeMutationResponse(
  payload: unknown,
  viewSensitiveData: boolean,
) {
  if (viewSensitiveData || !payload || typeof payload !== "object") return null;
  const denied = Object.keys(payload).some((key) =>
    sensitiveEmployeeMutationFields.has(key),
  );
  return denied
    ? Response.json(
        { error: "Sensitive employee data access is required." },
        { status: 403 },
      )
    : null;
}

export function toEmployeeEditDto(
  employee: EmployeeRecord,
  includeSensitiveValues: boolean,
): EmployeeEditDto {
  const safe: EmployeeEditDto = {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    jobTitle: employee.jobTitle,
    department: employee.department,
    employmentType: employee.employmentType,
    status: employee.status,
    startDate: employee.startDate,
    managerId: employee.managerId,
    employeeCode: employee.employeeCode,
    ukrainianName: employee.ukrainianName,
    division: employee.division,
    team: employee.team,
    level: employee.level,
    probationEnd: employee.probationEnd,
    location: employee.location,
    divisionUnitId: employee.divisionUnitId,
    departmentUnitId: employee.departmentUnitId,
    teamUnitId: employee.teamUnitId,
  };
  if (!includeSensitiveValues) return safe;
  return {
    ...safe,
    personalEmail: employee.personalEmail,
    phone: employee.phone,
    birthDate: employee.birthDate,
    gender: employee.gender,
    address: employee.address,
  };
}

/** Also binds a compensation file to both its stored-file owner and record owner. */
export function canReadCompensationAttachment(input: {
  fileOwnerEmployeeId: number;
  compensationOwnerEmployeeId: number;
  viewerEmployeeId: number | null;
  viewSensitiveData: boolean;
}) {
  return (
    input.fileOwnerEmployeeId === input.compensationOwnerEmployeeId &&
    canReadEmployeeSensitiveData(
      input.compensationOwnerEmployeeId,
      input.viewerEmployeeId,
      input.viewSensitiveData,
    )
  );
}
