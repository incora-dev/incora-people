import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, users } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const { user, clientType } = clientUser;
  const access = await getAccessPolicy(user);
  const [employee] = user.employeeId
    ? await getDb()
        .select()
        .from(employees)
        .where(eq(employees.id, user.employeeId))
        .limit(1)
    : [];
  const [account] = await getDb()
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);
  return Response.json({
    user: {
      ...user,
      firstName: employee?.firstName ?? user.email.split("@")[0],
      lastName: employee?.lastName ?? "",
      jobTitle: employee?.jobTitle ?? "Employee",
      locale: account?.locale ?? "uk",
    },
    access,
    clientType,
    capabilities: { apiVersion: "v1", minimumClientVersion: "0.1.0" },
  });
}
