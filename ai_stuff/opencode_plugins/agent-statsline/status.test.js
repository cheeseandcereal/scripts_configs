import { describe, expect, test } from "bun:test"
import { contextLabel, thinkingLabel, thinkingStatus, visibleMessages } from "./status.js"
import { assistant, model, reasoning, retry, session, usage } from "./test-fixtures.js"

const state = (messages, info = session(), running = true) =>
  thinkingStatus(visibleMessages(messages, info.revert?.messageID), info, running)

describe("reasoning", () => {
  test.each(["", "[REDACTED]", "Visible reasoning"])("times reasoning with text %j", (text) => {
    const result = state([assistant({ content: [reasoning(1_000, undefined, text)] })])
    expect(thinkingLabel(result, 3_900)).toBe("Thinking: 2s")
    expect(thinkingLabel(result, 500)).toBe("Thinking: 0s")
  })

  test("sums consecutive blocks, excludes gaps, and resets the active block's timer", () => {
    const message = assistant({ content: [reasoning(1_000, 13_200), reasoning(14_000, 17_800), reasoning(20_000)] })
    const active = state([message])
    expect(thinkingLabel(active, 22_300)).toBe("Thinking: 2s · 18s total · 3 blocks")
    message.content[2] = reasoning(20_000, 22_300)
    message.time.completed = 60_000
    expect(thinkingLabel(state([message], session(), false), 90_000)).toBe("Thought: 18s · 3 blocks")
  })

  test.each([
    { type: "text", text: "Output" },
    { type: "text", text: "" },
    { type: "tool", id: "tool", name: "shell", time: { created: 1_000 }, state: { status: "streaming", input: "" } },
  ])("starts a group after an output part: %j", (separator) => {
    const message = assistant({ content: [reasoning(0, 1_000), separator, reasoning(2_000, 3_000), reasoning(4_000)] })
    expect(thinkingLabel(state([message]), 5_000)).toBe("Thinking: 1s · 2s total · 2 blocks")
  })

  test("retains an active block through a text start or steering prompt", () => {
    const messages = [
      assistant({ content: [reasoning(1_000), { type: "text", text: "" }] }),
      { type: "user", id: "msg_02", text: "Focus on tests", time: { created: 2_000 } },
    ]
    expect(thinkingLabel(state(messages), 3_000)).toBe("Thinking: 2s")
  })

  test("groups across assistant messages until an output part separates them", () => {
    const previous = assistant({ time: { created: 0, completed: 1_000 }, content: [reasoning(0, 1_000)] })
    const current = assistant({ id: "msg_02", time: { created: 2_000 }, content: [reasoning(2_000)] })
    expect(thinkingLabel(state([previous, current]), 3_000)).toBe("Thinking: 1s · 2s total · 2 blocks")
    previous.content.push({ type: "text", text: "Output" })
    expect(thinkingLabel(state([previous, current]), 3_000)).toBe("Thinking: 1s")
  })

  test.each(["idle", "compaction", "shell"])("stops grouping at a %s boundary", (type) => {
    const messages = [
      assistant({ content: [reasoning(0, 1_000)] }),
      { type, id: "msg_02", time: { created: 1_000 } },
      assistant({ id: "msg_03", time: { created: 2_000 }, content: [reasoning(2_000, 3_000)] }),
    ]
    expect(thinkingLabel(state(messages, session(), false), 4_000)).toBe("Thought: 1s")
  })

  test("excludes incomplete or failed prior blocks", () => {
    const current = assistant({ id: "msg_02", time: { created: 2_000 }, content: [reasoning(2_000)] })
    for (const previous of [
      assistant({ content: [reasoning(0)] }),
      assistant({ content: [{ type: "reasoning", text: "" }] }),
      assistant({ content: [reasoning(0, 1_000)], error: { type: "provider", message: "Failed" } }),
      assistant({ content: [reasoning(0, 1_000)], retry: retry(2_000) }),
    ]) {
      expect(thinkingLabel(state([previous, current]), 3_000)).toBe("Thinking: 1s")
    }
  })

  test("freezes recorded durations on interruption and excludes later tool time", () => {
    const message = assistant({
      time: { created: 0, streamed: 15_000, completed: 60_000 },
      content: [reasoning(1_000, 13_200), { type: "tool", name: "shell", state: { status: "running" } }],
    })
    const idle = { type: "idle", id: "msg_02", outcome: "interrupted", time: { created: 60_000 } }
    expect(thinkingLabel(state([message], session(), true), 60_000)).toBe("Thought: 12s")
    expect(thinkingLabel(state([message, idle], session(), false), 90_000)).toBe("Thought: 12s")
  })

  test("hides unfinished blocks after the request or execution stops", () => {
    const message = assistant({ content: [reasoning(1_000)] })
    expect(state([message], session(), false)).toBeUndefined()
    for (const field of ["streamed", "completed"]) {
      expect(state([{ ...message, time: { created: 0, [field]: 2_000 } }])).toBeUndefined()
    }
    expect(state([{ ...message, error: { type: "provider", message: "Request failed" } }])).toBeUndefined()
    expect(state([assistant({ content: [{ type: "reasoning", text: "" }] })])).toBeUndefined()
  })

  test("uses separate execution and request waiting times", () => {
    expect(state([])).toEqual({ kind: "waiting", start: 0 })
    const messages = [
      assistant({ content: [reasoning(1_000, 2_000)], time: { created: 0, completed: 2_000 } }),
      assistant({ id: "msg_02", time: { created: 3_000 } }),
    ]
    expect(state(messages)).toEqual({ kind: "waiting", start: 3_000 })
    expect(thinkingLabel(state(messages), 4_900)).toBe("Waiting: 1s")
  })

  test("does not time retry backoff or retained reasoning from a prior attempt", () => {
    const message = assistant({ retry: retry(10_000) })
    expect(state([message])).toBeUndefined()
    const restarted = assistant({ time: { created: 3_000 }, content: [reasoning(1_000)] })
    expect(state([restarted])).toEqual({ kind: "waiting", start: 3_000 })
    restarted.content.push({ type: "text", text: "Response" })
    expect(state([restarted])).toBeUndefined()
    restarted.content.push(reasoning(4_000))
    expect(thinkingLabel(state([restarted]), 5_000)).toBe("Thinking: 1s")
  })

  test.each([
    { error: { type: "provider", message: "Interrupted stream" } },
    { retry: retry(14_000) },
  ])("does not revive failed reasoning during a text-only continuation: %j", (failure) => {
    const previous = assistant({
      ...failure,
      time: { created: 0, streamed: 12_000, completed: 12_000 },
      content: [reasoning(1_000, 12_000)],
    })
    expect(thinkingLabel(state([previous], session(), false), 14_000)).toBe("Thought: 11s")
    const current = assistant({ id: "msg_02", time: { created: 15_000 } })
    expect(thinkingLabel(state([previous, current]), 17_000)).toBe("Waiting: 2s")
    current.content.push({ type: "text", text: "Response" })
    expect(state([previous, current])).toBeUndefined()
    current.time.completed = 18_000
    expect(state([previous, current], session(), false)).toBeUndefined()
  })

  test("a failed text-only request does not revive an earlier successful thought", () => {
    const previous = assistant({ content: [reasoning(0, 1_000)] })
    const failed = assistant({
      id: "msg_02", time: { created: 2_000, completed: 3_000 },
      content: [{ type: "text", text: "Partial response" }],
      error: { type: "provider", message: "Failed" },
    })
    expect(state([previous, failed], session(), false)).toBeUndefined()
  })

  test("a concurrent user shell command does not hide reasoning", () => {
    const current = assistant({ content: [reasoning(1_000)] })
    const shell = { type: "shell", id: "msg_02", command: "sleep 1", time: { created: 2_000 } }
    expect(thinkingLabel(state([current, shell]), 3_000)).toBe("Thinking: 2s")
    current.content[0] = reasoning(1_000, 6_000)
    current.time.completed = 6_000
    expect(thinkingLabel(state([current, shell], session(), false), 10_000)).toBe("Thought: 5s")
  })

  test("does not restore stale thoughts when a later execution starts or stops", () => {
    const messages = [
      assistant({ content: [reasoning(0, 1_000)], time: { created: 0, completed: 1_000 } }),
      { type: "idle", id: "msg_02", outcome: "succeeded", time: { created: 1_000 } },
    ]
    expect(state(messages)).toBeUndefined()
    const next = session({ time: { created: 0, updated: 3_000, busy: 3_000, idle: 1_000 } })
    expect(state(messages, next)).toEqual({ kind: "waiting", start: 3_000 })
    messages.push({ type: "user", id: "msg_03", time: { created: 3_000 }, text: "Continue" })
    messages.push({ type: "idle", id: "msg_04", outcome: "interrupted", time: { created: 4_000 } })
    expect(state(messages, next, false)).toBeUndefined()
    const reverted = { ...next, revert: { messageID: "msg_03" } }
    expect(thinkingLabel(state(messages, reverted, false), 4_000)).toBe("Thought: 1s")
  })

  test("uses execution time as a boundary when idle messages are absent", () => {
    const info = session({ time: { created: 0, updated: 3_000, busy: 3_000 } })
    const messages = [
      assistant({ time: { created: 0, completed: 1_000 }, content: [reasoning(0, 1_000)] }),
    ]
    expect(state(messages, info)).toEqual({ kind: "waiting", start: 3_000 })
    expect(state(messages, info, false)).toBeUndefined()
    messages.push(assistant({ id: "msg_02", time: { created: 3_000 }, content: [reasoning(3_000)] }))
    expect(thinkingLabel(state(messages, info), 4_500)).toBe("Thinking: 1s")
  })

  test("times active requests without a busy timestamp", () => {
    const info = session({ time: { created: 0, updated: 3_000 } })
    expect(state([], info)).toBeUndefined()
    const message = assistant({ time: { created: 3_000 } })
    expect(state([message], info)).toEqual({ kind: "waiting", start: 3_000 })
    message.content.push(reasoning(4_000))
    expect(thinkingLabel(state([message], info), 5_000)).toBe("Thinking: 1s")
  })

  test("hides waiting and reasoning during compaction", () => {
    const compact = { type: "compaction", id: "msg_02", status: "running", time: { created: 1_000 } }
    expect(state([assistant(), compact])).toBeUndefined()
  })

  test.each(["running", "completed", "failed"])("clears earlier thinking after %s compaction, even before steering", (status) => {
    const messages = [
      assistant({ content: [reasoning(0, 1_000)] }),
      { type: "compaction", id: "msg_02", status, time: { created: 1_000 } },
      { type: "user", id: "msg_03", text: "Continue", time: { created: 2_000 } },
    ]
    expect(state(messages, session(), status === "running")).toBeUndefined()
  })

  test("uses idle boundaries for historical sessions without busy timestamps", () => {
    const historical = session({ time: { created: 0, updated: 4_000 } })
    const messages = [
      assistant({ content: [reasoning(0, 1_000)] }),
      { type: "idle", id: "msg_02", outcome: "succeeded", time: { created: 1_000 } },
    ]
    expect(thinkingLabel(state(messages, historical, false), 4_000)).toBe("Thought: 1s")
    messages.push({ type: "user", id: "msg_03", text: "Continue", time: { created: 3_000 } })
    messages.push({ type: "idle", id: "msg_04", outcome: "interrupted", time: { created: 4_000 } })
    expect(state(messages, historical, false)).toBeUndefined()
    expect(thinkingLabel(state(messages, { ...historical, revert: { messageID: "msg_03" } }), 4_000)).toBe("Thought: 1s")
  })
})

