interface InitState {
  streaming: boolean
  stopping: boolean
  streamingConversationId: string | null
  streamingMessageId: string | null
  abortController: AbortController | null
}

const state: InitState = {
  streaming: false,
  stopping: false,
  streamingConversationId: null,
  streamingMessageId: null,
  abortController: null,
}

export default state
