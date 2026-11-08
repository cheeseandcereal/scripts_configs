import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { contextLabel, thinkingLabel, thinkingStatus, visibleMessages } from "./status.js"

export function Status(props) {
  const data = props.context.data
  const session = () => data.session.get(props.sessionID)
  const messages = createMemo(() =>
    visibleMessages(data.session.message.list(props.sessionID), session()?.revert?.messageID),
  )
  const thinking = createMemo(() =>
    thinkingStatus(messages(), session(), data.session.status(props.sessionID) === "running"),
  )
  const prefix = createMemo(() => session()?.parentID
    ? contextLabel(messages(), data.location.model.list(session().location))
    : undefined,
  )
  const start = createMemo(() => thinking()?.start)
  const [now, setNow] = createSignal(Date.now())

  createEffect(() => {
    if (start() === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    onCleanup(() => clearInterval(timer))
  })

  const label = createMemo(() => thinkingLabel(thinking(), now()))
  return (
    <Show when={prefix() || label()}>
      <box paddingLeft={props.inline ? 0 : 3} flexShrink={props.inline ? 1 : 0} minWidth={0}>
        <text fg={props.context.theme.text.muted} wrapMode="none">
          {prefix()}
          <Show when={prefix() && label()}>{" · "}</Show>
          <span style={{ fg: thinking()?.kind === "thinking"
            ? props.context.theme.text.feedback.warning.base
            : props.context.theme.text.muted }}>
            {label()}
          </span>
        </text>
      </box>
    </Show>
  )
}

export default {
  id: "local.agent-statsline",
  setup(context) {
    context.ui.slot({
      after: "prompt.footer.file",
      render(props) {
        const session = () => props.sessionID ? context.data.session.get(props.sessionID) : undefined
        return (
          <Show when={props.mode === "normal" && props.showDetails && session() && !session().parentID}>
            <Status context={context} sessionID={props.sessionID} inline />
          </Show>
        )
      },
    })
    context.ui.slot({
      append: "session.composer.top",
      render: (props) => (
        <Show when={context.data.session.get(props.sessionID)?.parentID}>
          <Status context={context} sessionID={props.sessionID} />
        </Show>
      ),
    })
  },
}
