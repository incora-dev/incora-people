import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getAssetsWorkspaceData } from "@/modules/assets/queries";
import { getCompanyDocuments } from "@/modules/documents/queries";
import { getEmployeeDocuments } from "@/modules/files/storage";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const access = await getAccessPolicy(clientUser.user);
  const [assets, companyDocuments, employeeDocuments] = await Promise.all([
    getAssetsWorkspaceData(clientUser.user, access),
    getCompanyDocuments(),
    clientUser.user.employeeId
      ? getEmployeeDocuments(clientUser.user.employeeId)
      : Promise.resolve([]),
  ]);
  return Response.json({
    assets: assets.assets,
    companyDocuments,
    employeeDocuments,
  });
}
