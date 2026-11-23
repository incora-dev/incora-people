export type PeopleTaskDto = {
  id: number;
  title: string;
  description: string;
  category: string;
  assigneeEmployeeId: number;
  assigneeFirstName: string;
  assigneeLastName: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  status: string;
  createdByEmail: string;
  completedAt: string | null;
  createdAt: string;
};

export type TaskAssigneeDto = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
};
