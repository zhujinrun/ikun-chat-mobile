import { chatCompletionsStream } from '@/core/api'
import type { ApiMessage, ApiMessageContentPart } from '@/core/api'
import { extractFileText, readFileDataUrl, readImageDataUrl } from '@/utils/nativeModules/utils'
import conversationAction from '@/store/conversation/action'
import conversationState from '@/store/conversation/state'
import settingState from '@/store/setting/state'
import stationAction from '@/store/station/action'
import state from './state'

class AttachmentReadError extends Error {
  attachmentUris: string[]

  constructor(message: string, attachmentUris: string[]) {
    super(message)
    this.name = 'AttachmentReadError'
    this.attachmentUris = attachmentUris.filter(Boolean)
  }
}

const isAttachmentReadError = (err: unknown): err is AttachmentReadError =>
  Array.isArray((err as AttachmentReadError | undefined)?.attachmentUris)

const MAX_FILE_BYTES = 10 * 1024 * 1024
const STREAM_DEDUP_MIN_CHARS = 24
const STREAM_RENDER_INTERVAL_MS = 28
const STREAM_RENDER_MIN_CHARS = 18
const STREAM_RENDER_MAX_CHARS = 80

/**
 * 部分 Responses 兼容中转站会把累计文本或最终完整文本当作 delta 再推一次。
 * 这里按“累计/重叠则替换或补后缀”的方式合并，避免 AI 回复整段重复展示。
 */
const appendStreamDelta = (current: string, delta: string): string => {
  if (!delta) return current
  if (!current) return delta
  if (delta === current) return current

  const normalizedDelta = delta.trimStart()
  if (normalizedDelta.length >= STREAM_DEDUP_MIN_CHARS) {
    if (normalizedDelta === current) return current
    if (normalizedDelta.startsWith(current)) return normalizedDelta
    if (current.endsWith(normalizedDelta)) return current
    if (normalizedDelta.length >= 80 && current.includes(normalizedDelta)) return current
  }

  const maxOverlap = Math.min(current.length, delta.length)
  for (let len = maxOverlap; len >= STREAM_DEDUP_MIN_CHARS; len--) {
    if (current.endsWith(delta.slice(0, len))) {
      return current + delta.slice(len)
    }
  }

  return current + delta
}

const getStreamRenderStepLength = (text: string): number => {
  if (text.length <= STREAM_RENDER_MAX_CHARS) return text.length
  const start = Math.min(STREAM_RENDER_MIN_CHARS, text.length)
  const end = Math.min(STREAM_RENDER_MAX_CHARS, text.length)
  for (let i = end; i >= start; i--) {
    if (/[\n。！？；，、,.!?;:）)\]} ]/.test(text.charAt(i - 1))) return i
  }
  return end
}

const createStreamRenderQueue = (conversationId: string, messageId: string) => {
  let rendered = ''
  let target = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let drainResolvers: Array<() => void> = []

  const writeRendered = (content: string) => {
    rendered = content
    void conversationAction
      .updateMessageContent(conversationId, messageId, rendered, false)
      .catch((err) => console.error('[chat.stream] render update failed', err))
  }

  const resolveDrains = () => {
    if (rendered !== target || timer != null) return
    const resolvers = drainResolvers
    drainResolvers = []
    resolvers.forEach((resolve) => resolve())
  }

  const clearTimer = () => {
    if (timer == null) return
    clearTimeout(timer)
    timer = null
  }

  const schedule = () => {
    if (timer != null || rendered === target) {
      resolveDrains()
      return
    }
    timer = setTimeout(flushStep, STREAM_RENDER_INTERVAL_MS)
  }

  function flushStep() {
    timer = null
    if (rendered === target) {
      resolveDrains()
      return
    }

    if (!target.startsWith(rendered)) {
      writeRendered(target)
      resolveDrains()
      return
    }

    const pending = target.slice(rendered.length)
    const stepLength = getStreamRenderStepLength(pending)
    writeRendered(rendered + pending.slice(0, stepLength))
    schedule()
  }

  return {
    enqueue(next: string) {
      target = next
      if (!rendered) {
        flushStep()
      } else {
        schedule()
      }
    },
    drain() {
      if (rendered === target && timer == null) return Promise.resolve()
      schedule()
      return new Promise<void>((resolve) => {
        drainResolvers.push(resolve)
      })
    },
    async flushNow(next?: string) {
      if (typeof next === 'string') target = next
      clearTimer()
      if (rendered !== target) {
        rendered = target
        await conversationAction.updateMessageContent(conversationId, messageId, rendered, false)
      }
      resolveDrains()
    },
    clear() {
      clearTimer()
      target = rendered
      resolveDrains()
    },
  }
}

