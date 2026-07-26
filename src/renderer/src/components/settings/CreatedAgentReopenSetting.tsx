import type { GlobalSettings } from '../../../../shared/types'
import {
  getCreatedAgentReopenDescription,
  getCreatedAgentReopenSearchKeywords,
  getCreatedAgentReopenTitle
} from './created-agent-reopen-copy'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

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
        <SettingsSwitchRow
          label={title}
          description={description}
          checked={enabled}
          onChange={() =>
            updateSettings({
              reopenWorkspacesWithCreatedAgent: !enabled
            })
          }
        />
      </SearchableSetting>
    </section>
  )
}