describe("context and visible history", () => {
  test("uses exact revert position and array order, including missing boundaries", () => {
    const messages = [
      assistant({ id: "msg_z", tokens: usage(393_400), content: [reasoning(0, 1_000)] }),
      assistant({ id: "msg_a", tokens: usage(200_000), content: [reasoning(2_000, 3_000)] }),
    ]
    expect(contextLabel(visibleMessages(messages, "msg_a"), [model])).toBe("GPT-6 Astra · 393.4K (39%)")
    expect(contextLabel(visibleMessages(messages), [model])).toBe("GPT-6 Astra · 200.0K (20%)")
    expect(visibleMessages(messages, "missing")).toEqual([])
    expect(state(messages, session({ revert: { messageID: "missing" } }))).toBeUndefined()
    expect(thinkingLabel(state(messages, session({ revert: { messageID: "msg_a" } }), false), 5_000)).toBe("Thought: 1s")
  })

  test("sums all token categories and selects the measured provider and model", () => {
    const measured = assistant({ tokens: { input: 100_000, output: 2_000, reasoning: 400, cache: { read: 290_000, write: 1_000 } } })
    const other = { ...model, providerID: "other", name: "Other model", limit: { context: 200_000 } }
    expect(contextLabel([measured], [other, model])).toBe("GPT-6 Astra · 393.4K (39%)")
  })

  test.each([
    [999, "999"],
    [1_000, "1.0K"],
    [1_150, "1.2K"],
    [1_950, "2.0K"],
    [999_949, "999.9K"],
    [999_950, "1.0M"],
    [1_150_000, "1.2M"],
  ])("formats %i tokens as %s", (count, expected) => {
    expect(contextLabel([assistant({ tokens: usage(count) })], undefined)).toBe(`model · ${expected}`)
  })

  test("handles unavailable capacity, small usage, and over-capacity usage", () => {
    expect(contextLabel([assistant({ tokens: usage(393_400) })], [{ ...model, limit: { context: 0 } }])).toBe("GPT-6 Astra · 393.4K")
    expect(contextLabel([assistant({ tokens: usage(1) })], [model])).toBe("GPT-6 Astra · 1 (0%)")
    expect(contextLabel([assistant({ tokens: usage(1_010_000) })], [model])).toBe("GPT-6 Astra · 1.0M (101%)")
  })

  test("retains the latest measurement until another measurement, including zero, arrives", () => {
    const messages = [assistant({ tokens: usage(393_400) }), assistant({ id: "msg_02" })]
    expect(contextLabel(messages, [model])).toBe("GPT-6 Astra · 393.4K (39%)")
    messages[1].tokens = usage(0)
    expect(contextLabel(messages, [model])).toBeUndefined()
  })

  test("clears context after completed compaction but retains it during running or failed compaction", () => {
    const messages = [assistant({ tokens: usage(393_400) })]
    const compact = { type: "compaction", id: "msg_02", time: { created: 1_000 } }
    for (const status of ["running", "failed"]) {
      expect(contextLabel([...messages, { ...compact, status }], [model])).toBe("GPT-6 Astra · 393.4K (39%)")
    }
    messages.push({ ...compact, status: "completed", tokens: usage(1) })
    expect(contextLabel(messages, [model])).toBeUndefined()
    expect(contextLabel(visibleMessages(messages, "msg_02"), [model])).toBe("GPT-6 Astra · 393.4K (39%)")
    messages.push(assistant({ id: "msg_03", tokens: usage(20_000) }))
    expect(contextLabel(messages, [model])).toBe("GPT-6 Astra · 20.0K (2%)")
  })
})
