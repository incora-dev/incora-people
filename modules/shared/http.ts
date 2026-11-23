import { z } from "zod";

export async function parseJsonRequest<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  maxBytes = 256_000,
): Promise<
  { ok: true; data: z.output<TSchema> } | { ok: false; response: Response }
> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: Response.json(
        { error: "Request body is too large." },
        { status: 413 },
      ),
    };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const errors = z.flattenError(result.error);

  return {
    ok: false,
    response: Response.json(
      {
        error: "Check the submitted fields.",
        fields: errors.fieldErrors,
        issues: errors.formErrors,
      },
      { status: 400 },
    ),
  };
}
