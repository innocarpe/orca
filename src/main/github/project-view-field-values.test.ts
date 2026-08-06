import { describe, expect, it } from 'vitest'
import { normalizeFieldValue } from './project-view'

describe('normalizeFieldValue linked PR / sub-issues progress', () => {
  it('normalizes ProjectV2ItemFieldPullRequestValue', () => {
    const value = normalizeFieldValue({
      __typename: 'ProjectV2ItemFieldPullRequestValue',
      field: { id: 'field-pr', name: 'Linked pull requests', dataType: 'LINKED_PULL_REQUESTS' },
      pullRequests: {
        nodes: [{ number: 12, title: 'Fix', url: 'https://github.com/o/r/pull/12' }, null]
      }
    })
    expect(value).toEqual({
      kind: 'pull-requests',
      fieldId: 'field-pr',
      pullRequests: [{ number: 12, title: 'Fix', url: 'https://github.com/o/r/pull/12' }]
    })
  })

  it('normalizes ProjectV2ItemFieldProgressValue', () => {
    const value = normalizeFieldValue({
      __typename: 'ProjectV2ItemFieldProgressValue',
      field: { id: 'field-sub', name: 'Sub-issues progress', dataType: 'SUB_ISSUES_PROGRESS' },
      percentComplete: 50,
      completedCount: 1,
      totalCount: 2
    })
    expect(value).toEqual({
      kind: 'sub-issues-progress',
      fieldId: 'field-sub',
      percent: 50,
      completed: 1,
      total: 2
    })
  })
})
