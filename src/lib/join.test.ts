import { describe, expect, it } from 'vitest'
import { buildJoinUrl } from './join'

describe('buildJoinUrl', () => {
  it('replaces existing query/hash and includes the invite, tenant and tasting', () => {
    const url = buildJoinUrl(
      'invite-token',
      'tenant-1',
      'tasting-1',
      'https://app.example.com/beer/?foo=bar#section',
    )

    expect(url).toBe(
      'https://app.example.com/beer/?join=invite-token&tenant=tenant-1&tasting=tasting-1',
    )
  })

  it('omits the tasting when no tasting is selected', () => {
    const url = buildJoinUrl(
      'invite-token',
      'tenant-1',
      null,
      'https://app.example.com/?x=1',
    )

    expect(url).toBe(
      'https://app.example.com/?join=invite-token&tenant=tenant-1',
    )
  })
})
