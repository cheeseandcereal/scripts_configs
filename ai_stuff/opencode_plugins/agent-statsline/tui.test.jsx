import { afterEach, expect, jest, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import plugin, { Status } from "./tui.jsx"
import { assistant, model, reasoning, session, usage } from "./test-fixtures.js"

const muted = RGBA.fromInts(150, 150, 150)
const warning = RGBA.fromInts(240, 200, 80)
const theme = { text: { muted, feedback: { warning: { base: warning } } } }

function createContext({
  getSession = (id) => session({ id, parentID: id === "ses_root" ? undefined : "ses_root" }),
  messages = () => [],
  status = () => "running",
  models = () => [model],
  slot,
} = {}) {
  return {
    theme,
    data: {
      session: { get: getSession, status, message: { list: messages } },
      location: { model: { list: models } },
    },
    ui: { slot },
  }
}

async function frame(app, expected) {
  await app.renderOnce()
  return app.waitForFrame((text) =>
    text.split("\n").map((line) => line.trim()).join("\n").trimEnd() === expected,
  )
}

function statusTimers(intervals) {
  // The renderer also owns intervals; the status refresh runs every 100 ms.
  return intervals.mock.results
    .filter((_, index) => intervals.mock.calls[index][1] === 100)
    .map((result) => result.value)
}

function timerWasCleared(cleared, timer) {
  // Distinct Bun timer handles can compare equal structurally.
  return cleared.mock.calls.some(([handle]) => handle === timer)
}

function Footer(props) {
  return (
    <box width="100%" flexDirection="row" justifyContent="space-between" gap={2}>
      <box flexGrow={1} flexShrink={1} minWidth={0}><text wrapMode="none">/workspace</text></box>
      {props.children}
      <text wrapMode="none" flexShrink={0}>278.2K (26%) · $55.34</text>
      <text wrapMode="none" flexShrink={0}>ctrl+p commands</text>
    </box>
  )
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

test("selects status slots, suppresses footer details, and stops timers on view unmount", async () => {
  jest.useFakeTimers({ now: 14_000 })
  const intervals = jest.spyOn(globalThis, "setInterval")
  const cleared = jest.spyOn(globalThis, "clearInterval")
  const [sessionID, setSessionID] = createSignal("ses_root")
  const [loaded, setLoaded] = createSignal(false)
  const [mode, setMode] = createSignal("normal")
  const [showDetails, setShowDetails] = createSignal(true)
  const [mounted, setMounted] = createSignal(true)
  let child, footer
  const context = createContext({
    getSession: (id) => loaded() && id
      ? session({ id, parentID: id === "ses_root" ? undefined : "ses_root" })
      : undefined,
    messages: (id) => [assistant({ tokens: usage(393_400), content: [reasoning(id === "ses_root" ? 1_000 : 2_000)] })],
    slot: (claim) => {
      if (claim.append === "session.composer.top") child = claim.render
      else if (claim.after === "prompt.footer.file") footer = claim.render
      else throw new Error("Unexpected status slot")
    },
  })
  plugin.setup(context)
  expect(child).toBeFunction()
  expect(footer).toBeFunction()
  await using app = await testRender(() => (
    <Show when={mounted()}>
      <box>
        {child({ get sessionID() { return sessionID() } })}
        <text>picker</text>
        <box flexDirection="row">
          <text>footer: </text>
          {footer({
            get sessionID() { return sessionID() },
            get mode() { return mode() },
            get showDetails() { return showDetails() },
          })}
        </box>
      </box>
    </Show>
  ), { width: 100, height: 4 })

  await frame(app, "picker\nfooter:")
  expect(statusTimers(intervals)).toEqual([])
  setLoaded(true)
  await frame(app, "picker\nfooter: Thinking: 13s")
  const rootTimer = statusTimers(intervals).at(-1)
  expect(rootTimer).toBeDefined()

  setSessionID("ses_child")
  await frame(app, "GPT-6 Astra · 393.4K (39%) · Thinking: 12s\npicker\nfooter:")
  expect(timerWasCleared(cleared, rootTimer)).toBe(true)
  const childTimer = statusTimers(intervals).at(-1)
  expect(childTimer).toBeDefined()
  setSessionID("ses_root")
  await frame(app, "picker\nfooter: Thinking: 13s")
  expect(timerWasCleared(cleared, childTimer)).toBe(true)

  const shellTimer = statusTimers(intervals).at(-1)
  setMode("shell")
  await frame(app, "picker\nfooter:")
  expect(timerWasCleared(cleared, shellTimer)).toBe(true)
  setMode("normal")
  await frame(app, "picker\nfooter: Thinking: 13s")
  const detailsTimer = statusTimers(intervals).at(-1)
  setShowDetails(false)
  await frame(app, "picker\nfooter:")
  expect(timerWasCleared(cleared, detailsTimer)).toBe(true)
  setShowDetails(true)
  await frame(app, "picker\nfooter: Thinking: 13s")
  const viewTimer = statusTimers(intervals).at(-1)
  expect(timerWasCleared(cleared, viewTimer)).toBe(false)
  setMounted(false)
  await frame(app, "")
  for (const timer of statusTimers(intervals)) expect(timerWasCleared(cleared, timer)).toBe(true)
})

test("updates Waiting to Thinking to Thought and stops timing while a tool runs", async () => {
  jest.useFakeTimers({ now: 13_000 })
  const intervals = jest.spyOn(globalThis, "setInterval")
  const cleared = jest.spyOn(globalThis, "clearInterval")
  const [messages, setMessages] = createSignal([])
  const context = createContext({
    getSession: () => session({ time: { created: 0, updated: 1_000, busy: 1_000 } }),
    messages,
  })
  await using app = await testRender(() => <Status context={context} sessionID="ses_root" />, { width: 60, height: 2 })

  await frame(app, "Waiting: 12s")
  const executionTimer = statusTimers(intervals).at(-1)
  expect(executionTimer).toBeDefined()
  jest.advanceTimersByTime(1_000)
  await frame(app, "Waiting: 13s")
  setMessages([assistant({ time: { created: 14_000 } })])
  await frame(app, "Waiting: 0s")
  expect(timerWasCleared(cleared, executionTimer)).toBe(true)
  jest.advanceTimersByTime(1_000)
  await frame(app, "Waiting: 1s")

  const requestTimer = statusTimers(intervals).at(-1)
  setMessages([assistant({ time: { created: 14_000 }, content: [reasoning(15_000)] })])
  await frame(app, "Thinking: 0s")
  expect(timerWasCleared(cleared, requestTimer)).toBe(true)
  jest.advanceTimersByTime(2_500)
  await frame(app, "Thinking: 2s")
  const thinkingTimer = statusTimers(intervals).at(-1)
  setMessages([assistant({
    time: { created: 14_000, streamed: 17_500 },
    content: [
      reasoning(15_000, 17_500),
      { type: "tool", id: "tool", name: "shell", time: { created: 17_500 }, state: { status: "running", input: {}, metadata: {} } },
    ],
  })])
  await frame(app, "Thought: 2s")
  expect(timerWasCleared(cleared, thinkingTimer)).toBe(true)
  jest.advanceTimersByTime(40_000)
  await frame(app, "Thought: 2s")
})

test("resets the live timer per consecutive block while accumulating the total", async () => {
  jest.useFakeTimers({ now: 14_000 })
  const first = reasoning(1_000, 13_200)
  const [message, setMessage] = createSignal(assistant({ content: [first, reasoning(14_000)] }))
  const context = createContext({ messages: () => [message()] })
  await using app = await testRender(() => <Status context={context} sessionID="ses_root" />, { width: 80, height: 2 })

  await frame(app, "Thinking: 0s · 12s total · 2 blocks")
  jest.advanceTimersByTime(1_800)
  await frame(app, "Thinking: 1s · 14s total · 2 blocks")
  jest.advanceTimersByTime(200)
  const second = reasoning(14_000, 15_800)
  setMessage(assistant({ content: [first, second, reasoning(16_000)] }))
  await frame(app, "Thinking: 0s · 14s total · 3 blocks")
  jest.advanceTimersByTime(1_500)
  await frame(app, "Thinking: 1s · 15s total · 3 blocks")
  const third = reasoning(16_000, 17_500)
  setMessage(assistant({ content: [first, second, third, { type: "text", text: "Output" }] }))
  await frame(app, "Thought: 15s · 3 blocks")
  jest.advanceTimersByTime(500)
  setMessage(assistant({ content: [...message().content, reasoning(18_000)] }))
  await frame(app, "Thinking: 0s")
})

test("orders and colors child context and reasoning, and collapses an empty status row", async () => {
  jest.useFakeTimers({ now: 3_300 })
  const both = assistant({ tokens: usage(393_400), content: [reasoning(1_000)] })
  const [message, setMessage] = createSignal(both)
  const context = createContext({ messages: () => [message()] })
  await using app = await testRender(() => (
    <box><Status context={context} sessionID="ses_child" /><text>picker</text></box>
  ), { width: 100, height: 4 })

  await frame(app, "GPT-6 Astra · 393.4K (39%) · Thinking: 2s\npicker")
  const spans = app.captureSpans().lines[0].spans
  const coloredText = (color) => spans.filter(({ fg }) => fg.equals(color)).map(({ text }) => text).join("").trim()
  expect(coloredText(muted)).toBe("GPT-6 Astra · 393.4K (39%) ·")
  expect(coloredText(warning)).toBe("Thinking: 2s")

  setMessage(assistant({ tokens: usage(393_400), time: { created: 0, completed: 2_000 } }))
  await frame(app, "GPT-6 Astra · 393.4K (39%)\npicker")
  setMessage(assistant({ content: [reasoning(1_000)] }))
  await frame(app, "Thinking: 2s\npicker")
  setMessage(assistant({ time: { created: 0, completed: 2_000 } }))
  await frame(app, "picker")
  setMessage(both)
  await frame(app, "GPT-6 Astra · 393.4K (39%) · Thinking: 2s\npicker")
})

test("follows different child histories, token arrival, and location-specific model loading", async () => {
  const [sessionID, setSessionID] = createSignal("ses_child")
  const [childMessages, setChildMessages] = createSignal([assistant({ content: [reasoning(1_000, 3_000)] })])
  const nestedMessages = [assistant({ tokens: usage(100_000), content: [reasoning(1_000, 6_000)] })]
  const [loaded, setLoaded] = createSignal(false)
  const catalogs = {
    "/child": [model],
    "/nested": [{ ...model, name: "Nested model", limit: { context: 500_000 } }],
  }
  const context = createContext({
    getSession: (id) => session({
      id,
      parentID: id === "ses_child" ? "ses_root" : "ses_child",
      location: { directory: id === "ses_child" ? "/child" : "/nested" },
    }),
    status: () => "idle",
    messages: (id) => id === "ses_child" ? childMessages() : nestedMessages,
    models: (location) => loaded() ? catalogs[location.directory] : undefined,
  })
  await using app = await testRender(() => <Status context={context} sessionID={sessionID()} />, { width: 80, height: 2 })

  await frame(app, "Thought: 2s")
  setChildMessages([assistant({ tokens: usage(393_400), content: [reasoning(1_000, 3_000)] })])
  await frame(app, "model · 393.4K · Thought: 2s")
  setLoaded(true)
  await frame(app, "GPT-6 Astra · 393.4K (39%) · Thought: 2s")
  setSessionID("ses_nested")
  await frame(app, "Nested model · 100.0K (20%) · Thought: 5s")
  setChildMessages([assistant({ tokens: usage(200_000), content: [reasoning(1_000, 4_000)] })])
  setSessionID("ses_child")
  await frame(app, "GPT-6 Astra · 200.0K (20%) · Thought: 3s")
})

test.each([60, 100])("keeps status, usage, and commands on one line in a %i-column footer", async (width) => {
  jest.useFakeTimers({ now: 13_200 })
  const context = createContext({
    messages: () => [assistant({ content: [reasoning(0, 10_000), reasoning(11_000)] })],
  })
  await using app = await testRender(() => (
    <Footer><Status context={context} sessionID="ses_root" inline /></Footer>
  ), { width, height: 3 })

  await app.renderOnce()
  const rendered = await app.waitForFrame((text) => text.includes("Thinking: 2s") && text.includes("ctrl+p commands"))
  const lines = rendered.split("\n").map((line) => line.trim()).filter(Boolean)
  expect(lines).toHaveLength(1)
  expect(lines[0]).toContain("278.2K (26%) · $55.34")
  expect(lines[0].indexOf("Thinking:")).toBeLessThan(lines[0].indexOf("278.2K"))
  expect(lines[0].indexOf("278.2K")).toBeLessThan(lines[0].indexOf("ctrl+p commands"))
  if (width === 60) expect(lines[0]).not.toContain("2 blocks")
  else expect(lines[0]).toContain("Thinking: 2s · 12s total · 2 blocks")
})

test("clips combined child status to one line above the picker in a narrow pane", async () => {
  jest.useFakeTimers({ now: 13_200 })
  const context = createContext({
    messages: () => [assistant({ tokens: usage(393_400), content: [reasoning(0, 10_000), reasoning(11_000)] })],
  })
  await using app = await testRender(() => (
    <box><Status context={context} sessionID="ses_child" /><text>picker</text></box>
  ), { width: 50, height: 4 })

  await app.renderOnce()
  const rendered = await app.waitForFrame((text) => text.includes("GPT-6 Astra · 393.4K (39%) · Thinking: 2s") && text.includes("picker"))
  const lines = rendered.split("\n").map((line) => line.trim()).filter(Boolean)
  expect(lines).toHaveLength(2)
  expect(lines[0]).toStartWith("GPT-6 Astra · 393.4K (39%) · Thinking: 2s")
  expect(lines[0]).not.toContain("2 blocks")
  expect(lines[1]).toBe("picker")
})
