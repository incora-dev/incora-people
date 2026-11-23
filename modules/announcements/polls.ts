export type PollOption = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
};

export type PollQuestion = {
  id: string;
  title: string;
  description: string;
  type: "single" | "multiple" | "text";
  required: boolean;
  options: PollOption[];
};

export function parsePollAnswers(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const answers: Record<string, string | string[]> = {};
    for (const [key, answer] of Object.entries(parsed)) {
      if (typeof answer === "string") answers[key] = answer.slice(0, 2_000);
      else if (
        Array.isArray(answer) &&
        answer.every((item) => typeof item === "string")
      )
        answers[key] = answer.slice(0, 30).map((item) => item.slice(0, 200));
    }
    return answers;
  } catch {
    return {};
  }
}

export function parsePollQuestions(
  questionsJson: string | null | undefined,
  legacyQuestion = "",
  legacyOptionsJson = "[]",
): PollQuestion[] {
  const validated = validatePollQuestions(questionsJson || "[]");
  if (validated.ok && validated.value.length) return validated.value;
  if (!legacyQuestion) return [];
  let options: string[] = [];
  try {
    const parsedOptions = JSON.parse(legacyOptionsJson) as unknown;
    if (Array.isArray(parsedOptions)) {
      options = parsedOptions
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 50);
    }
  } catch {}
  return [
    {
      id: "legacy-question",
      title: legacyQuestion,
      description: "",
      type: "single",
      required: true,
      options: options.map((title, index) => ({
        id: `legacy-option-${index}`,
        title,
        description: "",
        imageUrl: "",
      })),
    },
  ];
}

export function validatePollQuestions(
  value: string,
): { ok: true; value: PollQuestion[] } | { ok: false; error: string } {
  try {
    const questions = JSON.parse(value || "[]") as unknown;
    if (!Array.isArray(questions) || questions.length > 30) throw new Error();
    const questionIds = new Set<string>();
    const normalized: PollQuestion[] = [];
    for (const rawQuestion of questions) {
      if (!rawQuestion || typeof rawQuestion !== "object") throw new Error();
      const question = rawQuestion as Record<string, unknown>;
      const id = typeof question.id === "string" ? question.id.trim() : "";
      const title =
        typeof question.title === "string" ? question.title.trim() : "";
      const description =
        typeof question.description === "string"
          ? question.description.trim()
          : "";
      const type = question.type;
      const required = question.required;
      const options = question.options;
      if (
        !id ||
        id.length > 100 ||
        questionIds.has(id) ||
        !title ||
        title.length > 300 ||
        description.length > 2_000 ||
        !["single", "multiple", "text"].includes(type as string) ||
        typeof required !== "boolean"
      )
        throw new Error();
      questionIds.add(id);
      const normalizedOptions: PollOption[] = [];
      if (
        type !== "text" &&
        (!Array.isArray(options) || options.length > 50 || options.length < 2)
      )
        return {
          ok: false,
          error: "Each choice question needs at least two titled options.",
        };
      if (type !== "text") {
        const optionIds = new Set<string>();
        for (const rawOption of options as unknown[]) {
          if (!rawOption || typeof rawOption !== "object") throw new Error();
          const option = rawOption as Record<string, unknown>;
          const optionId =
            typeof option.id === "string" ? option.id.trim() : "";
          const optionTitle =
            typeof option.title === "string" ? option.title.trim() : "";
          const optionDescription =
            typeof option.description === "string"
              ? option.description.trim()
              : "";
          const imageUrl =
            typeof option.imageUrl === "string" ? option.imageUrl.trim() : "";
          if (
            !optionId ||
            optionId.length > 100 ||
            optionIds.has(optionId) ||
            !optionTitle ||
            optionTitle.length > 300 ||
            optionDescription.length > 1_000 ||
            imageUrl.length > 2_000 ||
            (imageUrl &&
              (!imageUrl.startsWith("/api/files/") ||
                imageUrl.startsWith("//")))
          )
            throw new Error();
          optionIds.add(optionId);
          normalizedOptions.push({
            id: optionId,
            title: optionTitle,
            description: optionDescription,
            imageUrl,
          });
        }
      } else if (options !== undefined && !Array.isArray(options)) {
        throw new Error();
      }
      normalized.push({
        id,
        title,
        description,
        type: type as PollQuestion["type"],
        required,
        options: normalizedOptions,
      });
    }
    return { ok: true, value: normalized };
  } catch {
    return { ok: false, error: "Invalid questionnaire." };
  }
}
