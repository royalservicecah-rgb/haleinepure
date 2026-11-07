export type ExpectedOrder = { quantity: number; total: number }

export function isPersistedHaleineOrder(order: unknown, expected: ExpectedOrder): boolean {
  if (!order || typeof order !== 'object') return false
  const row = order as Record<string, unknown>
  return (
    typeof row.order_number === 'string' &&
    /^HAL-[0-9]{6}$/.test(row.order_number) &&
    row.store_id === 'destockage-haleine' &&
    row.source_domain === 'haleinepure.destockagerapide.com' &&
    row.currency === 'XOF' &&
    Number(row.quantity) === expected.quantity &&
    Number(row.total) === expected.total &&
    Number.isInteger(expected.quantity) &&
    expected.quantity >= 1 &&
    expected.quantity <= 3 &&
    Number.isFinite(expected.total) &&
    expected.total > 0
  )
}
