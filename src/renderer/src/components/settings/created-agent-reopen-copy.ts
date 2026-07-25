import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'

export function getCreatedAgentReopenTitle(): string {
  return translate(
    'auto.components.settings.created-agent-reopen-copy.title',
    'Reopen workspaces with the agent they were created with'
  )
}

export function getCreatedAgentReopenDescription(): string {
  return translate(
    'auto.components.settings.created-agent-reopen-copy.description',
    'When a workspace was created with an agent and has no open tabs, reopening it from the sidebar launches that agent again. Turn this off to open a blank terminal instead.'
  )
}

export function getCreatedAgentReopenSearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.agents.search.96ba2373b6', fallback: 'agent' },
    { key: 'auto.components.settings.agents.search.reopen', fallback: 'reopen' },
    { key: 'auto.components.settings.agents.search.created', fallback: 'created' },
    { key: 'auto.components.settings.agents.search.workspace', fallback: 'workspace' },
    { key: 'auto.components.settings.agents.search.sidebar', fallback: 'sidebar' },
    { key: 'auto.components.settings.agents.search.blank', fallback: 'blank' },
    { key: 'auto.components.settings.agents.search.resume', fallback: 'resume' },
    { key: 'auto.components.settings.agents.search.relaunch', fallback: 'relaunch' }
  ])
}