/** 取一张图片附件的 dataUrl：优先旧数据里已存的 base64，否则从本地缓存文件实时读取 */
const resolveAttachmentDataUrl = async (
  attachment: LX.ChatAttachment
): Promise<string> => {
  const label = attachment.name ? `「${attachment.name}」` : '图片'
  if (attachment.dataUrl) return attachment.dataUrl
  if (attachment.uri && /^data:image\//.test(attachment.uri)) return attachment.uri
  if (attachment.uri && /^(?:file|content):/.test(attachment.uri)) {
    try {
      return await readImageDataUrl(attachment.uri)
    } catch (err: any) {
      throw new AttachmentReadError(`${label}读取失败，请重新选择图片后再发送`, [attachment.uri])
    }
  }
  throw new AttachmentReadError(
    `${label}地址不可读取，请重新选择图片后再发送`,
    attachment.uri ? [attachment.uri] : []
  )
}

const resolveExtractedFileText = async (attachment: LX.ChatAttachment): Promise<string | null> => {
  if (!attachment.uri || !/^(?:file|content):/.test(attachment.uri)) return null
  try {
    const text = await extractFileText(
      attachment.uri,
      attachment.mimeType || 'application/octet-stream',
      attachment.name || '文件',
      MAX_FILE_BYTES
    )
    return [
      `文件：${attachment.name || '未命名文件'}`,
      attachment.mimeType ? `类型：${attachment.mimeType}` : '',
      attachment.size ? `大小：${Math.round(attachment.size / 1024)}KB` : '',
      '',
      text,
    ].filter(Boolean).join('\n')
  } catch {
    return null
  }
}

const resolveFilePart = async (attachment: LX.ChatAttachment): Promise<ApiMessageContentPart> => {
  const label = attachment.name ? `「${attachment.name}」` : '文件'
  if (!attachment.uri || !/^(?:file|content):/.test(attachment.uri)) {
    throw new AttachmentReadError(
      `${label}地址不可读取，请重新选择文件后再发送`,
      attachment.uri ? [attachment.uri] : []
    )
  }
  try {
    const fileData = await readFileDataUrl(
      attachment.uri,
      attachment.mimeType || 'application/octet-stream',
      MAX_FILE_BYTES
    )
    return {
      type: 'file',
      file: {
        filename: attachment.name || 'attachment',
        file_data: fileData,
      },
    }
  } catch {
    throw new AttachmentReadError(`${label}读取失败，请重新选择文件后再发送`, [attachment.uri])
  }
}

const buildUserContent = async (
  message: LX.ChatMessage,
  fileHandling: LX.FileHandlingMode
): Promise<ApiMessage['content']> => {
  const imageParts: ApiMessageContentPart[] = []
  const fileParts: ApiMessageContentPart[] = []
  const fileBlocks: string[] = []
  const fileSummaries: string[] = []
  const directFiles = fileHandling === 'direct_file'
  for (const attachment of message.attachments || []) {
    if (attachment.type === 'image') {
      const url = await resolveAttachmentDataUrl(attachment)
      imageParts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
    } else if (attachment.type === 'file') {
      if (directFiles) {
        fileSummaries.push(
          [
            `文件：${attachment.name || '未命名文件'}`,
            attachment.mimeType ? `类型：${attachment.mimeType}` : '',
            attachment.size ? `大小：${Math.round(attachment.size / 1024)}KB` : '',
            '已按原文件随请求发送',
          ].filter(Boolean).join('，')
        )
        fileParts.push(await resolveFilePart(attachment))
        continue
      }
      const extracted = await resolveExtractedFileText(attachment)
      if (extracted) {
        fileBlocks.push(extracted)
        continue
      }
      fileSummaries.push(
        [
          `文件：${attachment.name || '未命名文件'}`,
          attachment.mimeType ? `类型：${attachment.mimeType}` : '',
          attachment.size ? `大小：${Math.round(attachment.size / 1024)}KB` : '',
          '本地未提取到可读文本，已附加原始文件数据',
        ].filter(Boolean).join('，')
      )
      fileParts.push(await resolveFilePart(attachment))
    }
  }
  const text = [
    message.content.trim() || (fileBlocks.length || fileParts.length ? '请结合附件内容回答。' : ''),
    fileBlocks.length ? '以下是本地解析出的附件内容，请优先基于这些内容回答：' : '',
    ...fileSummaries,
    ...fileBlocks.map((block) => `<file>\n${block}\n</file>`),
  ]
    .filter(Boolean)
    .join('\n\n')
  if (!imageParts.length && !fileParts.length) return text
  const parts: ApiMessageContentPart[] = []
  if (text) parts.push({ type: 'text', text })
  parts.push(...fileParts)
  parts.push(...imageParts)
  return parts
}

const buildApiMessages = async (
  conversationId: string,
  fileHandling: LX.FileHandlingMode
): Promise<ApiMessage[]> => {
  const conv = conversationState.conversations.find((c) => c.id === conversationId)
  const systemPrompt = conv?.systemPrompt || settingState.setting['chat.systemPrompt']
  const history = conversationAction.getMessages(conversationId).filter((m) => m.role !== 'error')

  const messages: ApiMessage[] = []
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: await buildUserContent(m, fileHandling) })
    } else if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content })
    }
  }
  return messages
}

