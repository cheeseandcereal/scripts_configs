# Personal conventions

## Writing style
Applies to all text: docs, code comments, log lines, commit messages,
chat replies.
- Keep replies and written deliverables concise and proportional to the
  task. Cover the substance; omit filler, boilerplate, repeated summaries,
  and lengthy caveats.
- Use plain, literal language suited to the reader's knowledge. Avoid
  mannered prose: metaphor or flourish that substitutes for saying what
  you mean, such as "earns its keep" instead of "is useful". Avoid jargon,
  invented compound labels, and stock phrases. Keep sentences readable
  rather than compressing them into dense shorthand.
- State the point directly. Avoid rhetorical questions, canned conclusions,
  and unsolicited contrasts about what something isn't, what won't change,
  or what you won't do.
- Never use em dashes. Rephrase, or use a comma, colon, or parentheses
  instead.
- Also avoid en dashes, including in numeric ranges: write `2-5`, not
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

## Parallel work
- Parallelize work whenever possible/practical, especially to save time.

## Delegation
- Use subagents when doing so could save time, improve quality, or keep
  the main agent's context focused. Parallelize independent work when
  practical.
- Start a fresh subagent session for each new assignment, even for related
  work. Give it a brief handoff and let it re-read files as needed. Reserve
  resuming for brief follow-ups about the previous response, such as
  completing unfinished output or clarifying a result.
- Write subagent prompts and follow-ups for human readers: use clear
  sentences, normal grammar, and proper spaces between words and numbers.

## Clarifying questions
- This applies to every agent, but especially the Plan agent: before
  producing a plan, route every clarification through `question`.
- For closed questions, provide 2-5 concrete `options` that cover the
  likely answers.
- For open-ended questions (naming, free-form descriptions, rationale,
  or anything where you cannot enumerate reasonable choices), still call
  the `question` tool. The "Type your own answer" option is added
  automatically, so either:
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
