import settingState from '@/store/setting/state'
import { DEFAULT_API_PATH } from '@/config/constant'

/** 规范化中转站 base URL，统一到 .../v1 */
export const normalizeBaseUrl = (raw: string): string => {
  let url = (raw || '').trim().replace(/\/+$/, '')
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  if (!/\/v1$/i.test(url)) {
    if (url.endsWith('/v1/chat/completions')) {
      url = url.replace(/\/chat\/completions$/i, '')
    } else {
      url = `${url}${DEFAULT_API_PATH}`
    }
  }
  return url
}

export const getApiConfig = () => {
  const setting = settingState.setting
  const baseUrl = normalizeBaseUrl(setting['api.baseUrl'])
  const apiKey = setting['api.apiKey']?.trim() || ''
  let extraHeaders: Record<string, string> = {}
  const raw = setting['api.extraHeaders']?.trim()
  if (raw) {
    try {
      extraHeaders = JSON.parse(raw) as Record<string, string>
    } catch {
      // ignore invalid json
    }
  }
  return { baseUrl, apiKey, extraHeaders }
}

export const buildHeaders = (apiKey: string, extraHeaders: Record<string, string> = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const parseErrorMessage = async (res: Response): Promise<string> => {
  try {
    const data = (await res.json()) as { error?: { message?: string }; message?: string }
    return data.error?.message || data.message || res.statusText || `HTTP ${res.status}`
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}
