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

type SseConsumeResult = {
  done: boolean
  receivedAny: boolean
}

type StreamEmitters = {
  emitDelta: (text: string) => void
  emitDone: () => void
}

const parseCompletionText = (raw: string): string => {
  if (!raw.trim()) return ''
  try {
    const data = JSON.parse(raw) as ChatCompletionResponse & ChatCompletionChunk
    if (data.error?.message) throw new ApiError(data.error.message)
    return normalizeContentDelta(
      data.choices?.[0]?.message?.content ??
        (data.choices?.[0] as any)?.delta?.content
    )
  } catch (err) {
    if (err instanceof ApiError) throw err
    return ''
  }
}

const parseSseData = (
  dataStr: string,
  emitDelta: (text: string) => void
): 'done' | 'delta' | 'ignore' => {
  if (!dataStr) return 'ignore'
  if (dataStr === '[DONE]') return 'done'
  try {
    const chunk = JSON.parse(dataStr) as ChatCompletionChunk
    if (chunk.error?.message) throw new ApiError(chunk.error.message)
    // 部分中转站 delta.content 非 string
    const delta = normalizeContentDelta(
      (chunk.choices?.[0] as any)?.delta?.content ??
        (chunk.choices?.[0] as any)?.message?.content
    )
    if (!delta) return 'ignore'
    emitDelta(delta)
    return 'delta'
  } catch (err: any) {
    if (err instanceof ApiError) throw err
    // 忽略无法解析的行
    return 'ignore'
  }
}

const createSseConsumer = (emitDelta: (text: string) => void) => {
  let buffer = ''

  const consume = (text: string): SseConsumeResult => {
    buffer += text
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    let receivedAny = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue
      if (!trimmed.startsWith('data:')) continue
      const result = parseSseData(trimmed.slice(5).trim(), emitDelta)
      if (result === 'done') return { done: true, receivedAny }
      if (result === 'delta') receivedAny = true
    }

    return { done: false, receivedAny }
  }

  const flush = (): SseConsumeResult => {
    if (!buffer.trim()) return { done: false, receivedAny: false }
    const pending = buffer
    buffer = ''
    return consume(`${pending}\n`)
  }

  return { consume, flush }
}

const parseXhrErrorMessage = (raw: string, statusText: string, status: number): string => {
  try {
    const data = JSON.parse(raw) as { error?: { message?: string }; message?: string }
    return data.error?.message || data.message || statusText || `HTTP ${status}`
  } catch {
    return statusText || `HTTP ${status}`
  }
}

/** 非流式对话 */
export const chatCompletions = async (
  model: string,
  messages: ApiMessage[],
  signal?: AbortSignal,
  stationId?: string | null
): Promise<string> => {
  const { baseUrl, apiKey, extraHeaders } = getApiConfig(stationId)
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

const chatCompletionsStreamXhr = async (
  url: string,
  headers: Record<string, string>,
  requestBody: string,
  emitters: StreamEmitters,
  signal?: AbortSignal
): Promise<boolean> => {
  if (typeof XMLHttpRequest === 'undefined') return false

  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const sse = createSseConsumer(emitters.emitDelta)
    let seenLength = 0
    let receivedAny = false
    let settled = false
    let doneEmitted = false

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort)
    }

    const finish = (handled: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(handled)
    }

    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const emitDoneOnce = () => {
      if (doneEmitted) return
      doneEmitted = true
      emitters.emitDone()
    }

    const handleConsumeResult = (result: SseConsumeResult) => {
      if (result.receivedAny) receivedAny = true
      if (result.done) {
        emitDoneOnce()
        finish(true)
        try {
          xhr.abort()
        } catch {
          // ignore
        }
      }
    }

    const consumeNewText = () => {
      if (settled || xhr.status >= 400) return
      const text = xhr.responseText || ''
      if (text.length <= seenLength) return
      const chunk = text.slice(seenLength)
      seenLength = text.length
      handleConsumeResult(sse.consume(chunk))
    }

    function handleAbort() {
      try {
        xhr.abort()
      } catch {
        // ignore
      }
      finish(true)
    }

    signal?.addEventListener('abort', handleAbort, { once: true })

    try {
      xhr.open('POST', url, true)
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value)
      }
    } catch (err) {
      fail(err)
      return
    }

    xhr.onprogress = () => {
      try {
        consumeNewText()
      } catch (err) {
        fail(err)
      }
    }

    xhr.onload = () => {
      if (settled) return
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(
          new ApiError(
            parseXhrErrorMessage(xhr.responseText || '', xhr.statusText, xhr.status),
            xhr.status
          )
        )
        return
      }

      try {
        consumeNewText()
        handleConsumeResult(sse.flush())
        if (!receivedAny) {
          const text = parseCompletionText(xhr.responseText || '')
          if (text) {
            emitters.emitDelta(text)
            receivedAny = true
          }
        }
      } catch (err) {
        fail(err)
        return
      }

      if (receivedAny) {
        emitDoneOnce()
        finish(true)
      } else {
        finish(false)
      }
    }

    xhr.onerror = () => fail(new ApiError('网络请求失败'))
    xhr.ontimeout = () => fail(new ApiError('请求超时'))
    xhr.onabort = () => {
      if (signal?.aborted || settled) return
      finish(false)
    }

    try {
      xhr.send(requestBody)
    } catch (err) {
      fail(err)
    }
  })
}