const resolveModel = (conv: LX.Conversation) => {
  const station = stationAction.getForConversation(conv)
  const model = conv.model || station?.defaultModel || settingState.setting['api.defaultModel']
  if (!model) {
    throw new Error('请先选择模型（设置中配置 API 并刷新模型列表）')
  }
  return model
}

/** 对已插入的空 assistant 消息发起流式补全 */
const streamAssistantReply = async (conv: LX.Conversation, assistant: LX.ChatMessage) => {
  const model = resolveModel(conv)
  const controller = new AbortController()
  state.abortController = controller
  state.streaming = true
  state.stopping = false
  state.streamingConversationId = conv.id
  state.streamingMessageId = assistant.id
  try {
    global.state_event.streamingUpdated()
  } catch (err) {
    console.error('[chat] streamingUpdated failed', err)
  }

  let full = ''
  let failedMessage: string | null = null
  let failedAttachmentUris: string[] = []
  let hasImageInput = false
  let assistantRemoved = false
  let finalStatus: LX.ChatMessageStatus | undefined
  const renderQueue = createStreamRenderQueue(conv.id, assistant.id)
  try {
    const station = stationAction.getForConversation(conv)
    const fileHandling =
      station?.endpointMode === 'responses' && station.fileHandling === 'direct_file'
        ? 'direct_file'
        : 'local_extract'
    const messages = await buildApiMessages(conv.id, fileHandling)
    // 去掉刚插入的空 assistant，避免重复
    const apiMessages = messages.filter(
      (m, idx) => !(idx === messages.length - 1 && m.role === 'assistant' && !m.content)
    )
    hasImageInput = apiMessages.some((message) =>
      Array.isArray(message.content) &&
        message.content.some((part) => part.type === 'image_url')
    )

    await chatCompletionsStream(
      model,
      apiMessages,
      {
        onDelta: (delta) => {
          full = appendStreamDelta(full, typeof delta === 'string' ? delta : String(delta ?? ''))
          renderQueue.enqueue(full)
        },
        onDone: () => {
          if (!full) {
            full = '（模型未返回内容）'
            renderQueue.enqueue(full)
          }
        },
      },
      controller.signal,
      conv.stationId
    )
    if (controller.signal.aborted) {
      finalStatus = 'stopped'
      if (!full) {
        full = '（已停止）'
      }
      await renderQueue.flushNow(full)
    } else {
      await renderQueue.drain()
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      finalStatus = 'stopped'
      if (!full) {
        full = '（已停止）'
      }
      await renderQueue.flushNow(full)
    } else {
      const rawMsg = err?.message || '请求失败'
      if (isAttachmentReadError(err)) {
        failedAttachmentUris = err.attachmentUris
      }
      const msg = hasImageInput ? `${rawMsg}\n请确认当前模型支持图片输入。` : rawMsg
      failedMessage = msg
      if (full) {
        finalStatus = 'failed'
        await renderQueue.flushNow(`${full}\n\n[错误] ${msg}`)
      } else {
        renderQueue.clear()
        assistantRemoved = true
        await conversationAction.removeMessage(conv.id, assistant.id)
        try {
          await conversationAction.addMessage({
            conversationId: conv.id,
            role: 'error',
            status: 'failed',
            content: msg,
          })
        } catch (addErr) {
          console.error('[chat] add error message failed', addErr)
        }
      }
    }
  } finally {
    try {
      if (!assistantRemoved) {
        await conversationAction.updateMessageStatus(conv.id, assistant.id, finalStatus, false)
      }
      await conversationAction.flushMessages(conv.id)
    } catch (err) {
      console.error('[chat] flushMessages failed', err)
    }
    if (
      state.abortController === controller &&
      state.streamingConversationId === conv.id &&
      state.streamingMessageId === assistant.id
    ) {
      state.streaming = false
      state.stopping = false
      state.streamingConversationId = null
      state.streamingMessageId = null
      state.abortController = null
      try {
        global.state_event.streamingUpdated()
      } catch (err) {
        console.error('[chat] streamingUpdated failed', err)
      }
    }
  }

  // 错误已写入会话，再抛给 UI 做 toast；不再让未处理 Promise 直接打崩
  if (failedMessage) {
    const err = new Error(failedMessage) as Error & { attachmentUris?: string[] }
    if (failedAttachmentUris.length) err.attachmentUris = failedAttachmentUris
    throw err
  }
}

