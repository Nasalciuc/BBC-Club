import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens, rn } from "@bbc/ui";

type Props = {
  topInset: number;
  onOfflineChange: (offline: boolean) => void;
};

export function OfflineBanner({ topInset, onOfflineChange }: Props) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      const next = !(s.isConnected && s.isInternetReachable !== false);
      setOffline(next);
      onOfflineChange(next);
    });
    return () => sub();
  }, [onOfflineChange]);

  if (!offline) return <View style={{ height: topInset }} />;
  return (
    <View style={[styles.banner, { paddingTop: topInset }]}>
      <Text style={styles.bannerText}>{"You're offline — showing saved offers"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 36,
    backgroundColor: tokens.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.lg,
  },
  bannerText: { ...rn(tokens.type.caption), color: tokens.colors.textOnDark },
});
