import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step } from '../types'

const steps = atom({ plugin: 'progress-band', key: 'steps' } as const, [] as Step[])

const MARK = {
  done: { icon: '✓', color: 'green' },
  now: { icon: '●', color: 'yellow' },
  left: { icon: '○', color: 'gray' },
  blocked: { icon: '!', color: 'red' },
} as const

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
    return next(e)
  })

  on('tool.call', { tool: 'mcp__progress-band__progress' }, async ($, e) => {
    const list = (e as { steps?: Step[] }).steps ?? []
    await update($, steps, () => list)
    return { result: `shown ${list.length} steps` }
  }).catch(() => ({ deny: 'progress-band: could not update the strip' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)
    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const done = list.filter(s => s.state === 'done').length
    return (
      <Box flexWrap="wrap">
        {list.map((s, i) => {
          const mark = MARK[s.state] ?? MARK.left
          const link = i === 0 ? '' : s.state === 'done' || s.state === 'now' ? ' ─ ' : ' ┄ '
          return (
            <Text key={`s${i}`}>
              <Text dimColor>{link}</Text>
              <Text color={mark.color}>
                {mark.icon} {s.label}
              </Text>
            </Text>
          )
        })}
        <Text dimColor>
          {'  '}
          {done}/{list.length}
        </Text>
      </Box>
    )
  })
}
