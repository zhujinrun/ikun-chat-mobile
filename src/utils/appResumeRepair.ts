let mediaPickerInFlight = false
let mediaPickerSettled = false
let repairOnNextActive = false
let settledAt = 0

const REPAIR_WINDOW_MS = 10 * 60 * 1000

export const markMediaPickerOpened = () => {
  mediaPickerInFlight = true
  mediaPickerSettled = false
  repairOnNextActive = false
}

export const markMediaPickerSettled = () => {
  if (!mediaPickerInFlight) return
  mediaPickerInFlight = false
  mediaPickerSettled = true
  settledAt = Date.now()
}

export const shouldRepairNavigationOnAppStateChange = (
  prevState: string,
  nextState: string
): boolean => {
  if (!mediaPickerSettled) return false

  if (Date.now() - settledAt > REPAIR_WINDOW_MS) {
    mediaPickerSettled = false
    repairOnNextActive = false
    return false
  }

  if (nextState === 'background') {
    repairOnNextActive = true
    return false
  }

  if (
    nextState === 'active' &&
    repairOnNextActive &&
    (prevState === 'background' || prevState === 'inactive')
  ) {
    mediaPickerSettled = false
    repairOnNextActive = false
    return true
  }

  return false
}
