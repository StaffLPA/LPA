import { useSyncExternalStore } from 'react';
import { useApp } from '@/context/AppContext';

export type ValdReportSelection = { cmjMeasurement?: string; leftMeasurement?: string; rightMeasurement?: string };
let owner: string | null = null;
let selection: ValdReportSelection = {};
const listeners = new Set<() => void>();
/** Session-only, account-scoped selections survive tab/card unmounts, never account changes. */
export function useValdReportSelection() {
  const { user } = useApp();
  const id = user?.id ?? null;
  if (owner !== id) { owner = id; selection = {}; }
  const value = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => selection, () => selection);
  return [value, (key: keyof ValdReportSelection, picked: string) => {
    selection = { ...selection, [key]: picked };
    listeners.forEach((cb) => cb());
  }] as const;
}
