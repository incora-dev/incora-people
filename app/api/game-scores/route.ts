import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, gameScores } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

async function leaderboard() {
  return getDb()
    .select({
      employeeId: gameScores.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      score: gameScores.bestScore,
      updatedAt: gameScores.updatedAt,
    })
    .from(gameScores)
    .innerJoin(employees, eq(gameScores.employeeId, employees.id))
    .orderBy(desc(gameScores.bestScore), gameScores.updatedAt)
    .limit(10);
}

export async function GET() {
  await getCurrentUser();
  return Response.json({ leaderboard: await leaderboard() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Employee account required." },
      { status: 409 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { score?: unknown };
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 0 || score > 1_000_000) {
    return Response.json({ error: "Invalid score." }, { status: 400 });
  }
  const now = new Date().toISOString();
  await getDb()
    .insert(gameScores)
    .values({
      employeeId: user.employeeId,
      userEmail: user.email,
      bestScore: score,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gameScores.employeeId,
      set: {
        bestScore: sql`max(${gameScores.bestScore}, ${score})`,
        userEmail: user.email,
        updatedAt: now,
      },
    });
  return Response.json({ leaderboard: await leaderboard() });
}
