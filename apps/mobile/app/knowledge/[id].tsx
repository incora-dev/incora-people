import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getKnowledgeArticle, type KnowledgeArticle } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";
import { downloadAndOpenFile } from "@/lib/files";
import { Pressable } from "react-native";

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [article, setArticle] = useState<KnowledgeArticle | null>(null);
  useEffect(() => {
    void (async () => {
      const token = await accessToken();
      if (token)
        setArticle((await getKnowledgeArticle(token, Number(id))).article);
    })();
  }, [accessToken, id]);
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: tr("База знань", "Knowledge base"),
        }}
      />
      <Screen>
        {article ? (
          <>
            <Eyebrow>{article.category}</Eyebrow>
            <Text style={styles.title}>{article.title}</Text>
            <Card>
              <Text style={styles.body}>{article.body}</Text>
            </Card>
            {article.attachments?.length ? (
              <Card>
                <Eyebrow>{tr("ВКЛАДЕННЯ", "ATTACHMENTS")}</Eyebrow>
                {article.attachments.map((file) => (
                  <Pressable
                    key={file.id}
                    onPress={() =>
                      void accessToken().then((token) => {
                        if (token) {
                          return downloadAndOpenFile(
                            token,
                            file.id,
                            file.originalName,
                          );
                        }
                      })
                    }
                  >
                    <Text style={styles.link}>{file.originalName} ↓</Text>
                  </Pressable>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <Text style={styles.body}>{t("loading")}</Text>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  link: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 23 },
});
