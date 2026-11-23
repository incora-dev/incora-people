import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createLeaveRequest,
  getLeaveCalendar,
  getLeaveOverview,
  reviewLeaveRequest,
  type LeaveCalendarEvent,
  type LeaveOverview,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function Leave() {
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [overview, setOverview] = useState<LeaveOverview | null>(null);
  const [calendar, setCalendar] = useState<LeaveCalendarEvent[]>([]);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const load = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    try {
      const [next, calendarData] = await Promise.all([
        getLeaveOverview(token),
        getLeaveCalendar(token),
      ]);
      setOverview(next);
      setCalendar(calendarData.events);
      setTypeId((current) => current ?? next.balances[0]?.leaveTypeId ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося завантажити відсутності.", "Could not load leave."),
      );
    }
  }, [accessToken, tr]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const submit = async () => {
    const token = await accessToken();
    if (!token || !typeId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createLeaveRequest(token, {
        leaveTypeId: typeId,
        startDate,
        endDate,
        reason,
      });
      setStartDate("");
      setEndDate("");
      setReason("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося створити заявку.", "Could not create the request."),
      );
    } finally {
      setSubmitting(false);
    }
  };
  const review = async (id: number, action: "approved" | "rejected") => {
    const token = await accessToken();
    if (!token) return;
    setReviewingId(id);
    setError(null);
    try {
      await reviewLeaveRequest(token, id, action);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося оновити заявку.", "Could not update the request."),
      );
    } finally {
      setReviewingId(null);
    }
  };
  return (
    <Screen>
      <Eyebrow>{tr("ВІДСУТНОСТІ", "LEAVE")}</Eyebrow>
      <Text style={styles.title}>
        {tr("Баланс і заявки", "Balances and requests")}
      </Text>
      {!overview ? <ActivityIndicator color={colors.ink} /> : null}
      {overview ? (
        <Card>
          <Eyebrow>{tr("НОВА ЗАЯВКА", "NEW REQUEST")}</Eyebrow>
          <Text style={styles.cardTitle}>
            {tr("Запланувати відсутність", "Plan an absence")}
          </Text>
          <View style={styles.choices}>
            {overview.balances.map((balance) => (
              <Pressable
                key={balance.id}
                onPress={() => setTypeId(balance.leaveTypeId)}
                style={[
                  styles.choice,
                  typeId === balance.leaveTypeId && {
                    backgroundColor: balance.color,
                    borderColor: balance.color,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.choiceText,
                    typeId === balance.leaveTypeId && { color: colors.ink },
                  ]}
                >
                  {balance.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel={tr("Початок відсутності", "Leave start")}
            onChangeText={setStartDate}
            placeholder={tr("Початок: РРРР-ММ-ДД", "Start: YYYY-MM-DD")}
            style={styles.input}
            value={startDate}
          />
          <TextInput
            accessibilityLabel={tr("Кінець відсутності", "Leave end")}
            onChangeText={setEndDate}
            placeholder={tr("Кінець: РРРР-ММ-ДД", "End: YYYY-MM-DD")}
            style={styles.input}
            value={endDate}
          />
          <TextInput
            accessibilityLabel={tr("Коментар до заявки", "Request comment")}
            multiline
            onChangeText={setReason}
            placeholder={tr("Коментар (необов’язково)", "Comment (optional)")}
            style={[styles.input, styles.reason]}
            value={reason}
          />
          <Pressable
            disabled={submitting || !typeId || !startDate || !endDate}
            onPress={() => void submit()}
            style={[
              styles.button,
              (submitting || !typeId || !startDate || !endDate) &&
                styles.disabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>
                {tr("Подати заявку", "Submit request")}
              </Text>
            )}
          </Pressable>
        </Card>
      ) : null}
      {overview?.balances.map((balance) => (
        <Card key={balance.id}>
          <Text style={styles.cardTitle}>{balance.name}</Text>
          <Text style={[styles.balance, { color: balance.color }]}>
            {Math.max(
              0,
              balance.allowance + balance.adjustment - balance.used,
            ).toFixed(1)}{" "}
            {tr("дн.", "days")}
          </Text>
          <Text style={styles.copy}>
            {tr("Доступно з", "Available out of")}{" "}
            {balance.allowance + balance.adjustment} {tr("днів", "days")}
          </Text>
        </Card>
      ))}
      {overview?.requests.length ? (
        <Card>
          <Text style={styles.cardTitle}>
            {tr("Мої заявки", "My requests")}
          </Text>
          {overview.requests.slice(0, 5).map((request) => (
            <Text key={request.id} style={styles.copy}>
              {request.typeName}: {request.startDate} — {request.endDate} ·{" "}
              {request.status}
            </Text>
          ))}
        </Card>
      ) : null}
      {overview?.pending.length ? (
        <Card>
          <Eyebrow>{tr("ПОТРЕБУЮТЬ РІШЕННЯ", "NEEDS A DECISION")}</Eyebrow>
          <Text style={styles.cardTitle}>
            {tr("Заявки команди", "Team requests")}
          </Text>
          {overview.pending.map((request) => (
            <View key={request.id} style={styles.pending}>
              <Text style={styles.pendingName}>
                {request.employeeFirstName} {request.employeeLastName} ·{" "}
                {request.typeName}
              </Text>
              <Text style={styles.copy}>
                {request.startDate} — {request.endDate} · {request.days}{" "}
                {tr("дн.", "days")}
              </Text>
              {request.reason ? (
                <Text style={styles.copy}>{request.reason}</Text>
              ) : null}
              <View style={styles.reviewActions}>
                <Pressable
                  disabled={reviewingId === request.id}
                  onPress={() => void review(request.id, "approved")}
                  style={styles.approve}
                >
                  <Text style={styles.approveText}>{t("approve")}</Text>
                </Pressable>
                <Pressable
                  disabled={reviewingId === request.id}
                  onPress={() => void review(request.id, "rejected")}
                  style={styles.reject}
                >
                  <Text style={styles.rejectText}>{t("reject")}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {calendar.length ? (
        <Card>
          <Eyebrow>{tr("КАЛЕНДАР КОМАНДИ", "TEAM CALENDAR")}</Eyebrow>
          <Text style={styles.cardTitle}>
            {tr("Погоджені відсутності", "Approved absences")}
          </Text>
          {calendar.slice(0, 12).map((event) => (
            <View key={event.id} style={styles.calendarRow}>
              <View style={[styles.dot, { backgroundColor: event.color }]} />
              <Text style={styles.calendarText}>
                {event.firstName} {event.lastName} · {event.typeName}
              </Text>
              <Text style={styles.date}>{event.startDate}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  balance: { fontSize: 30, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  choiceText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    padding: 12,
  },
  reason: { minHeight: 76, textAlignVertical: "top" },
  button: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  calendarRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingTop: 9,
  },
  dot: { borderRadius: 5, height: 10, width: 10 },
  calendarText: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: "600" },
  date: { color: colors.muted, fontSize: 12 },
  pending: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 7,
    paddingTop: 12,
  },
  pendingName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  reviewActions: { flexDirection: "row", gap: 8 },
  approve: {
    alignItems: "center",
    backgroundColor: "#dff4e7",
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
  },
  approveText: { color: "#167044", fontSize: 13, fontWeight: "800" },
  reject: {
    alignItems: "center",
    borderColor: "#e6bbb6",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
  },
  rejectText: { color: "#a13d33", fontSize: 13, fontWeight: "800" },
  error: { color: "#b4362a", fontSize: 14, lineHeight: 20 },
});
