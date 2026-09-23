export const UNSAVED_CHECK_EVENT = 'teachers-math:check-unsaved'

export function confirmUnsavedChanges() {
  return window.dispatchEvent(new Event(UNSAVED_CHECK_EVENT, { cancelable: true }))
}
