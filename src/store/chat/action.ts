import { chatCompletionsStream } from '@/core/api'
import type { ApiMessage, ApiMessageContentPart } from '@/core/api'
import { readImageDataUrl } from '@/utils/nativeModules/utils'
import conversationAction from '@/store/conversation/action'
import conversationState from '@/store/conversation/state'
import settingState from '@/store/setting/state'
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

const buildUserContent = async (message: LX.ChatMessage): Promise<ApiMessage['content']> => {
  const imageParts: ApiMessageContentPart[] = []
  for (const attachment of message.attachments || []) {
    if (attachment.type !== 'image') continue
    const url = await resolveAttachmentDataUrl(attachment)
    imageParts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
  }
  const text = message.content.trim()
  if (!imageParts.length) return text
  const parts: ApiMessageContentPart[] = []
  if (text) parts.push({ type: 'text', text })
  parts.push(...imageParts)
  return parts
}

const buildApiMessages = async (conversationId: string): Promise<ApiMessage[]> => {
  const conv = conversationState.conversations.find((c) => c.id === conversationId)
  const systemPrompt = conv?.systemPrompt || settingState.setting['chat.systemPrompt']
  const history = conversationAction.getMessages(conversationId).filter((m) => m.role !== 'error')

  const messages: ApiMessage[] = []
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: await buildUserContent(m) })
    } else if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content })
    }
  }
  return messages
}

const resolveModel = (conv: LX.Conversation) => {
  const model = conv.model || settingState.setting['api.defaultModel']
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
  try {
    const messages = await buildApiMessages(conv.id)
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
          if (typeof delta === 'string') full += delta
          else full += String(delta ?? '')
          // 流式过程只更新内存 + 节流 UI，避免每个 token 写盘/狂刷 setState
          void conversationAction.updateMessageContent(conv.id, assistant.id, full, false)
        },
        onDone: () => {
          if (!full) {
            void conversationAction.updateMessageContent(
              conv.id,
              assistant.id,
              '（模型未返回内容）',
              false
            )
          }
        },
      },
      controller.signal
    )
    if (controller.signal.aborted) {
      finalStatus = 'stopped'
      if (!full) {
        await conversationAction.updateMessageContent(conv.id, assistant.id, '（已停止）', false)
      }
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      finalStatus = 'stopped'
      if (!full) {
        await conversationAction.updateMessageContent(conv.id, assistant.id, '（已停止）', false)
      }
    } else {
      const rawMsg = err?.message || '请求失败'
      if (isAttachmentReadError(err)) {
        failedAttachmentUris = err.attachmentUris
      }
      const msg = hasImageInput ? `${rawMsg}\n请确认当前模型支持图片输入。` : rawMsg
      failedMessage = msg
      if (full) {
        finalStatus = 'failed'
        await conversationAction.updateMessageContent(
          conv.id,
          assistant.id,
          `${full}\n\n[错误] ${msg}`,
          false
        )
      } else {
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
        title: (text || '图片消息').slice(0, 30),
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
