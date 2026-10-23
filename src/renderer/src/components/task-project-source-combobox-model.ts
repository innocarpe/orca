import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { TaskProjectPickerGroup } from './task-page-default-repo-selection'

export function selectedTaskProjectGroups(
  groups: readonly TaskProjectPickerGroup[],
  selected: ReadonlySet<string>
): TaskProjectPickerGroup[] {
  return groups.filter((group) => group.sources.some((source) => selected.has(source.id)))
}

export function isTaskProjectGroupSelected(
  group: TaskProjectPickerGroup,
  selected: ReadonlySet<string>
): boolean {
  return group.sources.some((source) => selected.has(source.id))
}

export function getSelectedTaskProjectSource(
  group: TaskProjectPickerGroup,
  selected: ReadonlySet<string>
): Repo {
  return group.sources.find((source) => selected.has(source.id)) ?? group.repo
}

export function hasMultipleTaskProjectHosts(groups: readonly TaskProjectPickerGroup[]): boolean {
  const hostIds = new Set<string>()
  for (const group of groups) {
    for (const source of group.sources) {
      hostIds.add(getRepoExecutionHostId(source))
      if (hostIds.size > 1) {
        return true
      }
    }
  }
  return false
}

export function hasMultipleTaskProjectHostsInGroup(group: TaskProjectPickerGroup): boolean {
  return hasMultipleTaskProjectHosts([group])
}

export function isAllTaskProjectsSelected(
  groups: readonly TaskProjectPickerGroup[],
  selected: ReadonlySet<string>
): boolean {
  return groups.length > 0 && selectedTaskProjectGroups(groups, selected).length === groups.length
}

export function nextTaskProjectSelectionAfterToggle(args: {
  groups: readonly TaskProjectPickerGroup[]
  selected: ReadonlySet<string>
  group: TaskProjectPickerGroup
}): Set<string> | null {
  if (isAllTaskProjectsSelected(args.groups, args.selected)) {
    // Narrow the project filter without changing its selected execution host.
    return new Set([getSelectedTaskProjectSource(args.group, args.selected).id])
  }

  const next = new Set(args.selected)
  if (isTaskProjectGroupSelected(args.group, next)) {
    if (selectedTaskProjectGroups(args.groups, args.selected).length <= 1) {
      return null
    }
    for (const source of args.group.sources) {
      next.delete(source.id)
    }
    return next
  }
  next.add(args.group.repo.id)
  return next
}
