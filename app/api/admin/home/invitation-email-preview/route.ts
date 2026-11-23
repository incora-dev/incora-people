import { getServerI18n } from "@/lib/i18n-server";
import { getAppMode, getEmployeeInvitationConfig } from "@/lib/runtime-config";
import { sendEmployeeInvitationPreview } from "@/modules/invitations/preview";
import { handleAdminEmailPreview } from "@/modules/notifications/admin-email-preview";

export function POST(request: Request) {
  return handleAdminEmailPreview(request, "invitation", () => {
    const config = getEmployeeInvitationConfig();
    if (getAppMode() !== "protected" || !config.enabled) return null;
    return {
      send: async (requestId) => {
        const { locale } = await getServerI18n();
        return sendEmployeeInvitationPreview({ ...config, locale, requestId });
      },
    };
  });
}
