import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs.
 *
 * react-native-web does NOT implement Alert.alert — it silently no-ops, which
 * on web leaves confirmation flows dead (the roast-exit guard, recording status).
 * These helpers fall back to the browser's window.confirm / window.alert on web
 * and use the native Alert everywhere else.
 */

/** Confirm a destructive action. Runs onConfirm only if the user accepts. */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  cancelLabel = 'Keep going',
): void {
  if (Platform.OS === 'web') {
    // window.confirm is synchronous and returns a boolean.
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Show an informational message. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
