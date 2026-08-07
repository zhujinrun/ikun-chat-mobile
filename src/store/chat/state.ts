interface InitState {
  streaming: boolean
  streamingConversationId: string | null
  streamingMessageId: string | null
  abortController: AbortController | null
}

const state: InitState = {
  streaming: false,
  streamingConversationId: null,
  streamingMessageId: null,
  abortController: null,
}

export default state
