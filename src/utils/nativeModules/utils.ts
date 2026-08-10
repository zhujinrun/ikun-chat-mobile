import { NativeModules, Platform } from 'react-native'

const { UtilsModule } = NativeModules

export type PickedTextFile = {
  uri: string
  name?: string
  mimeType: string
  size?: number
}

export type PickTextFilesResult = {
  didCancel?: boolean
  files: PickedTextFile[]
  skipped: Array<{ name?: string; size?: number; reason: 'tooLarge' | 'unreadable' }>
}

const TEXT_FILE_MIME_TYPES = [
  'text/*',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/yaml',
  'application/x-yaml',
]

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

/**
 * 把本地图片（file:// / content:// / data:）拷贝到应用缓存目录，返回 file:// 路径。
 * 成功后消息只存该 URI + 元数据，不再把 base64 写入 AsyncStorage。
 */
export const cacheImageTo = async (uri: string): Promise<string | null> => {
  try {
    if (Platform.OS !== 'android' || !uri || !UtilsModule?.cacheImageTo) return null
    const result = await UtilsModule.cacheImageTo(uri)
    return typeof result === 'string' && result ? `file://${result}` : null
  } catch {
    return null
  }
}

/** 读取本地图片为 data:dataUrl（发送/重发请求时临时生成，不落盘） */
export const readImageDataUrl = async (uri: string): Promise<string> => {
  if (Platform.OS !== 'android' || !uri || !UtilsModule?.readImageDataUrl) {
    throw new Error('当前版本不支持读取图片')
  }
  const result = await UtilsModule.readImageDataUrl(uri)
  if (typeof result !== 'string' || !result) throw new Error('读取图片失败')
  return result
}

export const pickTextFiles = async (maxBytes: number): Promise<PickTextFilesResult> => {
  if (Platform.OS !== 'android' || !UtilsModule?.pickFiles) {
    throw new Error('当前版本暂不支持选择文件')
  }
  const result = await UtilsModule.pickFiles(TEXT_FILE_MIME_TYPES, maxBytes)
  return {
    didCancel: !!result?.didCancel,
    files: Array.isArray(result?.files) ? result.files : [],
    skipped: Array.isArray(result?.skipped) ? result.skipped : [],
  }
}

export const readTextFile = async (uri: string, maxBytes: number): Promise<string> => {
  if (Platform.OS !== 'android' || !uri || !UtilsModule?.readTextFile) {
    throw new Error('当前版本不支持读取文件')
  }
  const result = await UtilsModule.readTextFile(uri, maxBytes)
  if (typeof result !== 'string' || !result.trim()) throw new Error('文件内容为空')
  return result
}

/** 尽力删除一组 file:// 本地缓存附件（消息/附件删除后回收，失败忽略） */
export const deleteLocalFiles = async (uris: (string | undefined)[]): Promise<void> => {
  const targets = (uris || []).filter((u): u is string => !!u && u.startsWith('file://'))
  if (!targets.length) return
  try {
    if (UtilsModule?.deleteFiles) await UtilsModule.deleteFiles(targets)
  } catch {
    // 忽略
  }
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
