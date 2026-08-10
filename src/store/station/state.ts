interface InitState {
  stations: LX.ApiStation[]
  defaultId: string | null
}

const state: InitState = {
  stations: [],
  defaultId: null,
}

export default state
