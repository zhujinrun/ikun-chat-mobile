import { Component, type ErrorInfo, type ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { exitApp, writeCrashReport } from '@/utils/nativeModules/utils'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
}

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || String(error),
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const detail = [
      `${error?.name || 'Error'}: ${error?.message || ''}`,
      error?.stack || '',
      info?.componentStack || '',
    ]
      .filter(Boolean)
      .join('\n')
    writeCrashReport('JS_RENDER', 'RootErrorBoundary', detail)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View style={styles.root}>
        <Text style={styles.title}>界面加载失败</Text>
        <Text style={styles.desc}>
          已保存错误日志。请退出后重新打开应用；如果反复出现，可拉取 last_crash_report.txt
          定位。
        </Text>
        {this.state.message ? (
          <Text style={styles.message} numberOfLines={4}>
            {this.state.message}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.button}
          onPress={exitApp}
          accessibilityRole="button"
          accessibilityLabel="退出应用"
        >
          <Text style={styles.buttonText}>退出应用</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  title: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  desc: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  message: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})
