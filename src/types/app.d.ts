declare global {
  namespace LX {
    type AppSetting = {
      version: string
      'common.langId': string | null
      'api.baseUrl': string
      'api.apiKey': string
      'api.extraHeaders': string
      'api.defaultModel': string
      'chat.systemPrompt': string
      'chat.temperature': number
      'chat.maxTokens': number
      'chat.stream': boolean
      'theme.id': string
      'common.fontSize': number
    }

    type Conversation = {
      id: string
      title: string
      model: string
      systemPrompt?: string
      pinned?: boolean
      createdAt: number
      updatedAt: number
    }

    type ChatRole = 'system' | 'user' | 'assistant' | 'error'

    type ChatAttachmentType = 'image'

    type ChatAttachment = {
      id: string
      type: ChatAttachmentType
      uri: string
      mimeType: string
      name?: string
      size?: number
      width?: number
      height?: number
      dataUrl?: string
    }

    type ChatMessage = {
      id: string
      conversationId: string
      role: ChatRole
      content: string
      attachments?: ChatAttachment[]
      createdAt: number
    }

    type ModelInfo = {
      id: string
      ownedBy?: string
      /** 是否支持图片输入：true/false 已知，null|undefined 未知 */
      supportedVision?: boolean | null
    }

    type ThemeColors = {
      primary: string
      primaryDark: string
      background: string
      surface: string
      surfaceSecondary: string
      border: string
      text: string
      textSecondary: string
      textInverse: string
      userBubble: string
      assistantBubble: string
      error: string
      success: string
      inputBg: string
    }

    type ActiveTheme = {
      id: string
      name: string
      isDark: boolean
      colors: ThemeColors
    }
  }

  var lx: {
    setting: LX.AppSetting
    fontSize: number
    statusBarHeight: number
  }
  var state_event: import('@/event/stateEvent').StateEvent
}

export {}
