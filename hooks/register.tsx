import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step } from '../types'

const steps = atom({ plugin: 'progress-band', key: 'steps' } as const, [] as Step[])
const since = atom({ plugin: 'progress-band', key: 'since' } as const, {} as Record<string, number>)
const tick = atom({ plugin: 'progress-band', key: 'tick' } as const, 0)
const lastAgent = atom({ plugin: 'progress-band', key: 'lastAgent' } as const, null as string | null)

const MARK = {
  done: { icon: '✓', color: 'green' },
  now: { icon: '●', color: 'yellow' },
  left: { icon: '○', color: 'gray' },
  blocked: { icon: '!', color: 'red' },
} as const

type Segment = { text: string; color?: string; link: string }

const width = (s: string) => [...s].reduce((n, c) => n + ((c.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1), 0)

const minutes = (from: number | undefined, now: number) =>
  from === undefined ? '' : ` · ${Math.floor((now - from) / 60000)}m`

const full = (list: Step[], start: Record<string, number>, now: number): Segment[] =>
  list.map((s, i) => ({
    text: `${MARK[s.state].icon} ${s.label}${s.state === 'now' ? minutes(start[s.label], now) : ''}`,
    color: MARK[s.state].color,
    link: i === 0 ? '' : s.state === 'done' || s.state === 'now' ? ' ─ ' : ' ┄ ',
  }))

// Narrow terminal: finished steps fold into a count, only the first remaining step is named.
const compact = (list: Step[], start: Record<string, number>, now: number): Segment[] => {
  const done = list.filter(s => s.state === 'done').length
  const left = list.filter(s => s.state === 'left')
  const kept = list.filter(s => s.state === 'now' || s.state === 'blocked').concat(left.slice(0, 1))
  const out: Segment[] = done ? [{ text: `✓×${done}`, color: 'green', link: '' }] : []
  for (const s of full(kept, start, now)) out.push({ ...s, link: out.length ? s.link || ' ┄ ' : '' })
  if (left.length > 1) out.push({ text: `+${left.length - 1}`, link: ' ┄ ' })
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'progress',
      description:
        "Shows the current multi-step task as a strip above the prompt. Call it when a task of 3+ steps starts and whenever a step starts, finishes or blocks, passing the full step list each time (short noun-phrase labels in the user's language). Pass an empty list when the task ends.",
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                state: { type: 'string', enum: ['done', 'now', 'left', 'blocked'] },
              },
              required: ['label', 'state'],
            },
          },
        },
        required: ['steps'],
      },
    })
    // ponytail: 30s redraw for the elapsed minutes, fine for a minute-resolution clock
    $.clock.every(30000, async () => {
      const now = await $.clock.now()
      await update($, tick, () => now)
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__progress-band__progress' }, async ($, e) => {
    const list = ((e as { steps?: Step[] }).steps ?? []).filter(s => s.state in MARK)
    const before = await read($, steps)
    const start = await read($, since)
    const now = await $.clock.now()
    const nextStart: Record<string, number> = {}
    for (const s of list) {
      if (s.state === 'now') nextStart[s.label] = start[s.label] ?? now
    }
    for (const s of list) {
      const wasBlocked = before.some(b => b.label === s.label && b.state === 'blocked')
      if (s.state === 'blocked' && !wasBlocked) $.ui.toast(`! ${s.label}`)
    }
    await update($, since, () => nextStart)
    await update($, tick, () => now)
    await update($, steps, () => list)
    return { result: `shown ${list.length} steps` }
  }).catch(() => ({ deny: 'progress-band: could not update the strip' }))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      const agent = await $.agent
        .list()
        .then(list => list.find(a => a.id === e.agentId))
        .catch(() => undefined)
      const name = agent?.description || agent?.type || 'subagent'
      const sec = Math.round(e.durationMs / 1000)
      const line = `${e.isAborted ? '✗' : '✓'} ${name} 완료 · ${sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`}`
      $.ui.toast(line)
      $.ui.log(line)
      await update($, lastAgent, () => line)
    }
    return result
  })

  // Background-task notifications also arrive as prompts; only the person's own message clears the line.
  on('prompt.submit', async ($, e, next) => {
    const kind = (e as { origin?: { kind?: string } }).origin?.kind
    if (kind === 'composer' || kind === 'bridge') await update($, lastAgent, () => null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)
    const agent = await read($, lastAgent)
    if (e.props.hasSurvey || (list.length === 0 && !agent)) {
      return next(e)
    }
    const start = await read($, since)
    const now = await read($, tick)
    const done = list.filter(s => s.state === 'done').length
    const count = list.length ? `  ${done}/${list.length}` : ''
    const tail = agent ? `${count}${list.length ? ' · ' : ''}${agent}` : count
    let segments = full(list, start, now)
    const fits = (segs: Segment[]) =>
      segs.reduce((n, s) => n + width(s.link + s.text), width(tail)) <= e.props.bodyColumns
    if (!fits(segments)) segments = compact(list, start, now)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexWrap="wrap">
        {segments.map((s, i) => (
          <Text key={`s${i}`}>
            <Text dimColor>{s.link}</Text>
            {s.color ? <Text color={s.color}>{s.text}</Text> : <Text dimColor>{s.text}</Text>}
          </Text>
        ))}
        <Text dimColor>{tail}</Text>
      </Box>
    )
  })
}
