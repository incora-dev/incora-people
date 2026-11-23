"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { PollQuestion } from "@/modules/announcements/polls";

const id = () => crypto.randomUUID();
const emptyOption = () => ({
  id: id(),
  title: "",
  description: "",
  imageUrl: "",
});
const emptyQuestion = (): PollQuestion => ({
  id: id(),
  title: "",
  description: "",
  type: "single",
  required: true,
  options: [emptyOption(), emptyOption()],
});

export function PollBuilder({
  initialQuestions = [],
}: {
  initialQuestions?: PollQuestion[];
}) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<PollQuestion[]>(initialQuestions);
  function updateQuestion(index: number, patch: Partial<PollQuestion>) {
    setQuestions((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <section className="poll-builder">
      <input
        type="hidden"
        name="pollQuestions"
        value={JSON.stringify(questions)}
      />
      <header>
        <div>
          <strong>{t("Questionnaire")}</strong>
          <small>{t("Build a form with one or more questions.")}</small>
        </div>
        <button
          className="button ghost-button"
          type="button"
          onClick={() => setQuestions((items) => [...items, emptyQuestion()])}
        >
          <Plus size={15} /> {t("Add question")}
        </button>
      </header>
      {questions.map((question, questionIndex) => (
        <article className="poll-question-editor" key={question.id}>
          <div className="poll-question-heading">
            <strong>
              {t("Question")} {questionIndex + 1}
            </strong>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setQuestions((items) =>
                  items.filter((_, i) => i !== questionIndex),
                )
              }
              aria-label={t("Remove question")}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <input
            value={question.title}
            onChange={(event) =>
              updateQuestion(questionIndex, { title: event.target.value })
            }
            placeholder={t("Question title")}
            required
          />
          <input
            value={question.description}
            onChange={(event) =>
              updateQuestion(questionIndex, { description: event.target.value })
            }
            placeholder={t("Question description (optional)")}
          />
          <div className="poll-question-settings">
            <select
              value={question.type}
              onChange={(event) =>
                updateQuestion(questionIndex, {
                  type: event.target.value as PollQuestion["type"],
                })
              }
            >
              <option value="single">{t("Single choice")}</option>
              <option value="multiple">{t("Multiple choice")}</option>
              <option value="text">{t("Text answer")}</option>
            </select>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) =>
                  updateQuestion(questionIndex, {
                    required: event.target.checked,
                  })
                }
              />{" "}
              {t("Required")}
            </label>
          </div>
          {question.type !== "text" && (
            <div className="poll-options-editor">
              {question.options.map((option, optionIndex) => (
                <div className="poll-option-editor" key={option.id}>
                  <input
                    value={option.title}
                    onChange={(event) =>
                      updateQuestion(questionIndex, {
                        options: question.options.map((item, i) =>
                          i === optionIndex
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder={t("Option title")}
                    required
                  />
                  <input
                    value={option.description}
                    onChange={(event) =>
                      updateQuestion(questionIndex, {
                        options: question.options.map((item, i) =>
                          i === optionIndex
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder={t("Option description")}
                  />
                  <div className="poll-option-image-fields">
                    <input
                      value={option.imageUrl}
                      onChange={(event) =>
                        updateQuestion(questionIndex, {
                          options: question.options.map((item, i) =>
                            i === optionIndex
                              ? { ...item, imageUrl: event.target.value }
                              : item,
                          ),
                        })
                      }
                      placeholder={t("Image URL (optional)")}
                      type="url"
                    />
                    <label className="file-picker-compact">
                      {t("Or upload an image")}
                      <input
                        name={`pollOptionImage:${question.id}:${option.id}`}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                      />
                    </label>
                    {option.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="poll-option-image-preview"
                        src={option.imageUrl}
                        alt={option.title || t("Option image")}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={question.options.length <= 2}
                    onClick={() =>
                      updateQuestion(questionIndex, {
                        options: question.options.filter(
                          (_, i) => i !== optionIndex,
                        ),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                className="button ghost-button"
                type="button"
                onClick={() =>
                  updateQuestion(questionIndex, {
                    options: [...question.options, emptyOption()],
                  })
                }
              >
                <Plus size={15} /> {t("Add option")}
              </button>
            </div>
          )}
        </article>
      ))}
      {questions.length === 0 && (
        <button
          className="poll-builder-empty"
          type="button"
          onClick={() => setQuestions([emptyQuestion()])}
        >
          <Plus size={18} /> {t("Add questionnaire to announcement")}
        </button>
      )}
    </section>
  );
}
