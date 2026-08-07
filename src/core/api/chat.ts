import settingState from '@/store/setting/state'
import { buildHeaders, getApiConfig, ApiError, parseErrorMessage } from './client'
import type { ApiMessage, ChatCompletionChunk, ChatCompletionResponse } from './types'

export type StreamHandlers = {
  onDelta: (text: string) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

const buildBody = (model: string, messages: ApiMessage[], stream: boolean) => {
  const setting = settingState.setting
  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
    temperature: setting['chat.temperature'],
  }
  const maxTokens = setting['chat.maxTokens']
  if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens
  return body
}

/** 兼容 string / multimodal array 等 delta 形态，统一成纯文本 */
const normalizeContentDelta = (raw: unknown): string => {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const p = part as { text?: string; content?: string }
          if (typeof p.text === 'string') return p.text
          if (typeof p.content === 'string') return p.content
        }
        return ''
      })
      .join('')
  }
  if (typeof raw === 'object') {
    const o = raw as { text?: string; content?: string }
    if (typeof o.text === 'string') return o.text
    if (typeof o.content === 'string') return o.content
  }
  return ''
}

/** 非流式对话 */
export const chatCompletions = async (
  model: string,
  messages: ApiMessage[],
  signal?: AbortSignal
): Promise<string> => {
  const { baseUrl, apiKey, extraHeaders } = getApiConfig()
  if (!baseUrl) throw new ApiError('请先配置 API URL')
  if (!apiKey) throw new ApiError('请先配置 API Key')

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(apiKey, extraHeaders),
    body: JSON.stringify(buildBody(model, messages, false)),
    signal,
  })

  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status)

  const data = (await res.json()) as ChatCompletionResponse
  if (data.error?.message) throw new ApiError(data.error.message)

  const content = normalizeContentDelta(data.choices?.[0]?.message?.content)
  if (!content) throw new ApiError('模型返回为空')
  return content
}

/**
 * 流式对话。
 * 优先使用 fetch + body 增量读取；若环境不支持或中途失败则回退非流式。
 */
export const chatCompletionsStream = async (
  model: string,
  messages: ApiMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> => {
  const { baseUrl, apiKey, extraHeaders } = getApiConfig()
  if (!baseUrl) throw new ApiError('请先配置 API URL')
  if (!apiKey) throw new ApiError('请先配置 API Key')

  const useStream = settingState.setting['chat.stream'] !== false

  const emitDone = () => {
    try {
      handlers.onDone?.()
    } catch (err) {
      console.error('[chat.stream] onDone failed', err)
    }
  }

  const emitDelta = (text: string) => {
    if (!text) return
    try {
      handlers.onDelta(text)
    } catch (err) {
      console.error('[chat.stream] onDelta failed', err)
    }
  }

  if (!useStream) {
    const text = await chatCompletions(model, messages, signal)
    emitDelta(text)
    emitDone()
    return
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...buildHeaders(apiKey, extraHeaders),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(buildBody(model, messages, true)),
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) return
    throw err
  }

  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status)

  // RN 部分版本 body.getReader 不可用，降级非流式
  const body = res.body as any
  if (!body || typeof body.getReader !== 'function') {
    try {
      const text = await res.text()
      const full = parseSseToText(text)
      if (full) {
        emitDelta(full)
        emitDone()
        return
      }
    } catch (err) {
      console.warn('[chat.stream] sse text fallback failed', err)
    }
    const fallback = await chatCompletions(model, messages, signal)
    emitDelta(fallback)
    emitDone()
    return
  }

  const reader = body.getReader()
  let decoder: { decode: (input?: ArrayBuffer | Uint8Array, options?: { stream?: boolean }) => string }
  try {
    decoder = new TextDecoder('utf-8')
  } catch {
    // 极少数环境无 TextDecoder
    decoder = {
      decode: (input) => {
        if (!input) return ''
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer)
        let s = ''
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
        try {
          return decodeURIComponent(escape(s))
        } catch {
          return s
        }
      },
    }
  }

  let buffer = ''
  let receivedAny = false

  try {
    while (true) {
      let readResult: { done: boolean; value?: Uint8Array }
      try {
        readResult = await reader.read()
      } catch (err: any) {
        if (signal?.aborted) return
        console.warn('[chat.stream] reader.read failed, fallback', err?.message || err)
        if (!receivedAny) {
          const fallback = await chatCompletions(model, messages, signal)
          emitDelta(fallback)
        }
        emitDone()
        return
      }

      const { done, value } = readResult
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (!trimmed.startsWith('data:')) continue
        const dataStr = trimmed.slice(5).trim()
        if (dataStr === '[DONE]') {
          emitDone()
          return
        }
        try {
          const chunk = JSON.parse(dataStr) as ChatCompletionChunk
          if (chunk.error?.message) throw new ApiError(chunk.error.message)
          // 部分中转站 delta.content 非 string
          const delta = normalizeContentDelta(
            (chunk.choices?.[0] as any)?.delta?.content ??
              (chunk.choices?.[0] as any)?.message?.content
          )
          if (delta) {
            receivedAny = true
            emitDelta(delta)
          }
        } catch (err: any) {
          if (err instanceof ApiError) throw err
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    try {
      reader.releaseLock?.()
    } catch {
      // ignore
    }
  }

  emitDone()
}

const parseSseToText = (raw: string): string => {
  let out = ''
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const dataStr = trimmed.slice(5).trim()
    if (!dataStr || dataStr === '[DONE]') continue
    try {
      const chunk = JSON.parse(dataStr) as ChatCompletionChunk
      const delta = normalizeContentDelta(
        (chunk.choices?.[0] as any)?.delta?.content ??
          (chunk.choices?.[0] as any)?.message?.content
      )
      if (delta) out += delta
    } catch {
      // ignore
    }
  }
  return out
}
