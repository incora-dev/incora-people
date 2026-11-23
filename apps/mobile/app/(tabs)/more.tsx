import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  getKnowledge,
  getResources,
  type KnowledgeArticle,
  type MobileResources,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function More() {
  const { profile, signOut, accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [resources, setResources] = useState<MobileResources | null>(null);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const load = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    const [resourceData, knowledgeData] = await Promise.all([
      getResources(token),
      getKnowledge(token),
    ]);
    setResources(resourceData);
    setArticles(knowledgeData.articles);
  }, [accessToken]);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => undefined), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <Screen>
      <Eyebrow>{tr("ПРОФІЛЬ І РЕСУРСИ", "PROFILE AND RESOURCES")}</Eyebrow>
      <Text style={styles.title}>
        {profile?.user.firstName ?? tr("Мій профіль", "My profile")}
      </Text>
      <Card>
        <Text style={styles.cardTitle}>{profile?.user.email}</Text>
        <Text style={styles.copy}>{profile?.user.role ?? "employee"}</Text>
        <Pressable
          onPress={() => router.push("/organization")}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>
            {tr("Відкрити оргструктуру →", "Open organization chart →")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/settings")}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>{t("settings")} →</Text>
        </Pressable>
        {Boolean(profile?.access.manageSettings) ? (
          <Pressable
            onPress={() => router.push("/admin")}
            style={styles.adminAction}
          >
            <Text style={styles.adminActionText}>
              {tr("Адміністрування →", "Administration →")}
            </Text>
          </Pressable>
        ) : null}
      </Card>
      <Card>
        <Eyebrow>{tr("РОБОЧИЙ ПРОСТІР", "WORKSPACE")}</Eyebrow>
        <MenuLink
          label={t("calendar")}
          description={tr(
            "Відсутності та доступність команди",
            "Absences and team availability",
          )}
          onPress={() => router.push("/calendar")}
        />
        <MenuLink
          label={t("tasks")}
          description={tr(
            "Особисті, онбординг- та офбординг-задачі",
            "Personal, onboarding and offboarding tasks",
          )}
          onPress={() => router.push("/tasks")}
        />
        <MenuLink
          label={t("announcements")}
          description={tr("Новини компанії", "Company news")}
          onPress={() => router.push("/announcements")}
        />
        <MenuLink
          label={t("documents")}
          description={tr(
            "Політики, шаблони та особисті файли",
            "Policies, templates and personal files",
          )}
          onPress={() => router.push("/documents")}
        />
      </Card>
      <Card>
        <Eyebrow>{tr("МОЇ АКТИВИ", "MY ASSETS")}</Eyebrow>
        {resources?.assets.length ? (
          resources.assets.map((asset) => (
            <Pressable
              key={asset.id}
              onPress={() => router.push(`/assets/${asset.id}`)}
            >
              <Text style={styles.copy}>
                {asset.name} · {asset.assetTag} · {asset.status} →
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.copy}>
            {tr("Активів не закріплено.", "No assets assigned.")}
          </Text>
        )}
      </Card>
      <Card>
        <Eyebrow>{tr("БАЗА ЗНАНЬ", "KNOWLEDGE BASE")}</Eyebrow>
        {articles.slice(0, 5).map((article) => (
          <Pressable
            key={article.id}
            onPress={() => router.push(`/knowledge/${article.id}`)}
          >
            <Text style={styles.copy}>
              {article.category} · {article.title} →
            </Text>
          </Pressable>
        ))}
        {!articles.length ? (
          <Text style={styles.copy}>
            {tr(
              "Доступних статей поки немає.",
              "No articles are available yet.",
            )}
          </Text>
        ) : null}
      </Card>
      <Card>
        <Eyebrow>{tr("ОСОБИСТІ ОПЕРАЦІЇ", "PERSONAL OPERATIONS")}</Eyebrow>
        <MenuLink
          label={t("expenses")}
          description={tr(
            "Політика, заявки, чеки та погодження",
            "Policy, requests, receipts and approvals",
          )}
          onPress={() => router.push("/expenses")}
        />
        <MenuLink
          label={t("support")}
          description={tr(
            "Повідомити команді про помилку",
            "Report a product issue to the team",
          )}
          onPress={() => router.push("/operations")}
        />
      </Card>
      <Pressable
        onPress={() => void signOut().then(() => router.replace("/sign-in"))}
        style={styles.logout}
      >
        <Text style={styles.logoutText}>{t("signOut")}</Text>
      </Pressable>
    </Screen>
  );
}

function MenuLink({
  label,
  description,
  onPress,
}: {
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuLink}>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{label}</Text>
        <Text style={styles.copy}>{description}</Text>
      </View>
      <Text style={styles.menuArrow}>→</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  inlineAction: { paddingVertical: 5 },
  inlineActionText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  adminAction: { backgroundColor: colors.yellow, borderRadius: 8, padding: 11 },
  adminActionText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  menuLink: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
  },
  menuText: { flex: 1 },
  menuTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  menuArrow: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  logout: {
    alignItems: "center",
    borderColor: "#db8d85",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: "center",
  },
  logoutText: { color: "#a02e25", fontWeight: "800" },
});
