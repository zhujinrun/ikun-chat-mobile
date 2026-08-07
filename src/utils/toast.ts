import { ToastAndroid, Platform, Alert } from 'react-native'

export const toast = (message: string, duration: 'short' | 'long' = 'short') => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, duration === 'long' ? ToastAndroid.LONG : ToastAndroid.SHORT)
    return
  }
  Alert.alert('', message)
}
