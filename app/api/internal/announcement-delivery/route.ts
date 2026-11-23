import { getAnnouncementDeliveryConfig } from "@/lib/runtime-config";
import { processAnnouncementDeliveries } from "@/modules/announcements/delivery";
export async function POST(request: Request) {
  const secret = getAnnouncementDeliveryConfig().cronSecret;
  if (!secret)
    return Response.json(
      { error: "Announcement cron is not configured." },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json({
    processed: await processAnnouncementDeliveries(new URL(request.url).origin),
  });
}
