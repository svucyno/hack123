import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Smart Farmer SVU Expo</Text>
        <Text style={styles.copy}>
          Expo starter app scaffolded from the reference monorepo stack.
        </Text>
        <StatusBar style="dark" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f1e7",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f5f1e7",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1c3a26",
    marginBottom: 12,
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    color: "#3c5b42",
  },
});
