import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { getResources, type MobileResources } from "@/lib/api";
import { downloadAndOpenFile } from "@/lib/files";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

export default function DocumentsScreen() {
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [data, setData] = useState<MobileResources | null>(null);
  const [folderId, setFolderId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await accessToken();
      if (token) setData(await getResources(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(
              "Не вдалося завантажити документи.",
              "Could not load documents.",
            ),
      );
    }
  }, [accessToken, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.companyDocuments.documents ?? []).filter(
      (document) =>
        (folderId === "all" || document.folderId === folderId) &&
        (!normalized ||
          `${document.title} ${document.originalName}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [data?.companyDocuments.documents, folderId, query]);

  async function open(fileId: string, name: string) {
    setOpening(fileId);
    setError("");
    try {
      const token = await accessToken();
      if (token) await downloadAndOpenFile(token, fileId, name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("retry"));
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("documents") }} />
      <Screen>
        <Eyebrow>{tr("РЕСУРСИ КОМПАНІЇ", "COMPANY RESOURCES")}</Eyebrow>
        <Text style={styles.title}>{t("documents")}</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder={`${t("search")}…`}
          style={styles.input}
          value={query}
        />
        <View style={styles.filters}>
          <Filter
            active={folderId === "all"}
            label={t("all")}
            onPress={() => setFolderId("all")}
          />
          {data?.companyDocuments.folders.map((folder) => (
            <Filter
              key={folder.id}
              active={folderId === folder.id}
              label={folder.name}
              onPress={() => setFolderId(folder.id)}
            />
          ))}
        </View>
        {!data && !error ? <ActivityIndicator color={colors.ink} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {data && !visible.length ? (
          <Card>
            <Text style={styles.copy}>{t("noResults")}</Text>
          </Card>
        ) : null}
        {visible.map((document) => (
          <Pressable
            accessibilityRole="button"
            disabled={opening === document.fileId}
            key={document.id}
            onPress={() => void open(document.fileId, document.originalName)}
          >
            <Card>
              <View style={styles.documentRow}>
                <View style={styles.fileMark}>
                  <Text style={styles.fileMarkText}>↓</Text>
                </View>
                <View style={styles.documentText}>
                  <Text style={styles.cardTitle}>{document.title}</Text>
                  <Text style={styles.copy}>
                    {document.originalName} · {formatSize(document.sizeBytes)}
                  </Text>
                </View>
                <Text style={styles.download}>
                  {opening === document.fileId ? "…" : t("download")}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
        {data?.employeeDocuments.length ? (
          <>
            <Eyebrow>{t("myDocuments").toUpperCase()}</Eyebrow>
            {data.employeeDocuments.map((document) => (
              <Pressable
                key={document.id}
                onPress={() => void open(document.id, document.originalName)}
              >
                <Card>
                  <Text style={styles.cardTitle}>{document.originalName}</Text>
                  <Text style={styles.copy}>
                    {document.category} · {formatSize(document.sizeBytes)}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}
      </Screen>
    </>
  );
}

function Filter({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive]}
    >
      <Text style={styles.filterText}>{label}</Text>
    </Pressable>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filter: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  filterText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  documentRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  fileMark: {
    alignItems: "center",
    backgroundColor: "#fff4c4",
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  fileMarkText: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  documentText: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  download: { color: "#7b6000", fontSize: 11, fontWeight: "800" },
  error: { color: "#a02e25" },
});
