import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.message}>Page not found</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/(tabs)/track' as any)}
      >
        <Text style={styles.buttonText}>Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  code: {
    fontSize: 64,
    fontWeight: '800' as const,
    color: '#CC0000',
    marginBottom: 8,
  },
  message: {
    fontSize: 18,
    color: '#8E8E93',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
