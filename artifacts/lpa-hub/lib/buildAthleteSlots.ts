export const BUILD_SLOTS_KEY = 'lpa-build-athlete-slots:v1';
export type BuildSlotConfig = { slots: (string | null)[]; activeAthleteId: string | null };
export const emptyBuildSlots = (): BuildSlotConfig => ({ slots: [null, null, null, null], activeAthleteId: null });

/** Stored IDs are conveniences, never authorization grants. Reconcile with the live public roster. */
export function readBuildSlots(raw: string | null, eligibleIds: readonly string[], legacyId?: string | null): BuildSlotConfig {
  const eligible = new Set(eligibleIds);
  let parsed: Partial<BuildSlotConfig> | null = null;
  if (raw) {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !Array.isArray((value as BuildSlotConfig).slots)) {
      throw new Error('Saved athlete slots could not be read.');
    }
    parsed = value as BuildSlotConfig;
  }
  const seen = new Set<string>();
  const slots = Array.from({ length: 4 }, (_, i) => {
    const id = parsed?.slots?.[i] ?? (!parsed && i === 0 ? legacyId : null);
    if (typeof id !== 'string' || !eligible.has(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  return { slots, activeAthleteId: typeof parsed?.activeAthleteId === 'string' && seen.has(parsed.activeAthleteId)
    ? parsed.activeAthleteId : slots.find(Boolean) ?? null };
}

export function assignBuildSlot(config: BuildSlotConfig, index: number, athleteId: string | null): BuildSlotConfig {
  if (!Number.isInteger(index) || index < 0 || index > 3) return config;
  if (athleteId && config.slots.some((id, i) => id === athleteId && i !== index)) return config;
  const slots = Array.from({ length: 4 }, (_, i) => i === index ? athleteId : config.slots[i] ?? null);
  return { slots, activeAthleteId: athleteId ?? (slots.includes(config.activeAthleteId)
    ? config.activeAthleteId : slots.find(Boolean) ?? null) };
}
