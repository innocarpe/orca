let rotation: Promise<unknown> = Promise.resolve()

/**
 * One in-flight rotation for every saved Claude login.
 *
 * Account selection refreshes inside its mutation queue. An inactive usage
 * preview can refresh the same single-use token while that selection is
 * reading it. Sharing this queue makes the second caller re-read the blob
 * the first caller already persisted.
 */
export function withClaudeManagedCredentialRotation<T>(operation: () => Promise<T>): Promise<T> {
  const run = rotation.then(operation, operation)
  rotation = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
