import { describe, expect, it } from 'vitest'
import { fetchAllPages } from './api'

type PageRow = { id: number }

type FakeResult = {
  data: PageRow[] | null
  error: unknown
  count: number | null
}

function fakeSource(total: number, serverCap = 1000, includeCount = true) {
  let calls = 0

  return {
    get calls() {
      return calls
    },
    makeQuery: () => ({
      range: async (from: number, to: number): Promise<FakeResult> => {
        calls += 1
        const size = Math.max(0, Math.min(to - from + 1, serverCap, total - from))

        return {
          data: Array.from({ length: size }, (_, index) => ({ id: from + index })),
          error: null,
          count: includeCount ? total : null,
        }
      },
    }),
  }
}

describe('fetchAllPages', () => {
  it('loads every row when the server caps each response at 1,000 rows', async () => {
    const source = fakeSource(5_195, 1_000)
    const rows = await fetchAllPages(source.makeQuery)

    expect(rows).toHaveLength(5_195)
    expect(rows[0]).toEqual({ id: 0 })
    expect(rows.at(-1)).toEqual({ id: 5_194 })
    expect(source.calls).toBe(6)
  })

  it('advances by rows actually returned when the server cap is lower than the page size', async () => {
    const source = fakeSource(5_195, 500)
    const rows = await fetchAllPages(source.makeQuery, 1_000)

    expect(rows).toHaveLength(5_195)
    expect(rows.at(-1)).toEqual({ id: 5_194 })
    expect(source.calls).toBe(11)
  })

  it('stops after an empty page when the server does not return a count', async () => {
    const source = fakeSource(1_450, 500, false)
    const rows = await fetchAllPages(source.makeQuery)

    expect(rows).toHaveLength(1_450)
    expect(source.calls).toBe(4)
  })

  it('handles an empty result', async () => {
    const source = fakeSource(0)
    const rows = await fetchAllPages(source.makeQuery)

    expect(rows).toEqual([])
    expect(source.calls).toBe(1)
  })

  it('surfaces a formatted query error', async () => {
    await expect(
      fetchAllPages<PageRow>(() => ({
        range: async () => ({
          data: null,
          error: { code: '42501', message: 'permission denied' },
          count: null,
        }),
      })),
    ).rejects.toThrow('You do not have permission to do that.')
  })
})
