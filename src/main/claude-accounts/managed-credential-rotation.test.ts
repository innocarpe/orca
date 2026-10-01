import { describe, expect, it } from 'vitest'
import { withClaudeManagedCredentialRotation } from './managed-credential-rotation'

describe('withClaudeManagedCredentialRotation', () => {
  it('runs a second rotation only after the first one finishes', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const first = withClaudeManagedCredentialRotation(
      () =>
        new Promise<void>((resolve) => {
          order.push('first-start')
          releaseFirst = () => {
            order.push('first-end')
            resolve()
          }
        })
    )
    const second = withClaudeManagedCredentialRotation(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual(['first-start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first-start', 'first-end', 'second'])
  })
})
