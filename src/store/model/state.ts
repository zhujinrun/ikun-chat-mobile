interface InitState {
  modelsByStation: Record<string, LX.ModelInfo[]>
  loadingByStation: Record<string, boolean>
  errorByStation: Record<string, string | null>
}

const state: InitState = {
  modelsByStation: {},
  loadingByStation: {},
  errorByStation: {},
}

export default state
