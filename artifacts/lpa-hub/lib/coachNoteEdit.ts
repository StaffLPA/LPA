import type { AthleteCoachNote } from '@workspace/api-client-react';

export type CoachNoteDraft = { text: string; updatedAt: string };
export type CoachNoteDraftStorage = Pick<AsyncStorageLike, 'getItem' | 'setItem' | 'removeItem'>;

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const COACH_NOTE_DRAFT_PREFIX = 'lpa-coach-note-draft:v1:';
const pendingDraftWrites = new Map<string, Promise<void>>();

export function coachNoteDraftKey(userId: string, athleteId: string, noteId: string) {
  return `${COACH_NOTE_DRAFT_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(athleteId)}:${encodeURIComponent(noteId)}`;
}

export function parseCoachNoteDraft(raw: string | null): CoachNoteDraft | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('The saved coach-note draft could not be read.'); }
  if (!value || typeof value !== 'object' ||
      typeof (value as Partial<CoachNoteDraft>).text !== 'string' ||
      typeof (value as Partial<CoachNoteDraft>).updatedAt !== 'string') {
    throw new Error('The saved coach-note draft could not be read.');
  }
  return { text: (value as CoachNoteDraft).text, updatedAt: (value as CoachNoteDraft).updatedAt };
}

function queueDraftWrite(key: string, write: () => Promise<void>) {
  const next = (pendingDraftWrites.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(write);
  pendingDraftWrites.set(key, next);
  void next.finally(() => {
    if (pendingDraftWrites.get(key) === next) pendingDraftWrites.delete(key);
  }).catch(() => undefined);
  return next;
}

export async function loadCoachNoteDraft(storage: CoachNoteDraftStorage, key: string) {
  try { await pendingDraftWrites.get(key); } catch { /* Read the last successfully stored value. */ }
  return parseCoachNoteDraft(await storage.getItem(key));
}

export function saveCoachNoteDraft(storage: CoachNoteDraftStorage, key: string, draft: CoachNoteDraft) {
  return queueDraftWrite(key, () => storage.setItem(key, JSON.stringify(draft)));
}

export function clearCoachNoteDraft(storage: CoachNoteDraftStorage, key: string) {
  return queueDraftWrite(key, () => storage.removeItem(key));
}

export async function flushCoachNoteDraftWrites() {
  await Promise.all([...pendingDraftWrites.values()].map((write) => write.catch(() => undefined)));
}

type NoteSaveFailure =
  | { kind: 'conflict'; draft: string; message: string; latest: AthleteCoachNote }
  | { kind: 'error'; draft: string; message: string };

export function resolveCoachNoteSaveFailure(error: unknown, noteId: string, draft: string): NoteSaveFailure {
  const failure = error as {
    status?: number;
    data?: { message?: string; error?: string; latest?: AthleteCoachNote };
    message?: string;
  } | null;
  const latest = failure?.status === 409 ? failure.data?.latest : undefined;

  if (latest?.id === noteId) {
    return {
      kind: 'conflict',
      draft,
      latest,
      message: failure?.data?.message ?? 'This note changed on another device.',
    };
  }

  const message = failure?.data?.error || failure?.data?.message || failure?.message || 'The note could not be saved.';
  return { kind: 'error', draft, message: `${message} Your draft is still here; try again.` };
}
