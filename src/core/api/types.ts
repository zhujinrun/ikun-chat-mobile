export type ApiMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export type ApiMessageContent = string | ApiMessageContentPart[]

export type ApiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: ApiMessageContent
}

/** 部分中转站 content 可能是 string 或分段数组 */
export type ChatContentPart = string | { type?: string; text?: string; content?: string }

export type ChatCompletionChunk = {
  id?: string
  choices?: Array<{
    delta?: { content?: ChatContentPart | ChatContentPart[]; role?: string }
    message?: { content?: ChatContentPart | ChatContentPart[]; role?: string }
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
