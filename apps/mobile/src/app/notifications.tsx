import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, tokens, rn } from "@bbc/ui";

import { putNotificationPreferences } from "@/lib/api";

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [personal, setPersonal] = useState(true);
  const [broadcast, setBroadcast] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
  }, []);

  async function onToggle(category: "offers_personal" | "offers_broadcast", enabled: boolean) {
    if (category === "offers_personal") setPersonal(enabled);
    else setBroadcast(enabled);
    setBusy(true);
    await putNotificationPreferences({ preferences: [{ category, enabled }] });
    setBusy(false);
  }

  return (
    <View testID="notifications.root" style={[styles.root, { paddingTop: insets.top + tokens.space.md }]}>
      <Pressable
        testID="notifications.back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        onPress={() => router.back()}
        style={styles.back}
      >
        <Icon name="chevron" size={20} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Notifications</Text>
      {busy ? <ActivityIndicator color={tokens.colors.primary} /> : null}

      <View style={styles.row}>
        <Text style={styles.label}>Personal offers</Text>
        <Switch
          testID="profile.pref.personal"
          value={personal}
          onValueChange={(v) => void onToggle("offers_personal", v)}
          trackColor={{ true: tokens.colors.primary, false: tokens.colors.borderDefault }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Broadcast offers</Text>
        <Switch
          testID="profile.pref.broadcast"
          value={broadcast}
          onValueChange={(v) => void onToggle("offers_broadcast", v)}
          trackColor={{ true: tokens.colors.primary, false: tokens.colors.borderDefault }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage, paddingHorizontal: tokens.space.lg },
  back: { flexDirection: "row", alignItems: "center", gap: tokens.space.xxs, marginBottom: tokens.space.md },
  backText: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, marginBottom: tokens.space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
});
