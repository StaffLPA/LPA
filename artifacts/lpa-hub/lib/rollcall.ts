import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const ROLLCALL_CATEGORIES = ['coach', 'bus', 'academics'] as const;
export type RollcallCat = (typeof ROLLCALL_CATEGORIES)[number];
export const ROLLCALL_LABELS: Record<RollcallCat, string> = { coach: 'Coach', bus: 'Bus', academics: 'Academics' };
export const MIN_DATE = '2000-01-01';

export function isRollcallCategory(value: unknown): value is RollcallCat {
  return typeof value === 'string' && (ROLLCALL_CATEGORIES as readonly string[]).includes(value);
}

/** Phoenix does not observe DST: always UTC-7. */
export function phoenixToday(): string {
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
}

export function validateRollcallDate(value: string, today: string): string | null {
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return 'Use the format YYYY-MM-DD.';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return 'That date does not exist on the calendar.';
  if (text < MIN_DATE) return 'Dates start at 2000-01-01.';
  if (text > today) return 'Future dates are not allowed.';
  return null;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const e = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[p++] = (a << 2) | (b >> 4);
    if (c >= 0) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (e >= 0) out[p++] = ((c & 3) << 6) | e;
  }
  return out.slice(0, p);
}

export async function deliverRollcallExport(file: { fileName: string; mimeType: string; contentBase64: string }, options?: { dialogTitle?: string }) {
  const bytes = base64ToBytes(file.contentBase64);
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as BlobPart], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const safeName = file.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const target = new File(Paths.cache, safeName);
  try {
    if (target.exists) target.delete();
    target.create();
    target.write(bytes);
    const uti = file.mimeType === 'text/csv' ? 'public.comma-separated-values-text' :
      file.mimeType === 'text/html' ? 'public.html' : 'org.openxmlformats.spreadsheetml.sheet';
    await Sharing.shareAsync(target.uri, { mimeType: file.mimeType, dialogTitle: options?.dialogTitle ?? 'Export Daily Rollcall', UTI: uti });
  } finally {
    try { if (target.exists) target.delete(); } catch { /* temp cleanup best effort */ }
  }
}
