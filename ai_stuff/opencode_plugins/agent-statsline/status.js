const tokenFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function visibleMessages(messages, revertMessageID) {
  if (!revertMessageID) return messages
  const end = messages.findIndex((message) => message.id === revertMessageID)
  return end === -1 ? [] : messages.slice(0, end)
}

export function thinkingStatus(messages, session, running) {
  const busy = session?.time.busy
  const reverting = Boolean(session?.revert)
  const live = running && !reverting
  const executionStart = reverting ? -Infinity : busy ?? -Infinity
  let assistantIndex = messages.length - 1
  // Cross one closing idle to retain a stopped execution's final thought.
  let passedIdle = false
  for (; assistantIndex >= 0; assistantIndex--) {
    const { type } = messages[assistantIndex]
    if (type === "compaction") return
    if (type === "assistant") break
    if (type !== "idle") continue
    if (live || passedIdle) {
      assistantIndex = -1
      break
    }
    passedIdle = true
  }

  const assistant = messages[assistantIndex]
  if (!assistant || assistant.time.created < executionStart) {
    const idle = messages.findLast((message) => message.type === "idle")
    const lastIdle = Math.max(session?.time.idle ?? -Infinity, idle?.time.created ?? -Infinity)
    if (live && busy !== undefined && busy > lastIdle) {
      return { kind: "waiting", start: busy }
    }
    return
  }

  const activeRequest = live && assistant.time.streamed === undefined &&
    assistant.time.completed === undefined && !assistant.error
  if (activeRequest && assistant.retry) return
  // Transparent retries can retain reasoning from an earlier request attempt.
  const awaitingContent = activeRequest && assistant.content.every(
    (part) => part.type === "reasoning" && part.time && part.time.created < assistant.time.created,
  )
  if (awaitingContent) {
    return { kind: "waiting", start: assistant.time.created }
  }

  return reasoningGroup(messages, assistantIndex, executionStart, activeRequest)
}

function reasoningGroup(messages, assistantIndex, executionStart, activeRequest) {
  let group
  for (let i = assistantIndex; i >= 0; i--) {
    const message = messages[i]
    if (["idle", "compaction", "shell"].includes(message.type)) break
    if (message.type !== "assistant") continue
    const failed = message.error || message.retry
    if (message.time.created < executionStart || (i < assistantIndex && failed)) break
    for (let j = message.content.length - 1; j >= 0; j--) {
      const part = message.content[j]
      if (part.type !== "reasoning") {
        if (group) return group
        continue
      }
      if (!part.time || part.time.created < message.time.created) return group
      const { created, completed } = part.time
      if (!group) {
        if (completed !== undefined) group = { kind: "thought", blocks: 0, completedMs: 0 }
        else if (i === assistantIndex && activeRequest) group = { kind: "thinking", start: created, blocks: 0, completedMs: 0 }
        else return // Unfinished blocks without a live request have no reliable end time.
      } else if (completed === undefined) return group
      group.blocks++
      if (completed !== undefined) group.completedMs += Math.max(0, completed - created)
    }
    if (failed) break
  }
  return group
}

export function thinkingLabel(state, now) {
  if (!state) return
  const seconds = (ms) => `${Math.floor(ms / 1000)}s`
  const blocks = state.blocks > 1 ? ` · ${state.blocks} blocks` : ""
  if (state.kind === "thought") return `Thought: ${seconds(state.completedMs)}${blocks}`
  const elapsed = Math.max(0, now - state.start)
  if (state.kind === "waiting") return `Waiting: ${seconds(elapsed)}`
  const total = state.blocks > 1 ? ` · ${seconds(state.completedMs + elapsed)} total` : ""
  return `Thinking: ${seconds(elapsed)}${total}${blocks}`
}

export function contextLabel(messages, models) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.type === "compaction" && message.status === "completed") return
    if (message.type !== "assistant" || message.tokens === undefined) continue
    const { input, output, reasoning, cache } = message.tokens
    const tokens = input + output + reasoning + cache.read + cache.write
    if (tokens <= 0) return
    const model = models?.find(
      (model) => model.providerID === message.model.providerID && model.id === message.model.id,
    )
    const percent = model?.limit.context ? ` (${Math.round(tokens / model.limit.context * 100)}%)` : ""
    const count = tokens < 1_000 ? String(tokens) : tokenFormatter.format(tokens)
    return `${model?.name || message.model.id} · ${count}${percent}`
  }
}
