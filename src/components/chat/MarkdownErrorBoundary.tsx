import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Text } from 'react-native'

type Props = {
  children: ReactNode
  fallbackText: string
  textColor?: string
  fontSize?: number
}

type State = {
  hasError: boolean
  errorMsg: string
}

/**
 * 捕获 Markdown 渲染异常并回退纯文本。
 * 注意：不要 console.error（会被 exception-handler 转成 reportError）。
 */
export default class MarkdownErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMsg: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMsg: error?.message || String(error),
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 仅 warn，避免触发全局 ErrorUtils 死循环/落盘噪音
    try {
      // eslint-disable-next-line no-console
      console.warn(
        '[MarkdownErrorBoundary]',
        error?.message,
        info?.componentStack?.slice?.(0, 300)
      )
    } catch {
      // ignore
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.fallbackText !== this.props.fallbackText && this.state.hasError) {
      this.setState({ hasError: false, errorMsg: '' })
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallbackText, textColor, fontSize = 16 } = this.props
      return (
        <Text style={{ color: textColor, fontSize, lineHeight: fontSize * 1.5 }} selectable>
          {fallbackText}
        </Text>
      )
    }
    return this.props.children
  }
}
