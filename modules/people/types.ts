import type { employees } from "@/db/schema";

export type EmployeeRecord = typeof employees.$inferSelect;

export type EmployeeEditDto = Pick<
  EmployeeRecord,
  | "id"
  | "firstName"
  | "lastName"
  | "email"
  | "jobTitle"
  | "department"
  | "employmentType"
  | "status"
  | "startDate"
  | "managerId"
  | "employeeCode"
  | "ukrainianName"
  | "division"
  | "team"
  | "level"
  | "probationEnd"
  | "location"
  | "divisionUnitId"
  | "departmentUnitId"
  | "teamUnitId"
> &
  Partial<
    Pick<
      EmployeeRecord,
      "personalEmail" | "phone" | "birthDate" | "gender" | "address"
    >
  >;

export type EmployeeDirectoryItem = Pick<
  EmployeeRecord,
  | "id"
  | "firstName"
  | "lastName"
  | "email"
  | "jobTitle"
  | "employmentType"
  | "level"
  | "department"
  | "division"
  | "team"
  | "location"
  | "managerName"
  | "startDate"
  | "status"
  | "probationEnd"
  | "managerId"
> & {
  workMode: "office" | "remote";
  photoFileId: string | null;
  technologies: string | null;
  lifecycleStatus: "working" | "probation" | "terminated" | "on_leave";
  lastWorkingDay: string | null;
};

export type EmployeeManagerOption = Pick<
  EmployeeRecord,
  "id" | "firstName" | "lastName" | "jobTitle"
>;
