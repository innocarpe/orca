import { describe, expect, it } from 'vitest'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import {
  getFullDropIndexForWorktreeDragUnit,
  getWorktreeDragUnitGroups
} from './worktree-drag-units'

function header(key: string): { type: 'header'; key: string } {
  return { type: 'header', key }
}

function item(
  id: string,
  depth = 0,
  sectionKey = 'all',
  hostId?: ExecutionHostId
): {
  type: 'item'
  worktree: { id: string; hostId?: ExecutionHostId }
  depth: number
  sectionKey: string
} {
  return { type: 'item', worktree: { id, hostId }, depth, sectionKey }
}

function importedCard(): { type: 'imported-worktrees-card' } {
  return { type: 'imported-worktrees-card' }
}

function target(worktreeId: string, executionHostId = 'local') {
  return { worktreeId, executionHostId }
}

describe('getWorktreeDragUnitGroups', () => {
  it('treats expanded lineage descendants as part of the parent drag unit', () => {
    const groups = getWorktreeDragUnitGroups([
      header('all'),
      item('parent'),
      item('child', 1),
      item('grandchild', 2),
      item('sibling')
    ])

    expect(groups).toEqual([
      {
        key: 'all',
        worktreeIds: ['parent', 'sibling'],
        units: [
          {
            worktreeId: 'parent',
            worktreeIds: ['parent', 'child', 'grandchild'],
            pinTargets: [target('parent'), target('child'), target('grandchild')]
          },
          { worktreeId: 'sibling', worktreeIds: ['sibling'], pinTargets: [target('sibling')] }
        ]
      }
    ])
  })

  it('ignores imported worktree card rows without splitting drag groups', () => {
    const groups = getWorktreeDragUnitGroups([
      header('repo:one'),
      item('main'),
      importedCard(),
      item('feature'),
      header('repo:two'),
      importedCard(),
      item('other')
    ])

    expect(groups).toEqual([
      {
        key: 'repo:one',
        worktreeIds: ['main', 'feature'],
        units: [
          { worktreeId: 'main', worktreeIds: ['main'], pinTargets: [target('main')] },
          { worktreeId: 'feature', worktreeIds: ['feature'], pinTargets: [target('feature')] }
        ]
      },
      {
        key: 'repo:two',
        worktreeIds: ['other'],
        units: [{ worktreeId: 'other', worktreeIds: ['other'], pinTargets: [target('other')] }]
      }
    ])
  })

  it('includes pinned rows when they are the only rendered copy', () => {
    const groups = getWorktreeDragUnitGroups([
      header('pinned'),
      item('pinned-copy', 0, 'pinned'),
      item('other-pinned', 0, 'pinned')
    ])

    expect(groups).toEqual([
      {
        key: 'pinned',
        worktreeIds: ['pinned-copy', 'other-pinned'],
        units: [
          {
            worktreeId: 'pinned-copy',
            worktreeIds: ['pinned-copy'],
            pinTargets: [target('pinned-copy')]
          },
          {
            worktreeId: 'other-pinned',
            worktreeIds: ['other-pinned'],
            pinTargets: [target('other-pinned')]
          }
        ]
      }
    ])
  })

  it('uses natural drag units when pinned rows have duplicate natural copies', () => {
    const groups = getWorktreeDragUnitGroups([
      header('pinned'),
      item('pinned-copy', 0, 'pinned'),
      header('all'),
      item('pinned-copy'),
      item('other')
    ])

    expect(groups).toEqual([
      {
        key: 'all',
        worktreeIds: ['pinned-copy', 'other'],
        units: [
          {
            worktreeId: 'pinned-copy',
            worktreeIds: ['pinned-copy'],
            pinTargets: [target('pinned-copy')]
          },
          { worktreeId: 'other', worktreeIds: ['other'], pinTargets: [target('other')] }
        ]
      }
    ])
  })

  it('preserves the host for rows with the same workspace id', () => {
    const groups = getWorktreeDragUnitGroups([
      header('ssh:host-b'),
      item('shared', 0, 'all', 'ssh:host-b')
    ])

    expect(groups[0]?.units[0]?.pinTargets).toEqual([
      { worktreeId: 'shared', executionHostId: 'ssh:host-b' }
    ])
  })
})

describe('getFullDropIndexForWorktreeDragUnit', () => {
  it('maps visual unit drop indexes back to full row indexes', () => {
    const groups = getWorktreeDragUnitGroups([
      header('all'),
      item('parent'),
      item('child', 1),
      item('sibling')
    ])

    expect(
      getFullDropIndexForWorktreeDragUnit({
        groups,
        sourceGroupKey: 'all',
        dropIndex: 2
      })
    ).toBe(3)
  })
})
