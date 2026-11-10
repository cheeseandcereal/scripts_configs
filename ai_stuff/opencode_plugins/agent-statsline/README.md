# Agent statsline

An OpenCode v2 TUI plugin for reasoning activity and subagent context usage.

- **Main sessions:** reasoning status below the input box, before native usage and cost. Hidden in shell mode and when the footer hides its details.
- **Subagent sessions:** model with variant when set, context, and reasoning above the subagent picker, including nested subagents.

```text
Claude Fable 5.1 (Global) (high) · 674.9K (64%) · Thought: 2s
Thinking: 2s · 14s total · 3 blocks
```

**Thinking** times the current reasoning block even when its text is hidden, as with GPT models. Its timer resets for each block; consecutive blocks also show their count and total duration, excluding gaps and tool execution. **Thought** freezes the recorded total. **Waiting** uses the execution start during preparation, then the request's start when available. Durations are displayed in whole seconds; an unfinished block is hidden when its request stops.

Context uses the latest measured assistant after completed compaction and before any undo boundary, matching the main pane. The model ID is used until its display name is available, and the percentage is omitted when capacity is unknown. Unknown values produce no placeholder or extra separator. The row clips to one line in narrow panes.

## Install

Copy this directory to `~/.config/opencode/plugins/agent-statsline/`. OpenCode automatically discovers its TUI entrypoint there. The plugin ID is `local.agent-statsline`. OpenCode supplies the UI modules; no build or dependency installation is needed to run it.

## Development

```sh
npm install
npm test
```

`status.js` contains the pure transcript calculations. `tui.jsx` contains the display, clock, and two slot registrations. Dependencies are only for the Bun/OpenTUI tests.
