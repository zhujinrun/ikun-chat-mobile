export const FONT_SIZE_OPTIONS = [
  { value: 14, label: '小号' },
  { value: 16, label: '标准' },
  { value: 18, label: '大号' },
  { value: 20, label: '超大' },
]

export const ENDPOINT_MODE_OPTIONS: Array<{
  value: LX.ApiEndpointMode
  label: string
  desc: string
}> = [
  { value: 'chat_completions', label: '兼容 Chat', desc: '走 /chat/completions，文件先本地解析' },
  { value: 'responses', label: 'Responses', desc: '走 /responses，可原文件直传' },
]

export const FILE_HANDLING_OPTIONS: Array<{
  value: LX.FileHandlingMode
  label: string
  desc: string
}> = [
  { value: 'local_extract', label: '本地解析优先', desc: '提取失败再附加原始数据' },
  { value: 'direct_file', label: '原文件直传', desc: '需要 Responses 支持' },
]

export const endpointModeLabel = (mode?: LX.ApiEndpointMode) =>
  mode === 'responses' ? 'Responses' : 'Chat'

export const fileHandlingLabel = (mode?: LX.FileHandlingMode) =>
  mode === 'direct_file' ? '原文件直传' : '本地解析优先'

export const validateExtraHeaders = (raw: string) => {
  const text = raw.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '额外请求头必须是 JSON 对象'
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim()) return '请求头名称不能为空'
      if (typeof value !== 'string') return `请求头 ${key} 的值必须是字符串`
    }
    return null
  } catch {
    return '额外请求头不是合法 JSON'
  }
}
