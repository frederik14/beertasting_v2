import type { TenantMembership } from '../lib/types'

type Props = {
  memberships: TenantMembership[]
  selectedTenantId: string
  onSelect: (tenantId: string) => void
  disabled?: boolean
}

export function TenantSwitcher({
  memberships,
  selectedTenantId,
  onSelect,
  disabled = false,
}: Props) {
  return (
    <label className="field-group compact inline-field tenant-switcher">
      <span>Group</span>
      <select
        value={selectedTenantId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={disabled}
      >
        {memberships.map((membership) => (
          <option key={membership.tenant.id} value={membership.tenant.id}>
            {membership.tenant.name}
          </option>
        ))}
      </select>
    </label>
  )
}
