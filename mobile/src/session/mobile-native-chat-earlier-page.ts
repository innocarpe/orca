/** Near-top offset that pages in older mobile chat history. */
export const MOBILE_CHAT_EARLIER_PAGE_TOP_PX = 60

export type MobileEarlierPageSample = {
  offsetY: number
  previousOffsetY: number | null
  itemCount: number
  requestedAtItemCount: number
  hasMore: boolean
  loadingEarlier: boolean
}

/**
 * One earlier page per visible stretch. A prepend leaves the numeric offset
 * near the top, so a later scroll event must not immediately request again.
 */
export function shouldRequestMobileEarlierPage(sample: MobileEarlierPageSample): boolean {
  if (!sample.hasMore || sample.loadingEarlier) {
    return false
  }
  if (sample.offsetY >= MOBILE_CHAT_EARLIER_PAGE_TOP_PX) {
    return false
  }
  if (sample.previousOffsetY !== null && sample.offsetY >= sample.previousOffsetY) {
    return false
  }
  return sample.itemCount !== sample.requestedAtItemCount
}

export function createMobileEarlierPageGate(): {
  observe(sample: {
    offsetY: number
    itemCount: number
    hasMore: boolean
    loadingEarlier: boolean
  }): boolean
} {
  let previousOffsetY: number | null = null
  let requestedAtItemCount = -1
  return {
    observe(sample) {
      const should = shouldRequestMobileEarlierPage({
        ...sample,
        previousOffsetY,
        requestedAtItemCount
      })
      previousOffsetY = sample.offsetY
      if (should) {
        requestedAtItemCount = sample.itemCount
      }
      return should
    }
  }
}
