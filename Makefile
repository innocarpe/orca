# Multi-LLM contribution harness helpers (innocarpe fork).
# Not part of the upstream Orca product build — safe to keep on fork main only.
# Worktrees created via these targets get the harness without dirtying fix/* PRs.
#
# Usage:
#   make worktree-add ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog
#   make worktree-bootstrap DIR=../orca-worktrees/fix-10633
#   make worktree-audit
#   make pr-followup
#   make worktree-rm ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog
#   make agent-install
#   make agent-install DIR=../orca-worktrees/fix-10633

SHELL := /bin/bash
.DEFAULT_GOAL := help

ORCA_PRIMARY ?= $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
ORCA_WORKTREES ?= $(abspath $(ORCA_PRIMARY)/../orca-worktrees)
UPSTREAM_REF ?= upstream/main
GIT ?= /usr/bin/git

BOOTSTRAP := $(ORCA_PRIMARY)/.grok/scripts/bootstrap-worktree.sh
INSTALL_SKILLS := $(ORCA_PRIMARY)/.grok/install-agent-skills.sh
PREPARE_FOLLOWUP := $(ORCA_PRIMARY)/.grok/skills/oss-pr-mirror/scripts/prepare-pr-followup.sh
AUDIT_WORKTREES := $(ORCA_PRIMARY)/.grok/scripts/audit-worktree-harness.sh

.PHONY: help agent-install worktree-add worktree-bootstrap worktree-audit pr-followup worktree-rm worktree-list ensure-upstream

help:
	@echo "Orca multi-LLM agent harness"
	@echo ""
	@echo "  make worktree-add ISSUE=<n> BRANCH=fix/<name>   create from $(UPSTREAM_REF) + bootstrap"
	@echo "  make worktree-bootstrap DIR=<path>              wire harness into existing worktree"
	@echo "  make worktree-audit                             verify all worktrees use the canonical harness"
	@echo "  make pr-followup                                rebase open PR branch onto latest upstream/main"
	@echo "  make worktree-rm ISSUE=<n> [BRANCH=...]         remove worktree (+ optional local branch)"
	@echo "  make worktree-list                              list git worktrees"
	@echo "  make agent-install [DIR=.]                      install Claude/Codex skills in DIR"
	@echo ""
	@echo "ORCA_PRIMARY=$(ORCA_PRIMARY)"
	@echo "ORCA_WORKTREES=$(ORCA_WORKTREES)"

ensure-upstream:
	@cd "$(ORCA_PRIMARY)" && \
	  $(GIT) fetch upstream "+refs/heads/main:refs/remotes/upstream/main"

# Install skills into DIR (default: primary). DIR may be a worktree.
agent-install:
	@test -x "$(INSTALL_SKILLS)" || chmod +x "$(INSTALL_SKILLS)"
	@ORCA_PRIMARY="$(ORCA_PRIMARY)" \
	  ORCA_SKILL_INSTALL_ROOT="$(if $(DIR),$(abspath $(DIR)),$(ORCA_PRIMARY))" \
	  bash "$(INSTALL_SKILLS)"

# Create worktree from upstream + always bootstrap agent harness.
# Requires: ISSUE and BRANCH
worktree-add: ensure-upstream
	@test -n "$(ISSUE)" || (echo "error: ISSUE= required" >&2; exit 1)
	@test -n "$(BRANCH)" || (echo "error: BRANCH= required" >&2; exit 1)
	@$(MAKE) agent-install
	@mkdir -p "$(ORCA_WORKTREES)"
	@test ! -e "$(ORCA_WORKTREES)/fix-$(ISSUE)" || \
	  (echo "error: already exists $(ORCA_WORKTREES)/fix-$(ISSUE)" >&2; exit 1)
	@cd "$(ORCA_PRIMARY)" && \
	  $(GIT) worktree add -b "$(BRANCH)" "$(ORCA_WORKTREES)/fix-$(ISSUE)" "$(UPSTREAM_REF)"
	@$(MAKE) worktree-bootstrap DIR="$(ORCA_WORKTREES)/fix-$(ISSUE)"
	@echo ""
	@echo "Next:"
	@echo "  cd $(ORCA_WORKTREES)/fix-$(ISSUE) && pnpm install"

# Wire harness into an existing worktree (or re-run after pull).
worktree-bootstrap:
	@test -n "$(DIR)" || (echo "error: DIR= required" >&2; exit 1)
	@test -x "$(BOOTSTRAP)" || chmod +x "$(BOOTSTRAP)"
	@ORCA_PRIMARY="$(ORCA_PRIMARY)" bash "$(BOOTSTRAP)" "$(abspath $(DIR))"
	@$(MAKE) worktree-audit

worktree-audit:
	@test -x "$(AUDIT_WORKTREES)" || chmod +x "$(AUDIT_WORKTREES)"
	@ORCA_PRIMARY="$(ORCA_PRIMARY)" bash "$(AUDIT_WORKTREES)"

# Rebase an open contribution branch before any public follow-up. The script
# records the exact upstream/remote heads for the later lease-protected sync.
pr-followup:
	@test -x "$(PREPARE_FOLLOWUP)" || chmod +x "$(PREPARE_FOLLOWUP)"
	@bash "$(PREPARE_FOLLOWUP)"

worktree-rm:
	@test -n "$(ISSUE)" || (echo "error: ISSUE= required" >&2; exit 1)
	@WT="$(ORCA_WORKTREES)/fix-$(ISSUE)"; \
	  if [[ -e "$$WT" ]]; then \
	    cd "$(ORCA_PRIMARY)" && $(GIT) worktree remove --force "$$WT" 2>/dev/null \
	      || /bin/rm -rf "$$WT"; \
	  else \
	    echo "no worktree at $$WT"; \
	  fi
	@cd "$(ORCA_PRIMARY)" && $(GIT) worktree prune
	@if [[ -n "$(BRANCH)" ]]; then \
	  cd "$(ORCA_PRIMARY)" && $(GIT) branch -D "$(BRANCH)" 2>/dev/null || true; \
	fi
	@echo "removed fix-$(ISSUE) (remote branch kept if any)"

worktree-list:
	@cd "$(ORCA_PRIMARY)" && $(GIT) worktree list
