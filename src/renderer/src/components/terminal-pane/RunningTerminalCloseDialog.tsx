import { useAppStore } from '@/store'
import CloseTerminalDialog from './CloseTerminalDialog'

/** Store-driven running-process close confirm so tab X / middle-click / Cmd+W
 *  share one policy without threading React context through every close path. */
export default function RunningTerminalCloseDialog(): React.JSX.Element {
  const request = useAppStore((state) => state.runningTerminalCloseConfirm)
  const confirmRunningTerminalClose = useAppStore((state) => state.confirmRunningTerminalClose)
  const dismissRunningTerminalClose = useAppStore((state) => state.dismissRunningTerminalClose)
  const updateSettings = useAppStore((state) => state.updateSettings)

  return (
    <CloseTerminalDialog
      open={request !== null}
      copyKind={request?.copyKind ?? 'command'}
      onCancel={dismissRunningTerminalClose}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) {
          void updateSettings({ skipCloseTerminalWithRunningProcessConfirm: true })
        }
        confirmRunningTerminalClose()
      }}
    />
  )
}
