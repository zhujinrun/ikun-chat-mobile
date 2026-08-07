import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler'
import {
  getCrashLogPath,
  getLastCrashReport,
  writeCrashReport,
} from '@/utils/nativeModules/utils'

/**
 * 重要：react-native-exception-handler 会把 console.error 转成 ErrorUtils.reportError。
 * 若在 errorHandler / persistCrash 里再 console.error，会形成：
 *   errorHandler → console.error → reportError → errorHandler → … 栈溢出闪退
 * 因此必须在 setJSExceptionHandler 之前保存原始 console，且 handler 内只用原始 console。
 */

// 必须在 setJSExceptionHandler 之前截获（否则拿到的是已被 patch 的版本）
const rawConsoleError = console.error.bind(console)
const rawConsoleWarn = console.warn.bind(console)
const rawConsoleLog = console.log.bind(console)

let handlingError = false

const buildReport = (kind: string, where: string, body: string) => {
  const time = new Date().toISOString()
  const text = `time: ${time}\nkind: ${kind}\nwhere: ${where}\n\n${body}`
  return text.length > 8000 ? `${text.slice(0, 8000)}\n...[truncated]` : text
}

const persistCrash = (kind: string, where: string, body: string) => {
  // 防止递归：写盘/打日志过程中再触发 error 直接忽略
  if (handlingError) return
  handlingError = true
  try {
    const report = buildReport(kind, where, body)
    try {
      rawConsoleError('[IkunCrash]', report)
    } catch {
      // ignore
    }
    try {
      writeCrashReport(kind, where, report)
    } catch {
      // ignore
    }
  } finally {
    handlingError = false
  }
}

const toErrorDetail = (e: unknown): string => {
  if (e instanceof Error) {
    return `${e.name || 'Error'}: ${e.message || ''}${e.stack ? `\n${e.stack}` : ''}`
  }
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}

const errorHandler = (e: unknown, isFatal: boolean) => {
  // 已在处理中则直接返回，打断 console.error ↔ reportError 死循环
  if (handlingError) return

  const detail = toErrorDetail(e)
  // 过滤我们自己制造的栈溢出噪音（若仍有残留）
  if (
    detail.includes('Maximum call stack size exceeded') &&
    detail.includes('persistCrash') &&
    detail.includes('errorHandler')
  ) {
    return
  }

  persistCrash(isFatal ? 'JS_FATAL' : 'JS', 'ErrorUtils', detail)
}

setJSExceptionHandler(errorHandler, true)

setNativeExceptionHandler(
  (errorString) => {
    persistCrash('NATIVE', 'ExceptionHandler', errorString || '(empty)')
  },
  false,
  true
)

/** 启动时只打日志，不弹窗、不自动清除（方便 adb 多次拉取） */
export const logLastCrashReportIfAny = async () => {
  try {
    const path = await getCrashLogPath()
    const report = await getLastCrashReport()
    if (path) {
      rawConsoleWarn('[IkunCrash] log path:', path)
      rawConsoleWarn(
        '[IkunCrash] pull: adb pull /sdcard/Android/data/com.ikunshare.chat.mobile/files/last_crash_report.txt'
      )
    }
    if (report) {
      // 用 raw，避免再次走 reportError
      rawConsoleWarn('[IkunCrash] last report:\n', report)
    } else {
      rawConsoleLog('[IkunCrash] no last_crash_report.txt found')
    }
  } catch (err) {
    rawConsoleWarn('[IkunCrash] logLastCrashReportIfAny failed', err)
  }
}
