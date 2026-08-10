import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { launchImageLibrary, type Asset } from 'react-native-image-picker'
import { useTheme } from '@/store/theme/hook'
import {
  useActiveConversationId,
  useConversations,
  useMessages,
} from '@/store/conversation/hook'
import conversationAction from '@/store/conversation/action'
import chatAction from '@/store/chat/action'
import { useStopping, useStreaming, useStreamingMessageId } from '@/store/chat/hook'
import { useModels } from '@/store/model/hook'
import settingAction from '@/store/setting/action'
import { useSettingValue } from '@/store/setting/hook'
import { navigations } from '@/navigation'
import { toast } from '@/utils/toast'
import { formatConversationText } from '@/utils/exportConversation'
import MarkdownContent from '@/components/chat/MarkdownContent'
import Icon, { type AppIconName } from '@/components/common/Icon'
import IconButton from '@/components/common/IconButton'
import ThinkingIndicator from '@/components/common/ThinkingIndicator'
import ActionButton from '@/components/common/ActionButton'
import AppModal from '@/components/common/AppModal'
import FormField from '@/components/common/FormField'
import { createId } from '@/utils/id'
import { copyImageToClipboard, cacheImageTo, deleteLocalFiles } from '@/utils/nativeModules/utils'
import { markMediaPickerOpened, markMediaPickerSettled } from '@/utils/appResumeRepair'
import {
  inferVisionCapability,
  visionCapabilityLabel,
  type VisionCapability,
} from '@/utils/modelCapability'

type Props = {
  componentId: string
}

type EditTarget = {
  id: string
  content: string
  attachments?: LX.ChatAttachment[]
}

type ImageActionTarget = {
  message: LX.ChatMessage
  attachment: LX.ChatAttachment
}

type ModelCapabilityFilter = 'all' | VisionCapability

const MAX_IMAGE_ATTACHMENTS = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const IMAGE_PICKER_MAX_EDGE = 1600
const IMAGE_PICKER_QUALITY = 0.8 as const

const MODEL_CAPABILITY_FILTERS: Array<{ key: ModelCapabilityFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'vision', label: '视觉' },
  { key: 'text', label: '仅文本' },
  { key: 'unknown', label: '未知' },
]

type BuildImageAttachmentResult =
  | { attachment: LX.ChatAttachment }
  | { reason: 'tooLarge' | 'unreadable'; name?: string; size?: number }

const formatFileSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) {
    const mb = bytes / 1024 / 1024
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

const getModelVisionCapability = (model: LX.ModelInfo): VisionCapability => {
  if (model.supportedVision == null) return inferVisionCapability(model.id)
  return model.supportedVision ? 'vision' : 'text'
}

const formatConversationTime = (ts?: number) => {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const buildImageAttachment = async (asset: Asset): Promise<BuildImageAttachmentResult> => {
  const mimeType = asset.type || 'image/jpeg'
  const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : undefined
  const sourceUri = asset.uri
  const name = asset.fileName || 'image.jpg'
  const size = asset.fileSize ?? (asset.base64 ? Math.ceil((asset.base64.length * 3) / 4) : 0)
  if (!sourceUri && !dataUrl) return { reason: 'unreadable', name }
  if (size > MAX_IMAGE_BYTES) return { reason: 'tooLarge', name, size }

  let uri = ''
  let remainDataUrl: string | undefined
  if (sourceUri && /^(?:file|content):/.test(sourceUri)) {
    const cached = await cacheImageTo(sourceUri)
    if (cached) {
      // 已拷贝到本地缓存目录，只存 URI + 元数据，不再把 base64 写入消息存储
      uri = cached
    } else if (dataUrl) {
      uri = dataUrl
      remainDataUrl = dataUrl
    } else {
      return { reason: 'unreadable', name }
    }
  } else if (dataUrl) {
    uri = dataUrl
    remainDataUrl = dataUrl
  } else if (sourceUri) {
    uri = sourceUri
  } else {
    return { reason: 'unreadable', name }
  }
  if (!uri) return { reason: 'unreadable', name }

  return {
    attachment: {
      id: createId('att_'),
      type: 'image',
      uri,
      mimeType,
      name,
      size,
      width: asset.width,
      height: asset.height,
      ...(remainDataUrl ? { dataUrl: remainDataUrl } : {}),
    },
  }
}

const Home = ({ componentId }: Props) => {
  const theme = useTheme()
  const conversations = useConversations()
  const activeId = useActiveConversationId()
  const messages = useMessages(activeId)
  const streaming = useStreaming()
  const stopping = useStopping()
  const streamingMessageId = useStreamingMessageId()
  const { models } = useModels()
  const defaultModel = useSettingValue('api.defaultModel')
  const apiUrl = useSettingValue('api.baseUrl')
  const apiKey = useSettingValue('api.apiKey')
  const fontSize = useSettingValue('common.fontSize')
  const globalSystemPrompt = useSettingValue('chat.systemPrompt')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [conversationQuery, setConversationQuery] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [modelCapabilityFilter, setModelCapabilityFilter] =
    useState<ModelCapabilityFilter>('all')
  const [input, setInput] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const [conversationActionTarget, setConversationActionTarget] =
    useState<LX.Conversation | null>(null)
  const [messageActionTarget, setMessageActionTarget] = useState<LX.ChatMessage | null>(null)
  const [imageActionTarget, setImageActionTarget] = useState<ImageActionTarget | null>(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<LX.ChatAttachment[]>([])
  const [brokenImageUris, setBrokenImageUris] = useState<Set<string>>(() => new Set())
  /** 输入区「+」附件菜单：提示词等次要能力 */
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  /** 全屏预览的图片 */
  const [previewImage, setPreviewImage] = useState<LX.ChatAttachment | null>(null)
  /** 编辑重发：待发送的图片附件（保留原图，可逐个移除） */
  const [editAttachments, setEditAttachments] = useState<LX.ChatAttachment[]>([])
  const listRef = useRef<FlatList>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  )

  const filteredConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((item) =>
      [item.title, item.model, item.systemPrompt]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(query))
      )
  }, [conversationQuery, conversations])

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase()
    return models.filter((item) => {
      if (query && !item.id.toLowerCase().includes(query)) return false
      if (modelCapabilityFilter === 'all') return true
      return getModelVisionCapability(item) === modelCapabilityFilter
    })
  }, [modelCapabilityFilter, modelQuery, models])

  const modelCapabilityCounts = useMemo(() => {
    const query = modelQuery.trim().toLowerCase()
    const queryMatchedModels = query
      ? models.filter((item) => item.id.toLowerCase().includes(query))
      : models
    const counts: Record<ModelCapabilityFilter, number> = {
      all: queryMatchedModels.length,
      vision: 0,
      text: 0,
      unknown: 0,
    }
    queryMatchedModels.forEach((item) => {
      counts[getModelVisionCapability(item)] += 1
    })
    return counts
  }, [modelQuery, models])

  const currentModel = active?.model || defaultModel || '未选择模型'
  const currentModelId = active?.model || defaultModel || ''
  /** 当前模型图片能力（用于标记与发送前提示） */
  const currentVision = inferVisionCapability(currentModelId)
  const hasPendingImage = pendingAttachments.length > 0
  const remainingImageSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - pendingAttachments.length)
  const remainingImageSlotsLabel =
    remainingImageSlots > 0 ? `还可添加 ${remainingImageSlots} 张` : '已达上限'
  const isPendingImageTextOnly = hasPendingImage && currentVision === 'text'
  const needSetup = !apiUrl || !apiKey
  const hasConvPrompt = !!(active?.systemPrompt && active.systemPrompt.trim())
  const colors = theme.colors

  const openModelPicker = useCallback((filter?: ModelCapabilityFilter) => {
    if (filter) {
      setModelQuery('')
      setModelCapabilityFilter(filter)
    }
    setModelPickerOpen(true)
  }, [])

  const ensureReady = useCallback(() => {
    if (needSetup) {
      toast('请先在设置中配置 API URL 和 API Key')
      void navigations.pushSettingScreen(componentId)
      return false
    }
    return true
  }, [needSetup, componentId])

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const markImageBroken = useCallback((uri?: string) => {
    if (!uri) return
    setBrokenImageUris((prev) => {
      if (prev.has(uri)) return prev
      const next = new Set(prev)
      next.add(uri)
      return next
    })
  }, [])

  const markFailedAttachmentUris = useCallback((err: any) => {
    const uris = Array.isArray(err?.attachmentUris) ? err.attachmentUris : []
    uris.forEach(markImageBroken)
  }, [markImageBroken])

  const isImageBroken = useCallback(
    (attachment: LX.ChatAttachment | null | undefined) =>
      !!attachment?.uri && brokenImageUris.has(attachment.uri),
    [brokenImageUris]
  )

  const handleNewChat = useCallback(async () => {
    await conversationAction.createConversation()
    setConversationQuery('')
    setDrawerOpen(false)
  }, [])

  const handleSelectChat = useCallback(async (id: string) => {
    await conversationAction.setActive(id)
    setDrawerOpen(false)
  }, [])

  const handleDeleteChat = useCallback((id: string, title: string) => {
    Alert.alert('删除会话', `确定删除「${title}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void conversationAction.remove(id)
        },
      },
    ])
  }, [])

  const handleTogglePinChat = useCallback(async (id: string, pinned?: boolean) => {
    await conversationAction.updateConversation(id, { pinned: !pinned })
    toast(pinned ? '已取消置顶' : '已置顶')
  }, [])

  const handleRenameChat = useCallback((id: string, title: string) => {
    setRenameTarget({ id, title })
    setRenameText(title)
  }, [])

  const showConversationActions = useCallback(
    (item: LX.Conversation) => {
      setConversationActionTarget(item)
    },
    []
  )

  const confirmRename = useCallback(() => {
    if (!renameTarget) return
    void conversationAction.rename(renameTarget.id, renameText)
    setRenameTarget(null)
  }, [renameTarget, renameText])

  const handlePickImages = useCallback(async () => {
    if (streaming) return
    if (remainingImageSlots <= 0) {
      toast(`最多选择 ${MAX_IMAGE_ATTACHMENTS} 张图片`)
      return
    }
    setAttachMenuOpen(false)
    markMediaPickerOpened()
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: remainingImageSlots,
        includeBase64: false,
        includeExtra: true,
        quality: IMAGE_PICKER_QUALITY,
        maxWidth: IMAGE_PICKER_MAX_EDGE,
        maxHeight: IMAGE_PICKER_MAX_EDGE,
        assetRepresentationMode: 'compatible',
      })
      if (response.didCancel) return
      if (response.errorMessage) {
        toast(response.errorMessage)
        return
      }
      const results = await Promise.all((response.assets || []).map(buildImageAttachment))
      const validAttachments = results
        .filter((item): item is { attachment: LX.ChatAttachment } => 'attachment' in item)
        .map((item) => item.attachment)
      const picked = validAttachments.slice(0, remainingImageSlots)
      const overLimit = Math.max(0, validAttachments.length - picked.length)
      const skipped = results.filter(
        (item): item is Exclude<BuildImageAttachmentResult, { attachment: LX.ChatAttachment }> =>
          'reason' in item
      )
      if (!picked.length) {
        const hasTooLarge = skipped.some((item) => item.reason === 'tooLarge')
        toast(
          hasTooLarge
            ? `图片压缩后仍需小于 ${formatFileSize(MAX_IMAGE_BYTES)}`
            : '图片读取失败，请换一张试试'
        )
        return
      }
      setPendingAttachments((prev) => [...prev, ...picked].slice(0, MAX_IMAGE_ATTACHMENTS))
      if (skipped.length) {
        const tooLarge = skipped.filter((item) => item.reason === 'tooLarge').length
        const unreadable = skipped.length - tooLarge
        const reasons = [
          tooLarge ? `${tooLarge} 张压缩后仍超过 ${formatFileSize(MAX_IMAGE_BYTES)}` : '',
          unreadable ? `${unreadable} 张不可读取` : '',
          overLimit ? `${overLimit} 张超过剩余名额` : '',
        ].filter(Boolean)
        toast(`已添加 ${picked.length} 张，跳过 ${skipped.length + overLimit} 张：${reasons.join('，')}`)
      } else if (overLimit) {
        toast(`已添加 ${picked.length} 张，跳过 ${overLimit} 张超过剩余名额`)
      } else if (pendingAttachments.length) {
        const nextRemaining = Math.max(0, remainingImageSlots - picked.length)
        toast(nextRemaining ? `已添加 ${picked.length} 张，还可添加 ${nextRemaining} 张` : '已添加图片，已达上限')
      }
    } catch (err: any) {
      toast(err?.message || '选择图片失败')
    } finally {
      markMediaPickerSettled()
    }
  }, [pendingAttachments.length, remainingImageSlots, streaming])

  const removePendingAttachment = useCallback((id: string) => {
    const removed = pendingAttachments.find((item) => item.id === id)
    if (removed?.uri) void deleteLocalFiles([removed.uri])
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id))
  }, [pendingAttachments])

  const clearPendingAttachments = useCallback(() => {
    if (pendingAttachments.length) {
      void deleteLocalFiles(pendingAttachments.map((item) => item.uri))
    }
    setPendingAttachments([])
  }, [pendingAttachments])

  const handleSend = useCallback(() => {
    if ((!input.trim() && !pendingAttachments.length) || streaming) return
    if (!ensureReady()) return
    const text = input.trim()
    const attachments = pendingAttachments

    const doSend = async () => {
      // 确认发送后才清空输入区，避免取消时丢失草稿
      setInput('')
      setPendingAttachments([])
      try {
        await chatAction.send(text, attachments)
        scrollToEnd()
      } catch (err: any) {
        markFailedAttachmentUris(err)
        toast(err?.message || '发送失败')
      }
    }

    // 有图时，在发送前给出能力提示，避免选了仅文本模型后才报错
    if (attachments.length) {
      const cap = inferVisionCapability(active?.model || defaultModel || '')
      if (cap === 'text') {
        Alert.alert(
          '仅文本模型',
          `当前模型「${active?.model || defaultModel}」通常不支持图片输入。建议先切换到视觉模型，或移除图片后再发送。`,
          [
            { text: '取消', style: 'cancel' },
            {
              text: '切换模型',
              onPress: () => openModelPicker('vision'),
            },
            { text: '仍然发送', style: 'destructive', onPress: () => void doSend() },
          ]
        )
        return
      }
      if (cap === 'unknown') {
        toast('当前模型图片能力未知，若不支持将返回错误提示')
      }
    }
    void doSend()
  }, [input, pendingAttachments, streaming, ensureReady, active?.model, defaultModel, scrollToEnd, markFailedAttachmentUris, openModelPicker])

  const handleStop = useCallback(() => {
    chatAction.stop()
  }, [])

  const handleSelectModel = useCallback(
    async (modelId: string) => {
      settingAction.updateSetting({ 'api.defaultModel': modelId })
      if (activeId) {
        await conversationAction.updateConversation(activeId, { model: modelId })
      }
      setModelQuery('')
      setModelPickerOpen(false)
      toast(`已切换：${modelId}`)
      if (pendingAttachments.length) {
        const cap = inferVisionCapability(modelId)
        if (cap === 'text') {
          toast('该模型通常为仅文本，当前待发送图片可能不受支持')
        } else if (cap === 'unknown') {
          toast('该模型图片能力未知，可能不支持图片输入')
        }
      }
    },
    [activeId, pendingAttachments.length]
  )

  const handleCopy = useCallback((content: string) => {
    Clipboard.setString(content)
    toast('已复制')
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (streaming) return
    if (!ensureReady()) return
    try {
      await chatAction.regenerate()
      scrollToEnd()
    } catch (err: any) {
      markFailedAttachmentUris(err)
      toast(err?.message || '重新生成失败')
    }
  }, [streaming, ensureReady, scrollToEnd, markFailedAttachmentUris])

  const handleRetry = useCallback(async () => {
    if (streaming) return
    if (!ensureReady()) return
    try {
      await chatAction.retry()
      scrollToEnd()
    } catch (err: any) {
      markFailedAttachmentUris(err)
      toast(err?.message || '重试失败')
    }
  }, [streaming, ensureReady, scrollToEnd, markFailedAttachmentUris])

  const canRegenerate = useMemo(() => {
    if (streaming || !messages.length) return false
    return chatAction.canRegenerate()
  }, [streaming, messages])

  const lastMessageId = messages.length ? messages[messages.length - 1].id : null

  // 清空入口暂隐藏（左侧只保留提示词）；需要时取消注释即可
  // const handleClear = useCallback(() => {
  //   if (!activeId) return
  //   Alert.alert('清空会话', '确定清空当前会话的所有消息？', [
  //     { text: '取消', style: 'cancel' },
  //     {
  //       text: '清空',
  //       style: 'destructive',
  //       onPress: () => {
  //         void conversationAction.clearMessages(activeId)
  //       },
  //     },
  //   ])
  // }, [activeId])

  const openEditMessage = useCallback((item: LX.ChatMessage, options?: { confirmFollowUps?: boolean }) => {
    if (item.role !== 'user' || streaming) return
    const idx = messages.findIndex((m) => m.id === item.id)
    const hasFollowUps = idx >= 0 && idx < messages.length - 1

    const startEdit = () => {
      setEditTarget({ id: item.id, content: item.content, attachments: item.attachments })
      setEditAttachments(item.attachments?.filter((a) => a.type === 'image') || [])
      setEditDraft(item.content)
    }

    if (hasFollowUps && options?.confirmFollowUps !== false) {
      Alert.alert('编辑消息', '将删除此消息之后的所有回复，并以新内容重新发送。', [
        { text: '取消', style: 'cancel' },
        { text: '继续编辑', onPress: startEdit },
      ])
    } else {
      startEdit()
    }
  }, [messages, streaming])

  const openLastUserForRetryEdit = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      toast('没有可编辑的用户消息')
      return
    }
    openEditMessage(lastUser, { confirmFollowUps: false })
  }, [messages, openEditMessage])

  const confirmEditResend = useCallback(async () => {
    if (!editTarget) return
    const target = editTarget
    const text = editDraft.trim()
    if (!text && !editAttachments.length) {
      toast('消息不能为空')
      return
    }
    if (!ensureReady()) return
    if (editAttachments.length) {
      const cap = inferVisionCapability(active?.model || defaultModel || '')
      if (cap === 'text') {
        Alert.alert(
          '仅文本模型',
          `当前模型「${active?.model || defaultModel || ''}」通常不支持图片，发送后可能报错。仍要发送吗？`,
          [
            { text: '取消', style: 'cancel' },
            {
              text: '仍然发送',
              style: 'destructive',
              onPress: () => void doEditResend(),
            },
          ]
        )
        return
      }
      if (cap === 'unknown') {
        toast('当前模型图片能力未知，若不支持将返回错误提示')
      }
    }
    void doEditResend()

    async function doEditResend() {
      setEditTarget(null)
      try {
        await chatAction.resendFrom(target.id, text, editAttachments)
        scrollToEnd()
      } catch (err: any) {
        markFailedAttachmentUris(err)
        toast(err?.message || '重新发送失败')
      }
    }
  }, [editTarget, editDraft, editAttachments, ensureReady, active?.model, defaultModel, scrollToEnd, markFailedAttachmentUris])

  /** 编辑弹窗内移除某张原图附件 */
  const removeEditAttachment = useCallback((id: string) => {
    setEditAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  /** 点击消息图片：全屏预览 */
  const openImagePreview = useCallback((attachment: LX.ChatAttachment) => {
    setPreviewImage(attachment)
  }, [])

  /** 长按消息图片：复制 / 删除图片 */
  const handleImageLongPress = useCallback(
    (item: LX.ChatMessage, attachment: LX.ChatAttachment) => {
      if (streaming) return
      setImageActionTarget({ message: item, attachment })
    },
    [streaming]
  )

  const openPromptModal = useCallback(async () => {
    let conv = active
    if (!conv) {
      conv = await conversationAction.createConversation()
    }
    setPromptDraft(conv.systemPrompt ?? globalSystemPrompt ?? '')
    setPromptModalOpen(true)
  }, [active, globalSystemPrompt])

  const savePrompt = useCallback(async () => {
    if (!activeId) {
      setPromptModalOpen(false)
      return
    }
    const trimmed = promptDraft.trim()
    await conversationAction.updateConversation(activeId, {
      systemPrompt: trimmed || undefined,
    })
    setPromptModalOpen(false)
    toast(trimmed ? '已保存本会话提示词' : '已恢复为全局默认提示词')
  }, [activeId, promptDraft])

  const clearPromptOverride = useCallback(async () => {
    if (!activeId) return
    await conversationAction.updateConversation(activeId, { systemPrompt: undefined })
    setPromptDraft(globalSystemPrompt ?? '')
    toast('已清除会话提示词，使用全局默认')
  }, [activeId, globalSystemPrompt])

  const handleExport = useCallback(async () => {
    if (!messages.length) {
      toast('当前会话没有消息可导出')
      return
    }
    const text = formatConversationText(
      active?.title || '会话',
      active?.model || defaultModel || undefined,
      messages
    )
    Alert.alert('导出会话', '选择导出方式', [
      { text: '取消', style: 'cancel' },
      {
        text: '复制全文',
        onPress: () => {
          Clipboard.setString(text)
          toast('已复制到剪贴板')
        },
      },
      {
        text: '系统分享',
        onPress: () => {
          void Share.share({
            message: text,
            title: active?.title || 'IKUN Chat 会话',
          }).catch(() => {
            toast('分享取消或失败')
          })
        },
      },
    ])
  }, [messages, active, defaultModel])

  const handleMessageLongPress = useCallback(
    (item: LX.ChatMessage) => {
      if (streaming) return
      const isLast = item.id === lastMessageId
      const hasMenuAction =
        !!item.content ||
        item.role === 'user' ||
        (canRegenerate && isLast && (item.role === 'assistant' || item.role === 'error'))
      if (hasMenuAction) setMessageActionTarget(item)
    },
    [streaming, lastMessageId, canRegenerate]
  )

  const renderMessage = useCallback(
    ({ item }: { item: LX.ChatMessage }) => {
      const isUser = item.role === 'user'
      const isError = item.role === 'error'
      const isLast = item.id === lastMessageId
      const isStreamingThis = streaming && item.id === streamingMessageId
      const messageStatus: LX.ChatMessageStatus | undefined = isStreamingThis
        ? 'streaming'
        : isError
          ? 'failed'
          : item.status
      // 导出会话：挂在最后一条消息下方，不与输入区提示词挤在一起
      const showExport = isLast && !streaming && messages.length > 0
      const showFailureActions =
        !streaming && isLast && messageStatus === 'failed' && canRegenerate
      const showActions =
        messageStatus === 'streaming' ||
        (!streaming &&
        (item.content ||
          isUser ||
          messageStatus === 'stopped' ||
          showFailureActions ||
          (isLast && item.role === 'assistant' && messageStatus !== 'failed' && canRegenerate) ||
          showExport))

      const bubbleBg = isError
        ? colors.error
        : isUser
          ? colors.userBubble
          : colors.assistantBubble
      const textColor = isUser || isError ? colors.textInverse : colors.text
      const imageAttachments = item.attachments?.filter((attachment) => attachment.type === 'image') || []
      const renderBrokenImage = (label = '图片已失效') => (
        <View style={styles.imageBrokenBox}>
          <Icon name="warning" size={18} color="rgba(255,255,255,0.86)" />
          <Text style={styles.imageBrokenText}>{label}</Text>
        </View>
      )
      const renderActionPill = (
        key: string,
        icon: AppIconName,
        label: string,
        onPress: () => void,
        options?: {
          inverse?: boolean
          muted?: boolean
          disabled?: boolean
          accessibilityLabel?: string
        }
      ) => {
        const actionColor = options?.inverse
          ? textColor
          : options?.muted || options?.disabled
            ? colors.textSecondary
            : colors.primary
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.messageActionPill,
              options?.inverse
                ? styles.messageActionPillInverse
                : { backgroundColor: colors.surface, borderColor: colors.border },
              options?.disabled ? styles.disabledAction : null,
            ]}
            onPress={onPress}
            disabled={options?.disabled}
            accessibilityLabel={options?.accessibilityLabel || label}
            accessibilityRole="button"
            accessibilityState={options?.disabled ? { disabled: true } : undefined}
          >
            <Icon name={icon} size={14} color={actionColor} />
            <Text style={[styles.messageActionText, { color: actionColor }]}>{label}</Text>
          </TouchableOpacity>
        )
      }
      const renderStatePill = (
        key: string,
        icon: AppIconName,
        label: string,
        tone: 'active' | 'danger' | 'muted' = 'muted'
      ) => {
        const stateColor =
          tone === 'active'
            ? colors.primary
            : tone === 'danger'
              ? colors.error
              : colors.textSecondary
        return (
          <View
            key={key}
            style={[
              styles.messageActionPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityLabel={label}
          >
            <Icon name={icon} size={14} color={stateColor} />
            <Text style={[styles.messageActionText, { color: stateColor }]}>{label}</Text>
          </View>
        )
      }
      const statusPill =
        messageStatus === 'streaming' && stopping
          ? renderStatePill('status-stopping', 'stop', '停止中')
          : messageStatus === 'streaming'
          ? renderStatePill('status-streaming', 'thinking', '生成中', 'active')
          : messageStatus === 'stopped'
            ? renderStatePill('status-stopped', 'stop', '已停止')
            : messageStatus === 'failed'
              ? renderStatePill('status-failed', 'warning', '生成失败', 'danger')
              : null

      return (
        <View
          style={[styles.bubbleWrap, isUser ? styles.bubbleRight : styles.bubbleLeft]}
        >
          <Pressable onLongPress={() => handleMessageLongPress(item)}>
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor: bubbleBg,
                  borderColor: colors.border,
                  borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              {!item.content && !imageAttachments.length ? (
                isStreamingThis ? (
                  <ThinkingIndicator color={textColor} size={Math.max(16, fontSize)} />
                ) : null
              ) : isUser ? (
                <View>
                  {imageAttachments.length ? (
                    <View style={styles.messageImageGrid}>
                      {imageAttachments.map((attachment) => (
                        <Pressable
                          key={attachment.id}
                          style={styles.messageImageTile}
                          onPress={() => openImagePreview(attachment)}
                          onLongPress={() => handleImageLongPress(item, attachment)}
                          accessibilityRole="imagebutton"
                          accessibilityLabel={attachment.name || '图片'}
                          accessibilityHint="点击查看大图，长按复制或删除"
                        >
                          {isImageBroken(attachment) ? (
                            renderBrokenImage()
                          ) : (
                            <Image
                              source={{ uri: attachment.uri }}
                              style={styles.messageImage}
                              resizeMode="cover"
                              onError={() => markImageBroken(attachment.uri)}
                            />
                          )}
                          {attachment.name ? (
                            <Text
                              style={[styles.messageImageName, { color: textColor }]}
                              numberOfLines={1}
                            >
                              {attachment.name}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {item.content ? (
                    <Text
                      style={[
                        {
                          color: textColor,
                          fontSize: fontSize,
                          lineHeight: fontSize * 1.5,
                        },
                        imageAttachments.length ? styles.messageTextAfterImage : null,
                      ]}
                      selectable
                    >
                      {item.content}
                    </Text>
                  ) : null}
                </View>
              ) : isError ? (
                <View>
                  <View style={styles.errorTitleRow}>
                    <Icon name="warning" size={16} color={textColor} />
                    <Text
                      style={{
                        color: textColor,
                        fontSize: Math.max(13, fontSize - 1),
                        fontWeight: '700',
                        marginLeft: 6,
                      }}
                    >
                      生成失败
                    </Text>
                  </View>
                  {item.content ? (
                    <Text
                      style={{
                        color: textColor,
                        fontSize: fontSize,
                        lineHeight: fontSize * 1.5,
                        marginTop: 6,
                        opacity: 0.95,
                      }}
                      selectable
                    >
                      {item.content}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <MarkdownContent
                  key={`md-${item.id}`}
                  content={item.content}
                  fontSize={fontSize}
                  textColor={textColor}
                />
              )}
            </View>
          </Pressable>

          {showActions ? (
            <View style={[styles.msgActions, isUser && styles.msgActionsRight]}>
              {statusPill}
              {messageStatus === 'streaming'
                ? renderActionPill('stop', 'stop', stopping ? '停止中' : '停止', handleStop, {
                    disabled: stopping,
                    accessibilityLabel: stopping ? '正在停止生成' : '停止生成',
                  })
                : null}
              {messageStatus !== 'streaming' && item.content
                ? renderActionPill('copy', 'copy', '复制', () => handleCopy(item.content), {
                    muted: true,
                  })
                : null}
              {messageStatus !== 'streaming' && isUser
                ? renderActionPill('edit', 'edit', '编辑', () => openEditMessage(item), {
                    accessibilityLabel: '编辑并重发',
                  })
                : null}
              {showFailureActions
                ? renderActionPill('retry', 'retry', '重试', () => void handleRetry())
                : null}
              {showFailureActions
                ? renderActionPill('edit-retry', 'edit', '编辑后重试', openLastUserForRetryEdit, {
                    accessibilityLabel: '编辑上一条用户消息后重试',
                  })
                : null}
              {messageStatus !== 'streaming' &&
              isLast &&
              item.role === 'assistant' &&
              messageStatus !== 'failed' &&
              canRegenerate
                ? renderActionPill('regenerate', 'refresh', '重新生成', () => void handleRegenerate())
                : null}
              {messageStatus !== 'streaming' && showExport
                ? renderActionPill('export', 'export', '导出', () => void handleExport(), {
                    muted: true,
                    accessibilityLabel: '导出/分享会话',
                  })
                : null}
            </View>
          ) : null}
        </View>
      )
    },
    [
      colors,
      fontSize,
      handleCopy,
      handleExport,
      handleMessageLongPress,
      handleRegenerate,
      handleRetry,
      handleStop,
      openLastUserForRetryEdit,
      openEditMessage,
      openImagePreview,
      handleImageLongPress,
      isImageBroken,
      markImageBroken,
      streaming,
      stopping,
      streamingMessageId,
      lastMessageId,
      canRegenerate,
      messages.length,
    ]
  )

  const canSend = !!input.trim() || pendingAttachments.length > 0
  const sendButtonBg = !canSend
    ? colors.surfaceSecondary
    : isPendingImageTextOnly
      ? colors.error
      : colors.primary
  const messageActionIsLast = messageActionTarget?.id === lastMessageId
  const messageActionStatus: LX.ChatMessageStatus | undefined = messageActionTarget
    ? messageActionTarget.role === 'error'
      ? 'failed'
      : messageActionTarget.status
    : undefined
  const messageActionFailed = messageActionStatus === 'failed'
  const messageActionCanRegenerate =
    !streaming && !!messageActionTarget && messageActionIsLast && canRegenerate
  const messageActionTitle =
    messageActionTarget?.role === 'user'
      ? '用户消息'
      : messageActionFailed
        ? '失败消息'
        : '助手消息'
  const imageActionCanDelete = imageActionTarget?.message.role === 'user' && !!activeId
  const imageActionTitle = imageActionTarget?.attachment.name || '图片'
  const renderMenuAction = (
    key: string,
    icon: AppIconName,
    label: string,
    description: string,
    onPress: () => void,
    accessibilityLabel?: string,
    options?: { danger?: boolean }
  ) => {
    const actionColor = options?.danger ? colors.error : colors.textSecondary
    const labelColor = options?.danger ? colors.error : colors.text
    return (
      <TouchableOpacity
        key={key}
        style={styles.menuRow}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
      >
        <Icon name={icon} size={20} color={actionColor} />
        <View style={styles.menuRowText}>
          <Text style={{ color: labelColor, fontSize: 16, fontWeight: '600' }}>
            {label}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {description}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <IconButton
          name="menu"
          accessibilityLabel="菜单"
          color={colors.primary}
          size={24}
          style={styles.headerBtn}
          onPress={() => setDrawerOpen(true)}
        />
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => openModelPicker()}
          accessibilityLabel="选择模型"
          accessibilityRole="button"
          accessibilityState={{ expanded: modelPickerOpen }}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {active?.title || 'IKUN Chat'}
          </Text>
          <View style={styles.headerSubRow}>
            <Icon name="model" size={12} color={colors.textSecondary} />
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {currentModel}
              {hasConvPrompt ? ' · 提示词' : ''}
            </Text>
            <Icon name="chevron-down" size={12} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <IconButton
          name="settings"
          accessibilityLabel="设置"
          color={colors.primary}
          size={24}
          style={styles.headerBtn}
          onPress={() => void navigations.pushSettingScreen(componentId)}
        />
      </View>

      {needSetup ? (
        <View style={styles.banner}>
          <Icon name="warning" size={16} color="#92400E" />
          <Text style={[styles.bannerText, { marginLeft: 8 }]}>
            尚未配置中转站，请先填写 API URL 与 API Key
          </Text>
          <TouchableOpacity
            style={styles.bannerActionRow}
            onPress={() => void navigations.pushSettingScreen(componentId)}
            accessibilityLabel="去设置"
            accessibilityRole="button"
          >
            <Icon name="settings" size={14} color="#B45309" />
            <Text style={styles.bannerAction}>去设置</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={Array.isArray(messages) ? messages : []}
        keyExtractor={(item, index) => item?.id || `msg_${index}`}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => {
          // 流式中减少滚动动画，降低卡顿/闪退风险
          listRef.current?.scrollToEnd({ animated: !streaming })
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>开始对话</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              配置中转站后即可聊天。支持 Markdown、编辑重发、重新生成与错误重试。
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {pendingAttachments.length ? (
          <View
            style={[
              styles.pendingPanel,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
            ]}
          >
            <View style={styles.pendingHeader}>
              <Text style={[styles.pendingTitle, { color: colors.textSecondary }]}>
                待发送图片 {pendingAttachments.length}/{MAX_IMAGE_ATTACHMENTS} ·{' '}
                {remainingImageSlotsLabel}
              </Text>
              <IconButton
                name="close"
                accessibilityLabel="清空待发送图片"
                color={colors.textSecondary}
                size={16}
                onPress={clearPendingAttachments}
              />
            </View>
            <View style={styles.pendingGrid}>
              {pendingAttachments.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  style={styles.pendingItem}
                  onPress={() => openImagePreview(attachment)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={attachment.name || '待发送图片'}
                  accessibilityHint="点击查看大图"
                >
                  {isImageBroken(attachment) ? (
                    <View style={styles.pendingBrokenBox}>
                      <Icon name="warning" size={16} color="#fff" />
                      <Text style={styles.pendingBrokenText}>已失效</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: attachment.uri }}
                      style={styles.pendingImage}
                      resizeMode="cover"
                      onError={() => markImageBroken(attachment.uri)}
                    />
                  )}
                  <IconButton
                    name="close"
                    accessibilityLabel={`移除${attachment.name || '图片'}`}
                    color="#fff"
                    size={14}
                    hitSlop={6}
                    style={styles.pendingRemove}
                    onPress={() => removePendingAttachment(attachment.id)}
                  />
                </Pressable>
              ))}
            </View>
            <View style={styles.pendingCapabilityRow}>
              <Text
                style={[
                  styles.pendingHint,
                  { color: isPendingImageTextOnly ? colors.error : colors.textSecondary },
                ]}
              >
                {currentVision === 'vision'
                  ? `已选图片 · ${visionCapabilityLabel(currentVision)}模型（${currentModel}）支持图片输入`
                  : currentVision === 'text'
                    ? `已选图片 · 当前模型「${currentModel}」为仅文本，建议切换视觉模型`
                    : `已选图片 · 模型「${currentModel}」图片能力未知，发送时可能提示不支持`}
              </Text>
              {isPendingImageTextOnly ? (
                <TouchableOpacity
                  style={[styles.pendingCapabilityAction, { borderColor: colors.error }]}
                  onPress={() => openModelPicker('vision')}
                  accessibilityLabel="切换视觉模型"
                  accessibilityRole="button"
                >
                  <Icon name="model" size={13} color={colors.error} />
                  <Text style={[styles.pendingCapabilityActionText, { color: colors.error }]}>
                    切换模型
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <IconButton
            name="add"
            accessibilityLabel="更多"
            color={hasConvPrompt ? colors.primary : colors.textSecondary}
            size={22}
            disabled={streaming}
            onPress={() => setAttachMenuOpen(true)}
          />
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
                fontSize,
              },
            ]}
            placeholder="输入消息…"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={20000}
            editable={!streaming}
            accessibilityLabel="消息输入框"
          />
          {streaming ? (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: stopping ? colors.surfaceSecondary : colors.error },
                stopping ? styles.disabledAction : null,
              ]}
              onPress={handleStop}
              disabled={stopping}
              accessibilityLabel={stopping ? '正在停止生成' : '停止生成'}
              accessibilityRole="button"
              accessibilityState={{ disabled: stopping }}
            >
              <Icon name="stop" size={18} color={stopping ? colors.textSecondary : '#fff'} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: sendButtonBg },
              ]}
              onPress={() => void handleSend()}
              disabled={!canSend}
              accessibilityLabel={isPendingImageTextOnly ? '发送，当前模型可能不支持图片' : '发送'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
            >
              <Icon name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      <AppModal
        visible={!!messageActionTarget}
        title={messageActionTitle}
        placement="bottom"
        animationType="fade"
        onClose={() => setMessageActionTarget(null)}
      >
        {messageActionTarget ? (
          <>
            {messageActionTarget.content
              ? renderMenuAction(
                  'copy',
                  'copy',
                  '复制',
                  '复制这条消息内容',
                  () => {
                    const item = messageActionTarget
                    setMessageActionTarget(null)
                    handleCopy(item.content)
                  },
                  '复制消息'
                )
              : null}
            {messageActionTarget.role === 'user'
              ? renderMenuAction(
                  'edit',
                  'edit',
                  '编辑并重发',
                  '修改这条消息，并重新请求后续回复',
                  () => {
                    const item = messageActionTarget
                    setMessageActionTarget(null)
                    openEditMessage(item)
                  },
                  '编辑并重发消息'
                )
              : null}
            {messageActionCanRegenerate && messageActionFailed
              ? renderMenuAction(
                  'retry',
                  'retry',
                  '重试',
                  '使用上一条用户消息重新请求',
                  () => {
                    setMessageActionTarget(null)
                    void handleRetry()
                  },
                  '重试生成'
                )
              : null}
            {messageActionCanRegenerate && messageActionFailed
              ? renderMenuAction(
                  'edit-retry',
                  'edit',
                  '编辑后重试',
                  '先调整上一条用户消息，再重新生成',
                  () => {
                    setMessageActionTarget(null)
                    openLastUserForRetryEdit()
                  },
                  '编辑上一条用户消息后重试'
                )
              : null}
            {messageActionCanRegenerate &&
            messageActionTarget.role === 'assistant' &&
            !messageActionFailed
              ? renderMenuAction(
                  'regenerate',
                  'refresh',
                  '重新生成',
                  '基于上一条用户消息再次请求回复',
                  () => {
                    setMessageActionTarget(null)
                    void handleRegenerate()
                  },
                  '重新生成助手回复'
                )
              : null}
          </>
        ) : null}
      </AppModal>

      <AppModal
        visible={!!imageActionTarget}
        title={imageActionTitle}
        placement="bottom"
        animationType="fade"
        onClose={() => setImageActionTarget(null)}
      >
        {imageActionTarget ? (
          <>
            {renderMenuAction(
              'copy-image',
              'copy',
              '复制图片',
              '复制这张图片到剪贴板',
              () => {
                const { attachment } = imageActionTarget
                setImageActionTarget(null)
                void copyImageToClipboard(attachment.uri)
                  .then(() => toast('图片已复制到剪贴板'))
                  .catch((err: any) => toast(err?.message || '复制图片失败'))
              }
            )}
            {renderMenuAction(
              'preview-image',
              'image',
              '查看大图',
              '打开图片预览',
              () => {
                const { attachment } = imageActionTarget
                setImageActionTarget(null)
                openImagePreview(attachment)
              }
            )}
            {imageActionCanDelete
              ? renderMenuAction(
                  'delete-image',
                  'trash',
                  '删除图片',
                  '从这条用户消息中移除图片',
                  () => {
                    if (!activeId) return
                    const { message, attachment } = imageActionTarget
                    setImageActionTarget(null)
                    void conversationAction
                      .removeAttachment(activeId, message.id, attachment.id)
                      .then(() => toast('已删除图片'))
                      .catch((err: any) => toast(err?.message || '删除图片失败'))
                  },
                  '删除图片',
                  { danger: true }
                )
              : null}
          </>
        ) : null}
      </AppModal>

      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDrawerOpen(false)}
      >
        <Pressable style={styles.modalMask} onPress={() => setDrawerOpen(false)}>
          <Pressable
            style={[styles.drawer, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>会话</Text>
              <IconButton
                name="close"
                accessibilityLabel="关闭"
                color={colors.textSecondary}
                size={22}
                onPress={() => setDrawerOpen(false)}
              />
            </View>
            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
              onPress={() => void handleNewChat()}
              accessibilityLabel="新对话"
              accessibilityRole="button"
            >
              <Icon name="add" size={20} color="#fff" />
              <Text style={styles.newChatText}>新对话</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.drawerSearch,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
              <Icon name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.drawerSearchInput, { color: colors.text }]}
                value={conversationQuery}
                onChangeText={setConversationQuery}
                placeholder="搜索会话、模型或提示词…"
                placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
                accessibilityLabel="搜索会话"
              />
              {conversationQuery ? (
                <IconButton
                  name="close"
                  accessibilityLabel="清空搜索"
                  color={colors.textSecondary}
                  size={16}
                  hitSlop={8}
                  onPress={() => setConversationQuery('')}
                />
              ) : null}
            </View>
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.convItem,
                    item.id === activeId && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => void handleSelectChat(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`切换到会话 ${item.title}`}
                  accessibilityState={{ selected: item.id === activeId }}
                  onLongPress={() => showConversationActions(item)}
                >
                  <View style={styles.convTitleRow}>
                    <Text style={[styles.convTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.pinned ? <Icon name="pin" size={13} color={colors.primary} /> : null}
                    <Text style={[styles.convTime, { color: colors.textSecondary }]}>
                      {formatConversationTime(item.updatedAt)}
                    </Text>
                    <IconButton
                      name="more"
                      accessibilityLabel={`打开会话 ${item.title} 操作菜单`}
                      color={colors.textSecondary}
                      size={16}
                      hitSlop={8}
                      style={styles.convActionButton}
                      onPress={(event) => {
                        event.stopPropagation()
                        showConversationActions(item)
                      }}
                    />
                  </View>
                  <View style={styles.convMetaRow}>
                    <Icon name="model" size={12} color={colors.textSecondary} />
                    <Text
                      style={[styles.convMetaText, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.model || '默认模型'}
                      {item.systemPrompt?.trim() ? ' · 自定义提示词' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 12 }}>
                  {conversationQuery ? '未找到匹配会话' : '暂无会话'}
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      <AppModal
        visible={!!conversationActionTarget}
        title={conversationActionTarget?.title || '会话操作'}
        placement="bottom"
        animationType="fade"
        onClose={() => setConversationActionTarget(null)}
      >
        {conversationActionTarget ? (
          <>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                const item = conversationActionTarget
                setConversationActionTarget(null)
                void handleTogglePinChat(item.id, item.pinned)
              }}
              accessibilityLabel={conversationActionTarget.pinned ? '取消置顶会话' : '置顶会话'}
              accessibilityRole="button"
            >
              <Icon name="pin" size={20} color={colors.textSecondary} />
              <View style={styles.menuRowText}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  {conversationActionTarget.pinned ? '取消置顶' : '置顶'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {conversationActionTarget.pinned ? '恢复按更新时间排序' : '固定在会话列表顶部'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                const item = conversationActionTarget
                setConversationActionTarget(null)
                handleRenameChat(item.id, item.title)
              }}
              accessibilityLabel="重命名会话"
              accessibilityRole="button"
            >
              <Icon name="edit" size={20} color={colors.textSecondary} />
              <View style={styles.menuRowText}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  重命名
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  修改会话标题
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                const item = conversationActionTarget
                setConversationActionTarget(null)
                handleDeleteChat(item.id, item.title)
              }}
              accessibilityLabel="删除会话"
              accessibilityRole="button"
            >
              <Icon name="trash" size={20} color={colors.error} />
              <View style={styles.menuRowText}>
                <Text style={{ color: colors.error, fontSize: 16, fontWeight: '600' }}>
                  删除
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  删除本会话及本地消息记录
                </Text>
              </View>
            </TouchableOpacity>
          </>
        ) : null}
      </AppModal>

      <AppModal
        visible={modelPickerOpen}
        title="选择模型"
        placement="bottom"
        onClose={() => setModelPickerOpen(false)}
      >
        <View
          style={[
            styles.drawerSearch,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
        >
          <Icon name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.drawerSearchInput, { color: colors.text }]}
            value={modelQuery}
            onChangeText={setModelQuery}
            placeholder="搜索模型…"
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            accessibilityLabel="搜索模型"
          />
          {modelQuery ? (
            <IconButton
              name="close"
              accessibilityLabel="清空模型搜索"
              color={colors.textSecondary}
              size={16}
              hitSlop={8}
              onPress={() => setModelQuery('')}
            />
          ) : null}
        </View>
        <View style={styles.modelFilterRow}>
          {MODEL_CAPABILITY_FILTERS.map((filter) => {
            const selected = modelCapabilityFilter === filter.key
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.modelFilterChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setModelCapabilityFilter(filter.key)}
                accessibilityRole="button"
                accessibilityLabel={`筛选${filter.label}模型`}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.modelFilterText,
                    { color: selected ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {filter.label} {modelCapabilityCounts[filter.key]}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <FlatList
          data={filteredModels}
          keyExtractor={(item) => item.id}
          style={styles.modelList}
          contentContainerStyle={styles.modelListContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.id === currentModel
            const cap = getModelVisionCapability(item)
            const query = modelQuery.trim()
            const matchIndex = query
              ? item.id.toLowerCase().indexOf(query.toLowerCase())
              : -1
            return (
              <TouchableOpacity
                style={[
                  styles.modelItem,
                  selected && { backgroundColor: colors.surfaceSecondary },
                ]}
                onPress={() => void handleSelectModel(item.id)}
                accessibilityLabel={
                  selected ? `已选 ${item.id}（${visionCapabilityLabel(cap)}）` : `${item.id}（${visionCapabilityLabel(cap)}）`
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Icon
                  name="model"
                  size={18}
                  color={selected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={{
                    color: colors.text,
                    flex: 1,
                    marginLeft: 10,
                    fontWeight: selected ? '700' : '400',
                  }}
                  numberOfLines={1}
                >
                  {matchIndex >= 0 ? (
                    <>
                      {item.id.slice(0, matchIndex)}
                      <Text style={{ color: colors.primary, fontWeight: '800' }}>
                        {item.id.slice(matchIndex, matchIndex + query.length)}
                      </Text>
                      {item.id.slice(matchIndex + query.length)}
                    </>
                  ) : (
                    item.id
                  )}
                </Text>
                <Text
                  style={{
                    color:
                      cap === 'vision'
                        ? colors.success
                        : cap === 'text'
                          ? colors.textSecondary
                          : '#B45309',
                    fontSize: 11,
                    marginRight: 8,
                  }}
                >
                  {visionCapabilityLabel(cap)}
                </Text>
                {selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, padding: 12 }}>
              {modelQuery || modelCapabilityFilter !== 'all'
                ? '未找到匹配模型'
                : '暂无模型，请先在设置中测试连接并刷新模型'}
            </Text>
          }
        />
      </AppModal>

      {/* 输入区「+」菜单：次要能力（图标+文字） */}
      <AppModal
        visible={attachMenuOpen}
        title="更多"
        placement="bottom"
        animationType="fade"
        onClose={() => setAttachMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => void handlePickImages()}
          disabled={streaming || remainingImageSlots <= 0}
          accessibilityLabel="上传图片"
          accessibilityRole="button"
          accessibilityState={{ disabled: streaming || remainingImageSlots <= 0 }}
        >
          <Icon name="image" size={20} color={colors.textSecondary} />
          <View style={styles.menuRowText}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              上传图片
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {remainingImageSlots > 0
                ? `${remainingImageSlotsLabel} · 自动压缩至最长边 ${IMAGE_PICKER_MAX_EDGE}px，压缩后 ≤ ${formatFileSize(MAX_IMAGE_BYTES)}`
                : `已达 ${MAX_IMAGE_ATTACHMENTS} 张上限，可先移除一张`}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => {
            setAttachMenuOpen(false)
            void openPromptModal()
          }}
          accessibilityLabel="会话提示词"
          accessibilityRole="button"
          accessibilityState={{ selected: hasConvPrompt }}
        >
          <Icon
            name="prompt"
            size={20}
            color={hasConvPrompt ? colors.primary : colors.textSecondary}
          />
          <View style={styles.menuRowText}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              会话提示词
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {hasConvPrompt ? '已设置本会话覆盖' : '使用全局默认，可在此覆盖'}
            </Text>
          </View>
        </TouchableOpacity>
      </AppModal>

      <AppModal
        visible={!!renameTarget}
        title="重命名会话"
        onClose={() => setRenameTarget(null)}
      >
        <FormField
          value={renameText}
          onChange={setRenameText}
          autoFocus
          accessibilityLabel="会话名称"
          containerStyle={styles.modalField}
        />
        <View style={styles.modalActions}>
          <ActionButton
            title="取消"
            variant="ghost"
            compact
            onPress={() => setRenameTarget(null)}
            accessibilityLabel="取消重命名"
          />
          <ActionButton
            title="保存"
            compact
            onPress={confirmRename}
            accessibilityLabel="保存会话名称"
          />
        </View>
      </AppModal>

      {/* 本会话系统提示词 */}
      <AppModal
        visible={promptModalOpen}
        title="本会话系统提示词"
        description="仅作用于当前会话；留空保存则使用设置里的全局默认。"
        onClose={() => setPromptModalOpen(false)}
        contentStyle={styles.promptModalSurface}
        bodyStyle={styles.promptModalBody}
      >
        <FormField
          value={promptDraft}
          onChange={setPromptDraft}
          multiline
          scrollEnabled
          placeholder="输入 system prompt…"
          accessibilityLabel="本会话系统提示词"
          containerStyle={styles.promptModalField}
          inputContainerStyle={styles.promptModalFieldBox}
          inputStyle={{ fontSize }}
        />
        <View style={styles.promptActions}>
          <ActionButton
            title="使用全局默认"
            variant="ghost"
            compact
            style={styles.promptDefaultAction}
            onPress={() => void clearPromptOverride()}
            accessibilityLabel="使用全局默认提示词"
          />
          <View style={styles.promptConfirmActions}>
            <ActionButton
              title="取消"
              variant="ghost"
              compact
              onPress={() => setPromptModalOpen(false)}
              accessibilityLabel="取消编辑提示词"
            />
            <ActionButton
              title="确认"
              compact
              onPress={() => void savePrompt()}
              accessibilityLabel="确认保存提示词"
            />
          </View>
        </View>
      </AppModal>

      <AppModal
        visible={!!editTarget}
        title="编辑并重发"
        description="保存后将删除该消息之后的回复，并以新内容重新请求。"
        onClose={() => setEditTarget(null)}
        contentStyle={styles.largeModal}
      >
        <FormField
          value={editDraft}
          onChange={setEditDraft}
          multiline
          autoFocus
          placeholder="输入消息…"
          accessibilityLabel="编辑消息内容"
          inputContainerStyle={styles.promptFieldBox}
          inputStyle={{ fontSize }}
        />
        {editAttachments.length ? (
          <View style={styles.editAttachmentsBlock}>
            <Text style={[styles.editAttachmentsTitle, { color: colors.textSecondary }]}>
              原消息图片（将随重发上传，可移除）
            </Text>
            <View style={styles.pendingGrid}>
              {editAttachments.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  style={styles.pendingItem}
                  onPress={() => openImagePreview(attachment)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={attachment.name || '原图图片'}
                  accessibilityHint="点击查看大图"
                >
                  {isImageBroken(attachment) ? (
                    <View style={styles.pendingBrokenBox}>
                      <Icon name="warning" size={16} color="#fff" />
                      <Text style={styles.pendingBrokenText}>已失效</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: attachment.uri }}
                      style={styles.pendingImage}
                      resizeMode="cover"
                      onError={() => markImageBroken(attachment.uri)}
                    />
                  )}
                  <IconButton
                    name="close"
                    accessibilityLabel={`移除原图${attachment.name || ''}`}
                    color="#fff"
                    size={14}
                    hitSlop={6}
                    style={styles.pendingRemove}
                    onPress={() => removeEditAttachment(attachment.id)}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.modalActions}>
          <ActionButton
            title="取消"
            variant="ghost"
            compact
            onPress={() => setEditTarget(null)}
            accessibilityLabel="取消编辑消息"
          />
          <ActionButton
            title="发送"
            compact
            onPress={() => void confirmEditResend()}
            accessibilityLabel="发送编辑后的消息"
          />
        </View>
      </AppModal>

      {/* 图片大图预览（全屏） */}
      <Modal
        visible={!!previewImage}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.previewRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewImage(null)}
            accessibilityLabel="关闭预览"
          />
          {previewImage ? (
            <>
              {isImageBroken(previewImage) ? (
                <View style={styles.previewBrokenBox}>
                  <Icon name="warning" size={28} color="#fff" />
                  <Text style={styles.previewBrokenTitle}>图片已失效</Text>
                  <Text style={styles.previewBrokenDesc}>缓存文件可能已被系统清理，请重新选择图片。</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: previewImage.uri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                  onError={() => markImageBroken(previewImage.uri)}
                />
              )}
              <View style={styles.previewTopBar}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {previewImage.name || '图片预览'}
                </Text>
                <IconButton
                  name="copy"
                  accessibilityLabel="复制图片"
                  color="#fff"
                  size={22}
                  onPress={() => {
                    void copyImageToClipboard(previewImage.uri)
                      .then(() => toast('图片已复制到剪贴板'))
                      .catch((err: any) => toast(err?.message || '复制图片失败'))
                  }}
                />
                <IconButton
                  name="close"
                  accessibilityLabel="关闭预览"
                  color="#fff"
                  size={24}
                  onPress={() => setPreviewImage(null)}
                />
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  )
}

Home.options = {
  topBar: { visible: false },
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 10,
  },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    maxWidth: '100%',
  },
  headerSub: { fontSize: 12, flexShrink: 1 },
  banner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: { color: '#92400E', flex: 1, fontSize: 13 },
  bannerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  bannerAction: { color: '#B45309', fontWeight: '700' },
  listContent: { padding: 12, paddingBottom: 24, flexGrow: 1 },
  bubbleWrap: { marginVertical: 4, maxWidth: '88%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  errorTitleRow: { flexDirection: 'row', alignItems: 'center' },
  msgActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  msgActionsRight: { justifyContent: 'flex-end' },
  messageActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  messageActionPillInverse: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.45)',
  },
  disabledAction: {
    opacity: 0.58,
  },
  messageActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  messageImageGrid: {
    gap: 8,
  },
  messageImageTile: {
    width: 190,
    maxWidth: '100%',
  },
  messageImage: {
    width: '100%',
    height: 132,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  imageBrokenBox: {
    width: '100%',
    height: 132,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageBrokenText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  messageImageName: {
    marginTop: 4,
    fontSize: 11,
    opacity: 0.82,
  },
  messageTextAfterImage: { marginTop: 8 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  pendingPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pendingTitle: { fontSize: 12, fontWeight: '700' },
  pendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingCapabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pendingHint: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  pendingCapabilityAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingCapabilityActionText: { fontSize: 11, fontWeight: '700' },
  pendingItem: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  pendingImage: { width: '100%', height: '100%' },
  pendingBrokenBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  pendingBrokenText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pendingRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    borderRadius: 12,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row' },
  drawer: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    paddingTop: 48,
    paddingHorizontal: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderTitle: { fontSize: 18, fontWeight: '700', flex: 1, paddingRight: 8 },
  newChatBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  newChatText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  drawerSearch: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerSearchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  modelFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  modelFilterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modelFilterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  convItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  convTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  convTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  convTime: { fontSize: 11 },
  convActionButton: {
    marginRight: -4,
  },
  convMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  convMetaText: { flex: 1, fontSize: 12 },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  modelList: {
    maxHeight: 360,
  },
  modelListContent: {
    paddingBottom: 36,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
  },
  menuRowText: { flex: 1 },
  modalField: { marginBottom: 12 },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  largeModal: { maxHeight: '82%' },
  promptModalSurface: {
    maxHeight: '88%',
  },
  promptModalBody: {
    flexShrink: 1,
  },
  promptModalField: {
    marginBottom: 10,
    flexShrink: 1,
  },
  promptModalFieldBox: {
    height: 160,
    maxHeight: 160,
    alignItems: 'flex-start',
  },
  promptFieldBox: {
    minHeight: 140,
    maxHeight: 280,
    alignItems: 'flex-start',
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  promptDefaultAction: {
    flexShrink: 1,
  },
  promptConfirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: 8,
  },
  editAttachmentsBlock: {
    marginTop: 12,
    marginBottom: 4,
  },
  editAttachmentsTitle: {
    fontSize: 12,
    marginBottom: 6,
  },
  previewRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewBrokenBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  previewBrokenTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  previewBrokenDesc: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  previewTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 20,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 12,
  },
  previewName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
})

export default Home
