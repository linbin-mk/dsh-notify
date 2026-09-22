import { constants, accessSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-notify'
export const inject = ['agents', 'settings', 'webServer']

export const Config = z.object({
  enabled: z.boolean().default(true),
  questionMarkers: z.boolean().default(true),
  approvalMarkers: z.boolean().default(true),
  sweep: z.boolean().default(true),
})

const helperPath = fileURLToPath(new URL('./native/dsh-notify-menubar', import.meta.url))
const SHUTDOWN_GRACE_MS = 1_000

function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise(resolve => { child.once('close', resolve) })
}

function delay(milliseconds) {
  return new Promise(resolve => { setTimeout(resolve, milliseconds) })
}

/** Resolve the loopback origin used by this Harness process's Web client. */
export function webClientOrigin(ctx) {
  return `http://127.0.0.1:${String(ctx.webServer.port)}`
}

/** Launch the package-owned AppKit process and expose its count protocol. */
export function launchMenuBarHelper(logger, webClientOrigin, spawnProcess = spawn) {
  if (process.platform !== 'darwin') {
    throw new Error('dsh-notify supports macOS only')
  }
  accessSync(helperPath, constants.X_OK)

  const child = spawnProcess(helperPath, [], {
    stdio: ['pipe', 'ignore', 'pipe'],
    env: { LANG: process.env.LANG ?? 'en_US.UTF-8' },
  })
  let closing = false
  let writable = true

  child.once('error', error => {
    writable = false
    if (!closing) logger.warn(`dsh-notify: menu bar helper failed: ${String(error)}`)
  })
  child.stdin.on('error', error => {
    writable = false
    if (!closing) logger.warn(`dsh-notify: menu bar helper input failed: ${String(error)}`)
  })
  child.stderr.on('data', chunk => {
    const message = String(chunk).trim()
    if (message.length > 0) logger.warn(`dsh-notify: menu bar helper: ${message}`)
  })
  child.once('exit', (code, signal) => {
    writable = false
    if (!closing) {
      logger.warn(`dsh-notify: menu bar helper exited unexpectedly (${signal ?? `code ${String(code)}`})`)
    }
  })

  const send = message => {
    if (!writable || child.stdin.destroyed) return
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  send({ type: 'url', url: webClientOrigin })

  return {
    setCount(count) {
      send({ type: 'count', count })
    },
    setMarkers(markers) {
      send({ type: 'markers', markers })
    },
    setSweepEnabled(enabled) {
      send({ type: 'sweep', sweep: enabled })
    },
    async close() {
      if (closing) return waitForClose(child)
      closing = true
      send({ type: 'quit' })
      child.stdin.end()

      const closed = waitForClose(child)
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([closed, delay(SHUTDOWN_GRACE_MS)])
      }
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([closed, delay(SHUTDOWN_GRACE_MS)])
      }
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await closed
    },
  }
}

/** Track the authoritative live Agent states and publish every count change. */
export function observeRunningAgents(ctx, publish) {
  const running = new Set(
    ctx.agents.list().filter(agent => agent.status === 'running'),
  )
  let lastCount
  const publishIfChanged = () => {
    if (lastCount === running.size) return
    lastCount = running.size
    publish(lastCount)
  }

  const disposeStatus = ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'running') running.add(agent)
    else running.delete(agent)
    publishIfChanged()
  })
  const disposeAgent = ctx.on('agent/disposed', ({ agent }) => {
    running.delete(agent)
    publishIfChanged()
  })
  publishIfChanged()

  return () => {
    disposeStatus()
    disposeAgent()
  }
}

/** Track pending question and approval requests without claiming either waterfall. */
export function observePendingInteractions(ctx, publish) {
  const pending = { Q: 0, S: 0 }
  const observe = (event, marker) => ctx.on(event, async (_request, next) => {
    pending[marker] += 1
    publish({ ...pending })
    try {
      return await next()
    } finally {
      pending[marker] -= 1
      publish({ ...pending })
    }
  }, { global: true, prepend: true })
  const disposeQuestion = observe('user-questions/request', 'Q')
  const disposeApproval = observe('approval/request', 'S')

  return () => {
    disposeQuestion()
    disposeApproval()
  }
}

/** Own one optional helper while serialized settings changes arrive. */
export class MenuBarIndicator {
  constructor(logger, enabled, webClientOrigin, launch = launchMenuBarHelper, options = {}) {
    this.logger = logger
    this.launch = launch
    this.webClientOrigin = webClientOrigin
    this.runningCount = 0
    this.markerCounts = { Q: 0, S: 0 }
    this.questionMarkers = options.questionMarkers ?? true
    this.approvalMarkers = options.approvalMarkers ?? true
    this.sweep = options.sweep ?? true
    this.desired = enabled
    this.helper = enabled ? launch(logger, webClientOrigin) : undefined
    this.tail = Promise.resolve()
    this.disposed = false
    this.publishPresentation()
  }

  setCount(count) {
    this.runningCount = count
    this.publishPresentation()
  }

  setMarkerCounts(counts) {
    this.markerCounts = counts
    this.publishPresentation()
  }

  setQuestionMarkers(enabled) {
    this.questionMarkers = enabled
    this.publishPresentation()
  }

  setApprovalMarkers(enabled) {
    this.approvalMarkers = enabled
    this.publishPresentation()
  }

  setSweepEnabled(enabled) {
    this.sweep = enabled
    this.publishPresentation()
  }

  publishPresentation() {
    const markers = `${this.questionMarkers ? 'Q'.repeat(this.markerCounts.Q) : ''}${this.approvalMarkers ? 'S'.repeat(this.markerCounts.S) : ''}`
    this.helper?.setCount(markers.length === 0 ? this.runningCount : markers.length)
    this.helper?.setMarkers(markers)
    this.helper?.setSweepEnabled(markers.length > 0 && this.sweep)
  }

  setEnabled(enabled) {
    if (this.disposed) return Promise.resolve()
    this.desired = enabled
    const task = this.tail.catch(() => {}).then(async () => {
      if (this.disposed) return
      if (this.desired && this.helper === undefined) {
        this.helper = this.launch(this.logger, this.webClientOrigin)
        this.publishPresentation()
      } else if (!this.desired && this.helper !== undefined) {
        const helper = this.helper
        this.helper = undefined
        await helper.close()
      }
    })
    this.tail = task
    return task
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    this.desired = false
    await this.tail.catch(() => {})
    if (this.helper === undefined) return
    const helper = this.helper
    this.helper = undefined
    await helper.close()
  }
}

/** Mount the configurable macOS menu bar indicator for this Harness process. */
export function apply(ctx, config = { enabled: true }) {
  const settings = ctx.settings.register('dsh-notify', Config, { base: config })
  ctx.effect(() => {
    const current = settings.get()
    const indicator = new MenuBarIndicator(ctx.logger, current.enabled, webClientOrigin(ctx), launchMenuBarHelper, current)
    const stopObserving = observeRunningAgents(ctx, count => { indicator.setCount(count) })
    const stopInteractions = observePendingInteractions(ctx, counts => { indicator.setMarkerCounts(counts) })
    const stopWatching = settings.watch(next => {
      indicator.setQuestionMarkers(next.questionMarkers)
      indicator.setApprovalMarkers(next.approvalMarkers)
      indicator.setSweepEnabled(next.sweep)
      indicator.setEnabled(next.enabled)
    })
    return async () => {
      stopWatching()
      stopInteractions()
      stopObserving()
      await indicator.dispose()
    }
  })
}
