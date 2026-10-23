import { describe, expect, it } from 'vitest'

import type { Repo } from '../../../shared/repo-types'
import type { TaskProjectPickerGroup } from './task-page-default-repo-selection'
import { nextTaskProjectSelectionAfterToggle } from './task-project-source-combobox-model'

function repo(id: string, overrides: Partial<Repo> = {}): Repo {
  return {
    id,
    displayName: id,
    path: `/repos/${id}`,
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

function group(
  projectKey: string,
  primary: Repo,
  sources: Repo[] = [primary]
): TaskProjectPickerGroup {
  return {
    projectKey,
    repo: primary,
    sources
  }
}

describe('nextTaskProjectSelectionAfterToggle', () => {
  const a = repo('a')
  const b = repo('b')
  const c = repo('c')
  const groupA = group('a', a)
  const groupB = group('b', b)
  const groupC = group('c', c)
  const groups = [groupA, groupB, groupC]

  it('from All projects, clicking a project selects only that project (#10182)', () => {
    const selected = new Set(['a', 'b', 'c'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups,
      selected,
      group: groupB
    })
    expect(next).toEqual(new Set(['b']))
  })

  it('adds an unselected project to a partial selection', () => {
    const selected = new Set(['a'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups,
      selected,
      group: groupB
    })
    expect(next).toEqual(new Set(['a', 'b']))
  })

  it('removes a selected project from a multi selection', () => {
    const selected = new Set(['a', 'b'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups,
      selected,
      group: groupA
    })
    expect(next).toEqual(new Set(['b']))
  })

  it('does not deselect the last remaining project', () => {
    const selected = new Set(['a'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups,
      selected,
      group: groupA
    })
    expect(next).toBeNull()
  })

  it('removes every host source of a multi-host project when deselecting', () => {
    const local = repo('proj-local', { displayName: 'proj' })
    const remote = repo('proj-ssh', { displayName: 'proj', connectionId: 'builder' })
    const multi = group('proj', local, [local, remote])
    const groupsWithMulti = [multi, groupB, groupC]
    const selected = new Set(['proj-local', 'proj-ssh', 'b'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups: groupsWithMulti,
      selected,
      group: multi
    })
    expect(next).toEqual(new Set(['b']))
  })

  it('from All projects with multi-host groups, click keeps the selected source', () => {
    const local = repo('proj-local', { displayName: 'proj' })
    const remote = repo('proj-ssh', { displayName: 'proj', connectionId: 'builder' })
    const multi = group('proj', local, [local, remote])
    const groupsWithMulti = [multi, groupB]
    const selected = new Set(['proj-local', 'b'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups: groupsWithMulti,
      selected,
      group: multi
    })
    expect(next).toEqual(new Set(['proj-local']))
  })

  it('from All projects, narrowing preserves a non-primary selected host', () => {
    const local = repo('proj-local', { displayName: 'proj' })
    const remote = repo('proj-ssh', { displayName: 'proj', connectionId: 'builder' })
    const multi = group('proj', local, [local, remote])
    const groupsWithMulti = [multi, groupB]
    const selected = new Set(['proj-ssh', 'b'])
    const next = nextTaskProjectSelectionAfterToggle({
      groups: groupsWithMulti,
      selected,
      group: multi
    })
    expect(next).toEqual(new Set(['proj-ssh']))
  })
})
