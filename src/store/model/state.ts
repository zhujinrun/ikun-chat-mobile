interface InitState {
  models: LX.ModelInfo[]
  loading: boolean
  error: string | null
}

const state: InitState = {
  models: [],
  loading: false,
  error: null,
}

export default state