/**
 * 流式对话。
 * React Native Android 的 fetch 常没有 body.getReader；优先用 XHR onprogress 做增量读取。
 */
export const chatCompletionsStream = async (
  model: string,
  messages: ApiMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  stationId?: string | null
): Promise<void> => {
  const { baseUrl, apiKey, extraHeaders } = getApiConfig(stationId)
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
    const text = await chatCompletions(model, messages, signal, stationId)
    emitDelta(text)
    emitDone()
    return
  }

  const url = `${baseUrl}/chat/completions`
  const streamHeaders = {
    ...buildHeaders(apiKey, extraHeaders),
    Accept: 'text/event-stream',
  }
  const streamBody = JSON.stringify(buildBody(model, messages, true))

  try {
    const handledByXhr = await chatCompletionsStreamXhr(
      url,
      streamHeaders,
      streamBody,
      { emitDelta, emitDone },
      signal
    )
    if (handledByXhr || signal?.aborted) return
  } catch (err) {
    if (signal?.aborted) return
    throw err
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: streamHeaders,
      body: streamBody,
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) return
    throw err
  }

  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status)

  // 少数环境没有 XHR 或 XHR 没返回内容时，继续尝试 fetch reader / 非流式兜底
  const body = res.body as any
  if (!body || typeof body.getReader !== 'function') {
    try {
      const text = await res.text()
      const full = parseSseToText(text) || parseCompletionText(text)
      if (full) {
        emitDelta(full)
        emitDone()
        return
      }
    } catch (err) {
      console.warn('[chat.stream] sse text fallback failed', err)
    }
    const fallback = await chatCompletions(model, messages, signal, stationId)
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

  const sse = createSseConsumer(emitDelta)
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
          const fallback = await chatCompletions(model, messages, signal, stationId)
          emitDelta(fallback)
        }
        emitDone()
        return
      }

      const { done, value } = readResult
      if (done) break

      const result = sse.consume(decoder.decode(value, { stream: true }))
      if (result.receivedAny) receivedAny = true
      if (result.done) {
        emitDone()
        return
      }
    }
  } finally {
    try {
      reader.releaseLock?.()
    } catch {
      // ignore
    }
  }

  const flushed = sse.flush()
  if (flushed.receivedAny) receivedAny = true
  if (flushed.done) {
    emitDone()
    return
  }
  emitDone()
}

const parseSseToText = (raw: string): string => {
  let out = ''
  const sse = createSseConsumer((text) => {
    out += text
  })
  sse.consume(raw)
  sse.flush()
  return out
}
