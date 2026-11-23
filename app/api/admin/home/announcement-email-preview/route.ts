import { getAnnouncementDeliveryConfig } from "@/lib/runtime-config";
import { sendAnnouncementEmailPreview } from "@/modules/announcements/email";
import { handleAdminEmailPreview } from "@/modules/notifications/admin-email-preview";

export function POST(request: Request) {
  return handleAdminEmailPreview(request, "announcement", () => {
    const { appMode, resendApiKey, resendFrom, publicOrigin } =
      getAnnouncementDeliveryConfig();
    if (
      appMode !== "protected" ||
      !resendApiKey ||
      !resendFrom ||
      !publicOrigin
    )
      return null;
    return {
      send: (requestId) =>
        sendAnnouncementEmailPreview({
          from: resendFrom,
          publicOrigin,
          apiKey: resendApiKey,
          requestId,
        }),
    };
  });
}
