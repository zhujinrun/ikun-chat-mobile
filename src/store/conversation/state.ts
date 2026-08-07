interface InitState {
  conversations: LX.Conversation[]
  activeId: string | null
  messages: Record<string, LX.ChatMessage[]>
}

const state: InitState = {
  conversations: [],
  activeId: null,
  messages: {},
}

export default state
