import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { announcementPollResponses, announcementPolls } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedAnnouncement } from "@/modules/dashboard/queries";
import { parsePollQuestions } from "@/modules/announcements/polls";
import { parseJsonRequest } from "@/modules/shared/http";

const answerValueSchema = z.union([
  z.string().trim().max(2_000),
  z.array(z.string().trim().max(200)).max(30),
]);
const pollResponseSchema = z.object({
  pollId: z.number().int().positive(),
  answers: z.record(z.string().trim().min(1).max(100), answerValueSchema),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const parsed = await parseJsonRequest(request, pollResponseSchema, 128_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const [poll] = await getDb()
    .select()
    .from(announcementPolls)
    .where(
      and(
        eq(announcementPolls.id, body.pollId),
        eq(announcementPolls.active, true),
      ),
    )
    .limit(1);
  if (!poll)
    return Response.json({ error: "Invalid poll response." }, { status: 400 });
  if (!(await getPublishedAnnouncement(poll.announcementId))) {
    return Response.json(
      { error: "Poll is no longer available." },
      { status: 409 },
    );
  }
  const questions = parsePollQuestions(
    poll.questionsJson,
    poll.question,
    poll.optionsJson,
  );
  if (!questions.length) {
    return Response.json(
      { error: "Poll has no valid questions." },
      { status: 409 },
    );
  }
  const questionIds = new Set(questions.map((question) => question.id));
  const answerKeys = Object.keys(body.answers);
  if (
    answerKeys.length > questions.length ||
    answerKeys.some((id) => !questionIds.has(id))
  ) {
    return Response.json({ error: "Invalid poll response." }, { status: 400 });
  }
  for (const question of questions) {
    const answer = body.answers[question.id];
    if (
      question.required &&
      (!answer || (Array.isArray(answer) && !answer.length))
    )
      return Response.json(
        { error: "Answer every required question." },
        { status: 400 },
      );
    if (question.type === "text") {
      if (answer !== undefined && typeof answer !== "string") {
        return Response.json(
          { error: "Text answers must be plain text." },
          { status: 400 },
        );
      }
      continue;
    }
    const values = Array.isArray(answer) ? answer : answer ? [answer] : [];
    if (question.type === "single" && values.length > 1)
      return Response.json(
        { error: "Invalid poll response." },
        { status: 400 },
      );
    if (
      values.some(
        (value) => !question.options.some((option) => option.id === value),
      )
    )
      return Response.json(
        { error: "Invalid poll response." },
        { status: 400 },
      );
    if (new Set(values).size !== values.length) {
      return Response.json(
        { error: "A poll choice cannot be selected twice." },
        { status: 400 },
      );
    }
  }
  const [existing] = await getDb()
    .select()
    .from(announcementPollResponses)
    .where(
      and(
        eq(announcementPollResponses.pollId, poll.id),
        user.userId
          ? or(
              eq(announcementPollResponses.userId, user.userId),
              eq(announcementPollResponses.userEmail, user.email),
            )
          : eq(announcementPollResponses.userEmail, user.email),
      ),
    )
    .limit(1);
  const [response] = existing
    ? await getDb()
        .update(announcementPollResponses)
        .set({
          optionIndex: 0,
          answersJson: JSON.stringify(body.answers),
          userId: user.userId,
        })
        .where(eq(announcementPollResponses.id, existing.id))
        .returning()
    : await getDb()
        .insert(announcementPollResponses)
        .values({
          pollId: poll.id,
          userEmail: user.email,
          userId: user.userId,
          optionIndex: 0,
          answersJson: JSON.stringify(body.answers),
        })
        .returning();
  return Response.json({ response });
}
