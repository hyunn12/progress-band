export type Step = { label: string; state: 'done' | 'now' | 'left' | 'blocked' }

declare module 'claude-code' {
  interface PluginState {
    'progress-band': { steps: Step[]; since: Record<string, number>; tick: number }
  }
}