/** 找到最后一条 user 消息下标 */
const findLastUserIndex = (list: LX.ChatMessage[]) => {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user') return i
  }
  return -1
}

/** 从某条 user 起重新生成：保留到该 user（含），删后续，再请求 */
const regenerateFromUserIndex = async (conv: LX.Conversation, userIdx: number) => {
  const list = conversationAction.getMessages(conv.id)
  if (userIdx < 0 || userIdx >= list.length || list[userIdx].role !== 'user') {
    throw new Error('没有可重新生成的消息')
  }

  await conversationAction.trimMessagesTo(conv.id, userIdx)

  const assistant = await conversationAction.addMessage({
    conversationId: conv.id,
    role: 'assistant',
    status: 'streaming',
    content: '',
  })

  await streamAssistantReply(conv, assistant)
}

export default {
  stop() {
    if (!state.abortController || state.stopping) return
    state.stopping = true
    try {
      global.state_event.streamingUpdated()
    } catch (err) {
      console.error('[chat] streamingUpdated failed', err)
    }
    state.abortController?.abort()
  },

  async send(content: string, attachments: LX.ChatAttachment[] = []) {
    const text = content.trim()
    if ((!text && !attachments.length) || state.streaming) return

    let conv = conversationAction.getActive()
    if (!conv) {
      conv = await conversationAction.createConversation()
    }

    resolveModel(conv)

    await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: text,
      attachments,
    })

    const assistant = await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      status: 'streaming',
      content: '',
    })

    await streamAssistantReply(conv, assistant)
  },

  /**
   * 基于最后一条用户消息重新生成助手回复。
   * 会删除该 user 之后的 assistant / error 等消息，再流式请求一次。
   */
  async regenerate() {
    if (state.streaming) return

    const conv = conversationAction.getActive()
    if (!conv) {
      throw new Error('当前没有会话')
    }

    resolveModel(conv)

    const list = conversationAction.getMessages(conv.id)
    const lastUserIdx = findLastUserIndex(list)
    if (lastUserIdx < 0) {
      throw new Error('没有可重新生成的消息')
    }

    const tail = list.slice(lastUserIdx + 1)
    const canRegen =
      tail.length === 0 ||
      tail.every((m) => m.role === 'assistant' || m.role === 'error')
    if (!canRegen) {
      throw new Error('当前消息无法重新生成')
    }

    await regenerateFromUserIndex(conv, lastUserIdx)
  },

  /**
   * 错误一键重试：与 regenerate 相同路径（去掉末尾 error/空 assistant 后重请求）。
   */
  async retry() {
    await this.regenerate()
  },

  /**
   * 编辑某条用户消息并重发：更新内容，删除其后所有消息，再请求。
   */
  async resendFrom(
    userMessageId: string,
    content: string,
    attachments?: LX.ChatAttachment[]
  ) {
    if (state.streaming) return

    const text = content.trim()
    if (!text && !attachments?.length) {
      throw new Error('消息不能为空')
    }

    const conv = conversationAction.getActive()
    if (!conv) {
      throw new Error('当前没有会话')
    }

    resolveModel(conv)

    const list = conversationAction.getMessages(conv.id)
    const idx = list.findIndex((m) => m.id === userMessageId)
    if (idx < 0 || list[idx].role !== 'user') {
      throw new Error('只能编辑用户消息')
    }

    await conversationAction.trimMessagesTo(conv.id, idx)
    await conversationAction.updateMessageContent(conv.id, userMessageId, text)
    await conversationAction.updateMessageAttachments(conv.id, userMessageId, attachments)

    // 若是会话首条用户消息，同步刷新标题
    const convItem = conversationState.conversations.find((c) => c.id === conv.id)
    if (convItem && idx === 0) {
      await conversationAction.updateConversation(conv.id, {
        title: (text || '附件消息').slice(0, 30),
      })
    }

    const assistant = await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      status: 'streaming',
      content: '',
    })

    await streamAssistantReply(conv, assistant)
  },

  /** 当前会话是否可重新生成 / 重试 */
  canRegenerate(): boolean {
    if (state.streaming) return false
    const conv = conversationAction.getActive()
    if (!conv) return false
    const list = conversationAction.getMessages(conv.id)
    const lastUserIdx = findLastUserIndex(list)
    if (lastUserIdx < 0) return false
    const tail = list.slice(lastUserIdx + 1)
    return (
      tail.length === 0 ||
      tail.every((m) => m.role === 'assistant' || m.role === 'error')
    )
  },

  canEditUser(messageId: string): boolean {
    if (state.streaming) return false
    const conv = conversationAction.getActive()
    if (!conv) return false
    const list = conversationAction.getMessages(conv.id)
    const msg = list.find((m) => m.id === messageId)
    return !!msg && msg.role === 'user'
  },
}
