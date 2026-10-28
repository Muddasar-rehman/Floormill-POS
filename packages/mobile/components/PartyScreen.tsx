import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { type Party } from "shared";
import { supabase } from "../lib/supabase";
import { Card } from "./ui/Card";
import { colors } from "./ui/theme";

export function PartyScreen() {
  const { t } = useTranslation();
  const ns = "parties";
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("parties")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setParties((data as Party[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t(`${ns}.title`) }} />
      <FlatList
        contentContainerStyle={styles.list}
        data={parties}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>{t(`${ns}.empty`)}</Text>}
        renderItem={({ item: p }) => (
          <Card style={styles.row}>
            <Text style={styles.name}>{p.name}</Text>
            {p.contact ? <Text style={styles.meta}>{p.contact}</Text> : null}
            <Text style={styles.meta}>
              {t(`${ns}.colOpeningBalance`)}: {p.opening_balance.toFixed(2)}
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24 },
  row: { padding: 14, gap: 2 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
