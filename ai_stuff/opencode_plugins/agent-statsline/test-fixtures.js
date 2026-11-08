export const model = { id: "model", providerID: "provider", name: "GPT-6 Astra", limit: { context: 1_000_000 } }

export function usage(input = 0) {
  return { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
}

export function session(overrides = {}) {
  return {
    id: "ses_root",
    projectID: "project",
    location: { directory: "/workspace" },
    time: { created: 0, updated: 0, busy: 0 },
    cost: 0,
    tokens: usage(),
    ...overrides,
  }
}

export function assistant(overrides = {}) {
  return {
    id: "msg_01",
    type: "assistant",
    time: { created: 0 },
    model: { providerID: model.providerID, id: model.id },
    agent: "general",
    content: [],
    ...overrides,
  }
}

export function reasoning(created, completed, text = "") {
  return { type: "reasoning", text, time: { created, completed } }
}

export function retry(at) {
  return { attempt: 1, at, error: { type: "provider", message: "Request failed" } }
}
