const PROMOTION_START = Date.parse('2026-10-06T14:35:00Z');
const ACTIVE_MS = 90 * 60 * 1000;
const CYCLE_MS = ACTIVE_MS + 5 * 60 * 1000;
function promotionAt(now: number) {
  const elapsed = Math.max(0, now - PROMOTION_START);
  const cycleStart = PROMOTION_START + Math.floor(elapsed / CYCLE_MS) * CYCLE_MS;
  const active = now < cycleStart + ACTIVE_MS;
  const nextChange = cycleStart + (active ? ACTIVE_MS : CYCLE_MS);
  return { active, nextChange, seconds: Math.max(0, Math.ceil((nextChange - now) / 1000)) };
}

export { promotionAt };
