import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/CalendarWorkspace";
import { getLeaveCalendar } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  return (
    <CalendarWorkspace
      events={await getLeaveCalendar()}
      readOnlyPreview={user.isPreview === true}
    />
  );
}
