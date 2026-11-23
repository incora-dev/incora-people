import { getApiClientUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { breakCommandSchema } from "@/modules/time/contracts";
import { BreakCommandError, changeBreak } from "@/modules/time/break-commands";

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const parsed = await parseJsonRequest(request, breakCommandSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await changeBreak(client.user, parsed.data);
    return Response.json(
      { mode: result.mode, entry: result.entry },
      { status: result.mode === "break_start" ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof BreakCommandError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
