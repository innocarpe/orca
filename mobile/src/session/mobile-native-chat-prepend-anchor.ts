export type MobileChatPrependAnchor = {
  /** Content height baseline. Bottom-only growth moves it forward. */
  height: number
  /** Transcript head when the hold was armed. A different head is the earlier page. */
  historyHeadId: string | null
}

/**
 * Compensate only for an earlier-page insert. Streaming growth while the page
 * is in flight must not consume the anchor or move the reader.
 */
export function planMobileChatPrependResize(args: {
  anchor: MobileChatPrependAnchor | null
  following: boolean
  hasItems: boolean
  height: number
  /** Reader offset at insertion time, including scrolls during the request. */
  offsetY: number
  historyHeadId: string | null
}): { anchor: MobileChatPrependAnchor | null; scrollOffset: number | null } {
  const { anchor, following, hasItems, height, offsetY, historyHeadId } = args
  if (anchor && !following) {
    if (historyHeadId !== anchor.historyHeadId && height > anchor.height) {
      return { anchor: null, scrollOffset: offsetY + (height - anchor.height) }
    }
    if (historyHeadId === anchor.historyHeadId) {
      return {
        anchor: height === anchor.height ? anchor : { height, historyHeadId: anchor.historyHeadId },
        scrollOffset: null
      }
    }
    // The head changed without added height, so there is no insert to hold.
    return { anchor: null, scrollOffset: null }
  }
  if (!following || !hasItems) {
    return { anchor: null, scrollOffset: null }
  }
  return { anchor: null, scrollOffset: height }
}
