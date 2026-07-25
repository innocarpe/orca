import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import {
  getCreatedAgentReopenDescription,
  getCreatedAgentReopenSearchKeywords,
  getCreatedAgentReopenTitle
} from './created-agent-reopen-copy'
import { SearchableSetting } from './SearchableSetting'

type CreatedAgentReopenSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function CreatedAgentReopenSetting({
  settings,
  updateSettings
}: CreatedAgentReopenSettingProps): React.JSX.Element {
  const title = getCreatedAgentReopenTitle()
  const description = getCreatedAgentReopenDescription()
  const enabled = settings.reopenWorkspacesWithCreatedAgent !== false

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={title}
        description={description}
        keywords={getCreatedAgentReopenSearchKeywords()}
      >
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{title}</Label>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label={title}
            aria-checked={enabled}
            onClick={() =>
              updateSettings({
                reopenWorkspacesWithCreatedAgent: !enabled
              })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ${
              enabled ? 'bg-foreground' : 'bg-muted-foreground/30'
            } outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
          >
            <span
              className={`pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </SearchableSetting>
    </section>
  )
}
