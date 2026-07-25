/** Grow a single-line textarea to fit its value (up to CSS max-height). */
export function autosizeTextareaHeight(textarea: HTMLTextAreaElement): void {
  // Why: reset to auto first so shrinking a long note back down still works.
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}
