"use client";
import { FormEvent, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/LocaleProvider";
import type { PollQuestion } from "@/modules/announcements/polls";

export function AnnouncementPoll({
  poll,
  readOnlyPreview = false,
}: {
  poll: {
    id: number;
    title: string;
    description: string;
    questions: PollQuestion[];
    answers: Record<string, string | string[]>;
    responseCount: number;
  };
  readOnlyPreview?: boolean;
}) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState(poll.answers);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(Boolean(Object.keys(poll.answers).length));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnlyPreview) return;
    setBusy(true);
    const response = await fetch("/api/announcements/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollId: poll.id, answers }),
    });
    setBusy(false);
    if (response.ok) setSaved(true);
  }
  function toggle(questionId: string, optionId: string) {
    const existing = Array.isArray(answers[questionId])
      ? (answers[questionId] as string[])
      : [];
    setAnswers({
      ...answers,
      [questionId]: existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId],
    });
  }
  return (
    <form className="announcement-poll questionnaire" onSubmit={submit}>
      <p className="eyebrow">{t("Questionnaire")}</p>
      <h2>{poll.title}</h2>
      {poll.description && <p>{poll.description}</p>}
      {poll.questions.map((question, index) => (
        <fieldset className="poll-form-question" key={question.id}>
          <legend>
            <span>{index + 1}</span>
            <strong>{question.title}</strong>
            {question.required && <em>*</em>}
          </legend>
          {question.description && <p>{question.description}</p>}
          {question.type === "text" ? (
            <textarea
              required={question.required && !readOnlyPreview}
              disabled={readOnlyPreview}
              value={(answers[question.id] as string) ?? ""}
              onChange={(event) =>
                setAnswers({ ...answers, [question.id]: event.target.value })
              }
            />
          ) : (
            <div className="poll-answer-grid">
              {question.options.map((option) => {
                const selected =
                  question.type === "multiple"
                    ? (
                        (answers[question.id] as string[] | undefined) ?? []
                      ).includes(option.id)
                    : answers[question.id] === option.id;
                return (
                  <label className={selected ? "selected" : ""} key={option.id}>
                    {option.imageUrl && !readOnlyPreview && (
                      <Image
                        src={option.imageUrl}
                        alt=""
                        width={320}
                        height={160}
                        unoptimized
                      />
                    )}
                    <input
                      type={question.type === "multiple" ? "checkbox" : "radio"}
                      name={question.id}
                      required={
                        question.required &&
                        question.type === "single" &&
                        !readOnlyPreview
                      }
                      checked={selected}
                      disabled={readOnlyPreview}
                      onChange={() =>
                        question.type === "multiple"
                          ? toggle(question.id, option.id)
                          : setAnswers({ ...answers, [question.id]: option.id })
                      }
                    />
                    <span>
                      <strong>{option.title}</strong>
                      {option.description && (
                        <small>{option.description}</small>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}
      {readOnlyPreview ? (
        <p className="muted">
          {t("Responses are unavailable in read-only preview.")}
        </p>
      ) : (
        <button className="button primary-button" disabled={busy}>
          {busy
            ? t("Saving…")
            : saved
              ? t("Update response")
              : t("Submit response")}
        </button>
      )}
      <small>
        {poll.responseCount} {t("responses")}
      </small>
    </form>
  );
}
