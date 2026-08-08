import { buildHeaders, getApiConfig, ApiError, parseErrorMessage } from './client'
import type { ListModelsResponse } from './types'
import { inferVisionCapability } from '@/utils/modelCapability'

export const listModels = async (signal?: AbortSignal): Promise<LX.ModelInfo[]> => {
  const { baseUrl, apiKey, extraHeaders } = getApiConfig()
  if (!baseUrl) throw new ApiError('请先配置 API URL')
  if (!apiKey) throw new ApiError('请先配置 API Key')

  const res = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: buildHeaders(apiKey, extraHeaders),
    signal,
  })

  if (!res.ok) {
    throw new ApiError(await parseErrorMessage(res), res.status)
  }

  const data = (await res.json()) as ListModelsResponse
  if (data.error?.message) throw new ApiError(data.error.message)

  const list = (data.data || []).map((item) => {
    const vision = inferVisionCapability(item.id)
    return {
      id: item.id,
      ownedBy: item.owned_by,
      supportedVision: vision === 'unknown' ? null : vision === 'vision',
    }
  })

  list.sort((a, b) => a.id.localeCompare(b.id))
  return list
}
