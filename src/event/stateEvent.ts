import Event from './Event'

export class StateEvent extends Event {
  configUpdated(keys: Array<keyof LX.AppSetting>, setting: Partial<LX.AppSetting>) {
    this.emit('configUpdated', keys, setting)
  }

  themeUpdated(theme: LX.ActiveTheme) {
    this.emit('themeUpdated', theme)
  }

  conversationsUpdated() {
    this.emit('conversationsUpdated')
  }

  messagesUpdated(conversationId: string) {
    this.emit('messagesUpdated', conversationId)
  }

  activeConversationChanged(id: string | null) {
    this.emit('activeConversationChanged', id)
  }

  modelsUpdated() {
    this.emit('modelsUpdated')
  }

  streamingUpdated() {
    this.emit('streamingUpdated')
  }
}
