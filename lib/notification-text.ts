import type { Locale } from "@/lib/i18n";

export type NotificationText = {
  title: string;
  message: string;
};

const titleTranslations: Record<string, string> = {
  "New leave request": "Новий запит на відпустку",
  "Leave request approved": "Запит на відпустку погоджено",
  "Leave request rejected": "Запит на відпустку відхилено",
  "Leave request withdrawn": "Запит на відпустку відкликано",
  "New reimbursement request": "Новий запит на відшкодування",
  "Reimbursement approved": "Відшкодування погоджено",
  "Reimbursement rejected": "Відшкодування відхилено",
  "Reimbursement withdrawn": "Запит на відшкодування відкликано",
  "New task": "Нове завдання",
};

/**
 * Notification rows predate per-user locale support and store rendered text.
 * Translate the known event formats at the presentation boundary while
 * preserving announcement titles and user-authored content verbatim.
 */
export function localizeNotification(
  notification: NotificationText,
  locale: Locale,
): NotificationText {
  if (locale === "en") return notification;

  let message = notification.message;
  let match = message.match(/^(.+?) requested ([\d.,]+) (.+?) days\.$/);
  if (match) {
    message = `${match[1]} подав(ла) запит на ${leaveTypeName(match[3])}: ${match[2]} дн.`;
  } else {
    match = message.match(/^(.+?) submitted ([\d.,]+) грн for (.+?)\.$/);
    if (match) {
      message = `${match[1]} подав(ла) витрату ${match[2]} грн: ${expenseTypeName(match[3])}.`;
    } else {
      match = message.match(/^(.+?) reimbursement is withdrawn\.$/);
      if (match) {
        message = `Відшкодування «${expenseTypeName(match[1])}» відкликано.`;
      } else {
        match = message.match(/^(.+?) for (.+?) is (approved|rejected)\.$/);
        if (match) {
          message = `${leaveTypeName(match[1])} за ${match[2]}: ${
            match[3] === "approved" ? "погоджено" : "відхилено"
          }.`;
        } else {
          match = message.match(
            /^(.+?) reimbursement is (approved|rejected)\.$/,
          );
          if (match) {
            message = `Відшкодування «${expenseTypeName(match[1])}» ${
              match[2] === "approved" ? "погоджено" : "відхилено"
            }.`;
          }
        }
      }
    }
  }

  return {
    title: titleTranslations[notification.title] ?? notification.title,
    message,
  };
}

function leaveTypeName(value: string) {
  return (
    {
      Vacation: "відпустку",
      "Sick leave": "лікарняний",
      Unpaid: "відпустку без оплати",
    }[value] ?? value
  );
}

function expenseTypeName(value: string) {
  return (
    {
      Sport: "спорт",
      Health: "здоров’я",
      Education: "освіта",
    }[value] ?? value
  );
}
