import { NativeModules } from 'react-native'

const { UtilsModule } = NativeModules

export const exitApp = () => {
  if (UtilsModule?.exitApp) UtilsModule.exitApp()
}

export const getWindowSize = async (): Promise<{ width: number; height: number }> => {
  if (UtilsModule?.getWindowSize) return UtilsModule.getWindowSize()
  return { width: 0, height: 0 }
}

export const getLastCrashReport = async (): Promise<string | null> => {
  try {
    if (!UtilsModule?.getLastCrashReport) return null
    const report = await UtilsModule.getLastCrashReport()
    return typeof report === 'string' && report.trim() ? report : null
  } catch {
    return null
  }
}

export const getCrashLogPath = async (): Promise<string | null> => {
  try {
    if (!UtilsModule?.getCrashLogPath) return null
    const path = await UtilsModule.getCrashLogPath()
    return typeof path === 'string' && path ? path : null
  } catch {
    return null
  }
}

export const clearLastCrashReport = async (): Promise<void> => {
  try {
    if (UtilsModule?.clearLastCrashReport) await UtilsModule.clearLastCrashReport()
  } catch {
    // ignore
  }
}

/** 优先同步写盘（闪退场景）；失败再异步 */
export const writeCrashReport = (kind: string, where: string, body: string): void => {
  try {
    if (typeof UtilsModule?.writeCrashReportSync === 'function') {
      UtilsModule.writeCrashReportSync(kind || 'JS', where || '', body || '')
      return
    }
  } catch {
    // fall through
  }
  try {
    if (UtilsModule?.writeCrashReport) {
      void UtilsModule.writeCrashReport(kind || 'JS', where || '', body || '')
    }
  } catch {
    // ignore
  }
}
