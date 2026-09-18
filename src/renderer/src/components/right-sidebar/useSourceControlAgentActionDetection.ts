import { useCallback, useMemo, useState } from 'react'
import {
  ensureSourceControlDetectedAgents,
  resolveSourceControlAgentDetectionTarget
} from '@/lib/source-control-agent-detection-target'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'

export function useSourceControlAgentActionDetection(args: {
  worktreeId?: string | null
  connectionId?: string | null
}): {
  connectionUnavailable: boolean
  detectedAgents: TuiAgent[]
  detecting: boolean
  refreshDetectedAgents: () => Promise<TuiAgent[]>
} {
  const { worktreeId, connectionId } = args
  const runtimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, worktreeId ?? null)
  )
  const detectionTarget = useMemo(
    () =>
      resolveSourceControlAgentDetectionTarget({
        worktreeId,
        connectionId,
        runtimeEnvironmentId
      }),
    [connectionId, runtimeEnvironmentId, worktreeId]
  )
  const [detectedAgents, setDetectedAgents] = useState<TuiAgent[]>([])
  const [detecting, setDetecting] = useState(false)
  const connectionUnavailable = detectionTarget.kind === 'unavailable'

  const refreshDetectedAgents = useCallback(async (): Promise<TuiAgent[]> => {
    if (detectionTarget.kind === 'unavailable') {
      setDetectedAgents([])
      setDetecting(false)
      return []
    }
    setDetecting(true)
    try {
      const nextAgents = await ensureSourceControlDetectedAgents(
        detectionTarget,
        useAppStore.getState()
      )
      setDetectedAgents(nextAgents)
      return nextAgents
    } finally {
      setDetecting(false)
    }
  }, [detectionTarget])

  return {
    connectionUnavailable,
    detectedAgents,
    detecting,
    refreshDetectedAgents
  }
}
