import { Elysia } from 'elysia'

const TIMING_BUFFER_SIZE = 100 as const

type RequestTimingStats = {
  p95: number
  p50: number
  avg: number
  count: number
}

export class RequestTimingBuffer {
  private readonly samples = new Float64Array(TIMING_BUFFER_SIZE)
  private writeIndex = 0
  private count = 0

  public record(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return
    }

    this.samples[this.writeIndex] = durationMs
    this.writeIndex = (this.writeIndex + 1) % TIMING_BUFFER_SIZE

    if (this.count < TIMING_BUFFER_SIZE) {
      this.count += 1
    }
  }

  public getP95(): number {
    return this.getPercentile(95)
  }

  public getStats(): RequestTimingStats {
    if (this.count === 0) {
      return {
        p95: 0,
        p50: 0,
        avg: 0,
        count: 0,
      }
    }

    let total = 0
    for (let i = 0; i < this.count; i += 1) {
      total += this.samples[i]
    }

    const avg = Number((total / this.count).toFixed(2))

    return {
      p95: this.getP95(),
      p50: this.getPercentile(50),
      avg,
      count: this.count,
    }
  }

  private getPercentile(percentile: number): number {
    if (this.count === 0) {
      return 0
    }

    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b)
    const rank = Math.ceil((percentile / 100) * sorted.length)
    const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))

    return Number(sorted[index].toFixed(2))
  }
}

export const requestTimingBuffer = new RequestTimingBuffer()

type TimingStore = {
  requestStart?: number
}

export function requestTimingPlugin(): Elysia {
  return new Elysia({ name: 'request-timing' })
    .onBeforeHandle(({ store }: { store: TimingStore }) => {
      store.requestStart = performance.now()
    })
    .onAfterResponse(({ store }: { store: TimingStore }) => {
      const { requestStart } = store
      if (typeof requestStart !== 'number') {
        return
      }

      requestTimingBuffer.record(performance.now() - requestStart)
    })
}
