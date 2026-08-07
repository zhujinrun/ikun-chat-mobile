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

  const content = data.choices?.[0]?.message?.content
  if (content == null) throw new ApiError('模型返回为空')
  return content
}

/**
 * 流式对话。
 * 优先使用 fetch + body 增量读取；若环境不支持则回退到非流式。
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

  if (!useStream) {
    const text = await chatCompletions(model, messages, signal)
    handlers.onDelta(text)
    handlers.onDone?.()
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
    // 某些实现会把整段 SSE 当文本返回
    const text = await res.text()
    const full = parseSseToText(text)
    if (full) {
      handlers.onDelta(full)
      handlers.onDone?.()
      return
    }
    // 再降级：重新非流式请求
    const fallback = await chatCompletions(model, messages, signal)
    handlers.onDelta(fallback)
    handlers.onDone?.()
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
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
        handlers.onDone?.()
        return
      }
      try {
        const chunk = JSON.parse(dataStr) as ChatCompletionChunk
        if (chunk.error?.message) throw new ApiError(chunk.error.message)
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) handlers.onDelta(delta)
      } catch (err: any) {
        if (err instanceof ApiError) throw err
        // 忽略无法解析的行
      }
    }
  }

  handlers.onDone?.()
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
      const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content
      if (delta) out += delta
    } catch {
      // ignore
    }
  }
  return out
}
