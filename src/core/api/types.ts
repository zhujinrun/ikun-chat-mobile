export type ApiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionChunk = {
  id?: string
  choices?: Array<{
    delta?: { content?: string; role?: string }
    message?: { content?: string; role?: string }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

export type ListModelsResponse = {
  data?: Array<{ id: string; owned_by?: string }>
  error?: { message?: string }
}

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: { role?: string; content?: string }
  }>
  error?: { message?: string }
}
