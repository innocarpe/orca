import type { TuiAgent } from './tui-agent'

/** Why: plain-English agent names for non-localized surfaces (keybinding
 * titles in the shared registry, which main, renderer, and the keybindings
 * file sanitizer all read). For agents in the renderer catalog, keep these
 * aligned with the localized label fallback. */
export const TUI_AGENT_DISPLAY_NAMES: Record<TuiAgent, string> = {
  claude: 'Claude',
  'claude-agent-teams': 'Claude Agent Teams',
  codebuddy: 'CodeBuddy',
  openclaude: 'OpenClaude',
  codex: 'Codex',
  devin: 'Devin',
  ante: 'Ante',
  trae: 'Trae',
  muse: 'Muse',
  dsh: 'DeepSeek Harness',
  zcode: 'ZCode',
  dsb: 'DeepSeek Build',
  autohand: 'Autohand Code',
  opencode: 'OpenCode',
  opencode2: 'OpenCode 2',
  'mimo-code': 'MiMo Code',
  pi: 'Pi',
  omp: 'OMP',
  'prime-agent': 'Prime Agent',
  qoder: 'Qoder CLI',
  'qoder-cn': 'Qoder CLI China',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  aider: 'Aider',
  goose: 'Goose',
  amp: 'Amp',
  kilo: 'Kilocode',
  kiro: 'Kiro',
  crush: 'Charm',
  aug: 'Auggie',
  cline: 'Cline',
  codebuff: 'Codebuff',
  freebuff: 'Freebuff',
  'command-code': 'Command Code',
  continue: 'Continue',
  cursor: 'Cursor',
  droid: 'Droid',
  kimi: 'Kimi',
  'mistral-vibe': 'Mistral Vibe',
  'qwen-code': 'Qwen Code',
  rovo: 'Rovo Dev',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  copilot: 'GitHub Copilot',
  grok: 'Grok',
  jcode: 'Jcode'
}

/** Canonical agent id list derived from the exhaustive display-name record,
 * so shared modules can enumerate agents without importing renderer code. */
export const ALL_TUI_AGENTS = Object.keys(TUI_AGENT_DISPLAY_NAMES) as readonly TuiAgent[]

// Why: DeepSeek Build is recognized from running sessions; its launch flow is a separate change.
export const TAB_LAUNCH_TUI_AGENTS: readonly TuiAgent[] = ALL_TUI_AGENTS.filter(
  (agent) => agent !== 'dsb'
)
