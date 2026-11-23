import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import {
  getExpenses,
  reviewExpense,
  submitExpense,
  type ExpenseOverview,
  type MobileUpload,
} from "@/lib/api";
import { downloadAndOpenFile } from "@/lib/files";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

type Category = "Sport" | "Health" | "Education" | "Other";

export default function ExpensesScreen() {
  const { accessToken } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [data, setData] = useState<ExpenseOverview | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<number | "submit" | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    amount: "",
    category: "Sport" as Category,
    expenseDate: new Date().toISOString().slice(0, 10),
    description: "",
    receipt: undefined as MobileUpload | undefined,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await accessToken();
      if (token) setData(await getExpenses(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(
              "Не вдалося завантажити відшкодування.",
              "Could not load reimbursements.",
            ),
      );
    }
  }, [accessToken, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function pickReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        tr("Потрібен доступ", "Permission required"),
        tr(
          "Дозвольте доступ до фото, щоб прикріпити чек.",
          "Allow photo access to attach a receipt.",
        ),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setForm((current) => ({
      ...current,
      receipt: {
        uri: asset.uri,
        name: asset.fileName ?? `receipt-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      },
    }));
  }

  async function submit() {
    if (
      !form.amount ||
      !form.description.trim() ||
      (data?.policy?.requiresReceipt && !form.receipt)
    ) {
      Alert.alert(
        tr("Заповніть заявку", "Complete the request"),
        tr(
          "Вкажіть суму, опис і додайте чек, якщо він обов’язковий.",
          "Enter the amount and description, and attach a receipt if required.",
        ),
      );
      return;
    }
    const token = await accessToken();
    if (!token) return;
    setBusy("submit");
    try {
      await submitExpense(token, form);
      setForm((current) => ({
        ...current,
        amount: "",
        description: "",
        receipt: undefined,
      }));
      setFormOpen(false);
      await load();
      Alert.alert(
        tr("Заявку надіслано", "Request submitted"),
        tr("Її передано на погодження.", "It has been sent for approval."),
      );
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося надіслати", "Could not submit"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function review(id: number, action: "approved" | "rejected") {
    const token = await accessToken();
    if (!token) return;
    setBusy(id);
    try {
      await reviewExpense(token, id, action);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося оновити", "Could not update"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function openReceipt(url: string | null) {
    const id = url?.split("/").filter(Boolean).at(-1);
    if (!id) return;
    const token = await accessToken();
    if (token) await downloadAndOpenFile(token, id, `receipt-${id}`);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("expenses") }} />
      <Screen>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Eyebrow>{tr("КОМПЕНСАЦІЇ", "BENEFITS")}</Eyebrow>
            <Text style={styles.title}>{t("expenses")}</Text>
          </View>
          {data?.policy ? (
            <Pressable onPress={() => setFormOpen(true)} style={styles.add}>
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          ) : null}
        </View>
        {!data && !error ? <ActivityIndicator color={colors.ink} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {data?.policy ? (
          <Card>
            <Text style={styles.cardTitle}>
              {money(data.approvedTotal, data.policy.currency, locale)} /{" "}
              {money(data.policy.annualLimit, data.policy.currency, locale)}
            </Text>
            <Text style={styles.copy}>
              {tr("Погоджено цього року", "Approved this year")} ·{" "}
              {data.requestCount}/{data.policy.maxRequestsPerYear}{" "}
              {tr("заявок", "requests")}
            </Text>
            <View style={styles.progress}>
              <View
                style={[
                  styles.progressValue,
                  {
                    width: `${Math.min(
                      100,
                      (data.approvedTotal /
                        Math.max(1, data.policy.annualLimit)) *
                        100,
                    )}%`,
                  },
                ]}
              />
            </View>
          </Card>
        ) : data ? (
          <Card>
            <Text style={styles.copy}>
              {tr(
                "Політика відшкодувань наразі вимкнена.",
                "The reimbursement policy is currently disabled.",
              )}
            </Text>
          </Card>
        ) : null}

        {formOpen && data?.policy ? (
          <Card>
            <Text style={styles.cardTitle}>{t("requestExpense")}</Text>
            <Text style={styles.copy}>
              {tr("Ліміт однієї заявки:", "Per-request limit:")}{" "}
              {money(data.policy.perRequestLimit, data.policy.currency, locale)}
            </Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={(amount) =>
                setForm((current) => ({ ...current, amount }))
              }
              placeholder={t("amount")}
              style={styles.input}
              value={form.amount}
            />
            <TextInput
              onChangeText={(expenseDate) =>
                setForm((current) => ({ ...current, expenseDate }))
              }
              placeholder={`${t("expenseDate")}: YYYY-MM-DD`}
              style={styles.input}
              value={form.expenseDate}
            />
            <View style={styles.categories}>
              {(["Sport", "Health", "Education", "Other"] as const).map(
                (category) => (
                  <Pressable
                    key={category}
                    onPress={() =>
                      setForm((current) => ({ ...current, category }))
                    }
                    style={[
                      styles.category,
                      form.category === category && styles.categoryActive,
                    ]}
                  >
                    <Text style={styles.categoryText}>
                      {categoryLabel(category, locale)}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <TextInput
              multiline
              onChangeText={(description) =>
                setForm((current) => ({ ...current, description }))
              }
              placeholder={t("description")}
              style={[styles.input, styles.multiline]}
              value={form.description}
            />
            {form.receipt ? (
              <Image
                alt={tr("Попередній перегляд чека", "Receipt preview")}
                source={{ uri: form.receipt.uri }}
                style={styles.preview}
              />
            ) : null}
            <Pressable
              onPress={() => void pickReceipt()}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>
                {form.receipt
                  ? tr("Замінити чек", "Replace receipt")
                  : tr("Додати фото чека", "Attach receipt photo")}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                onPress={() => setFormOpen(false)}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={busy === "submit"}
                onPress={() => void submit()}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>
                  {busy === "submit" ? "…" : t("submit")}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {data?.pending.length ? (
          <>
            <Eyebrow>{t("pendingApprovals").toUpperCase()}</Eyebrow>
            {data.pending.map((request) => (
              <Card key={request.id}>
                <Text style={styles.cardTitle}>
                  {request.employeeFirstName} {request.employeeLastName}
                </Text>
                <Text style={styles.copy}>
                  {categoryLabel(request.category as Category, locale)} ·{" "}
                  {money(request.amountCents, request.currency, locale)}
                </Text>
                <Text style={styles.copy}>{request.description}</Text>
                {request.receiptUrl ? (
                  <Pressable
                    onPress={() => void openReceipt(request.receiptUrl)}
                    style={styles.receiptLink}
                  >
                    <Text style={styles.receiptLinkText}>{t("receipt")} ↓</Text>
                  </Pressable>
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    disabled={busy === request.id}
                    onPress={() => void review(request.id, "rejected")}
                    style={styles.reject}
                  >
                    <Text style={styles.rejectText}>{t("reject")}</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy === request.id}
                    onPress={() => void review(request.id, "approved")}
                    style={styles.primary}
                  >
                    <Text style={styles.primaryText}>{t("approve")}</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {data?.requests.length ? (
          <>
            <Eyebrow>{t("expenseHistory").toUpperCase()}</Eyebrow>
            {data.requests.map((request) => (
              <Card key={request.id}>
                <View style={styles.historyRow}>
                  <View style={styles.headingText}>
                    <Text style={styles.cardTitle}>
                      {categoryLabel(request.category as Category, locale)}
                    </Text>
                    <Text style={styles.copy}>
                      {request.expenseDate} · {request.description}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.amount}>
                      {money(request.amountCents, request.currency, locale)}
                    </Text>
                    <Text style={styles.status}>
                      {statusLabel(request.status, locale)}
                    </Text>
                  </View>
                </View>
                {request.receiptUrl ? (
                  <Pressable
                    onPress={() => void openReceipt(request.receiptUrl)}
                  >
                    <Text style={styles.receiptLinkText}>{t("receipt")} ↓</Text>
                  </Pressable>
                ) : null}
              </Card>
            ))}
          </>
        ) : data ? (
          <Card>
            <Text style={styles.copy}>{t("noResults")}</Text>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function categoryLabel(category: Category, locale: "uk" | "en") {
  const labels: Record<Category, [string, string]> = {
    Sport: ["Спорт", "Sport"],
    Health: ["Здоров’я", "Health"],
    Education: ["Освіта", "Education"],
    Other: ["Інше", "Other"],
  };
  return labels[category]?.[locale === "en" ? 1 : 0] ?? category;
}

function statusLabel(status: string, locale: "uk" | "en") {
  const labels: Record<string, [string, string]> = {
    pending: ["Очікує", "Pending"],
    approved: ["Погоджено", "Approved"],
    rejected: ["Відхилено", "Rejected"],
    withdrawn: ["Відкликано", "Withdrawn"],
  };
  return labels[status]?.[locale === "en" ? 1 : 0] ?? status;
}

function money(cents: number, currency: string, locale: "uk" | "en") {
  return new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

const styles = StyleSheet.create({
  heading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headingText: { flex: 1 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  amount: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  status: {
    color: "#806100",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  add: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addText: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  progress: {
    backgroundColor: "#ecece8",
    borderRadius: 5,
    height: 8,
    overflow: "hidden",
  },
  progressValue: { backgroundColor: colors.yellow, height: 8 },
  input: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  category: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryActive: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  categoryText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  preview: { borderRadius: 10, height: 150, width: "100%" },
  actions: { flexDirection: "row", gap: 8 },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  primaryText: { color: colors.ink, fontWeight: "800" },
  reject: {
    alignItems: "center",
    borderColor: "#dfaaa5",
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  rejectText: { color: "#9c3129", fontWeight: "800" },
  receiptLink: { paddingVertical: 4 },
  receiptLinkText: { color: "#745a00", fontSize: 13, fontWeight: "800" },
  historyRow: { flexDirection: "row", gap: 10 },
  error: { color: "#a02e25" },
});
