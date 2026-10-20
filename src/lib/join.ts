export function buildJoinUrl(
  token: string,
  tenantId: string,
  tastingId: string | null,
  baseUrl: string = window.location.href,
): string {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('join', token)
  url.searchParams.set('tenant', tenantId)
  if (tastingId) {
    url.searchParams.set('tasting', tastingId)
  }
  return url.toString()
}
