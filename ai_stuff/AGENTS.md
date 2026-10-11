# Personal conventions

## Writing style
Applies to all text: docs, code comments, log lines, commit messages,
chat replies.
- Never use em dashes. Rephrase, or use a comma, colon, or parentheses
  instead.
- Avoid en dashes too, including in numeric ranges: write `2-5`, not
  `2–5`.
- Keep code comments as condensed as is reasonable. Avoid comments of
  3+ lines unless really necessary.
- Do not manually wrap prose in GitHub PR/issue descriptions, discussions,
  or comments: single newlines render as line breaks. Keep each paragraph
  on one source line.

## Current-state writing
Applies to code comments, docstrings, documentation, and code/test names.
- Describe current behavior, contracts, and constraints for readers
  unfamiliar with earlier versions or the editing conversation.
- When making iterative edits, rewrite affected text to describe the
  resulting state directly. Do not append a running account of changes,
  removed behavior, discarded approaches, or things that stayed unchanged.
  Avoid edit-relative wording such as "now", "previously", "no longer",
  or "after the refactor" when narrating development history.
- Include design rationale only when it meaningfully helps readers
  understand a tricky constraint, non-obvious behavior, or important
  tradeoff. Routine implementation choices do not need justification.
  When rationale is useful, state the relevant reason directly without
  recounting the decision-making process.
- Name code and tests for purpose or behavior. Names like "new", "old",
  or "v2" need an actual domain or versioning meaning.
- Keep development history in Git unless explicitly requested or
  intrinsic to the task (changelogs, release notes, commit messages,
  etc.). Do not add history sections just to retain edit details.
  Include migration, deprecation, or compatibility history only when
  needed for reader action or a supported contract.
- Review touched text before finishing: would it help someone who never
  saw the previous implementation? Delete incidental history and express
  useful facts in terms of the current system.

## Git commits
- Do not set `user.email`, `user.name`, or pass `-c user.X=...` when
  committing. Use the ambient git config.
- Always disable commit signing. Pass `--no-gpg-sign` explicitly on every
  `git commit`, `git merge`, `git rebase`, `git cherry-pick`, and
  `git tag` invocation (even if repo/global config would not sign), so
  behavior is independent of `commit.gpgsign` / `tag.gpgsign` settings.
  Do not enable signing unless the user explicitly asks.
- Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`,
  `test:`, `chore:`) unless the project AGENTS.md says otherwise.
- Never run destructive git operations (force push to main, hard reset on
  shared branches, --no-verify, rewriting pushed history) without an
  explicit request.

## Python scripts
- When creating or running Python scripts that need non-stdlib
  dependencies, use `uv`. Do not install packages via pip, pipx, or
  the system package manager.
- For one-off/standalone scripts, prefer PEP 723 inline metadata
  (`# /// script` block declaring dependencies) and run with
  `uv run script.py`, or use `uv run --with <pkg> script.py`.
- Inside a project, use `uv add` / `uv run` against the project's
  `pyproject.toml`.

# OpenCode notes

## Parallel work (OpenCode v1.x only)
If running OpenCode v2+, skip this section and tell me it's stale.
- Tool calls, including `task` delegations to subagents, run
  concurrently only when emitted in the same message. If you say
  you'll launch agents "in parallel", put every `task` call in that
  one message; never send one, wait, then send the next.
- `task` blocks your turn. To work "while an agent runs", include your
  own independent calls in that same message or delegate to another
  agent. Don't claim concurrent work you didn't batch.
- Long shell jobs can use
  `nohup cmd > /tmp/opencode/x.log 2>&1 &` to survive across turns.
  A bare `cmd &` still blocks.

## Clarifying questions
- This applies in every mode/agent, but especially in plan mode: before
  producing a plan, route every clarification through `question`.
- For closed questions, provide 2-5 concrete `options` that cover the
  likely answers.
- For open-ended questions (naming, free-form descriptions, rationale,
  or anything where you cannot enumerate reasonable choices), still call
  the `question` tool. Set `custom: true` so the "Type your own answer"
  field is available, and either:
    - pass an empty/short options list and make clear in the question
      text that a typed answer is expected, OR
    - include 1-3 example answers as options purely as prompts, and
      state in the question text that I should prefer typing my own
      answer.
- Batch related questions into a single `question` tool call with
  multiple entries when possible, rather than serial round-trips.
- Only fall back to plain-text questions if the `question` tool is
  unavailable in the current environment (e.g., non-interactive CLI
  runs). In interactive TUI sessions, always use the tool.
