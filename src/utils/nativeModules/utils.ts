import { NativeModules, Platform } from 'react-native'

const { UtilsModule } = NativeModules

/** 将本地图片文件复制到系统剪贴板（原生写入，粘贴到其他应用可用） */
export const copyImageToClipboard = async (uri: string): Promise<void> => {
  if (Platform.OS !== 'android') {
    throw new Error('当前系统暂不支持复制图片到剪贴板')
  }
  if (!uri || !UtilsModule?.copyImageToClipboard) {
    throw new Error('当前版本不支持复制图片到剪贴板')
  }
  await UtilsModule.copyImageToClipboard(uri)
}

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
