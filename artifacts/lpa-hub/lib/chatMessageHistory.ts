// LPA's calendar-day rules use Arizona time, not the viewing device's timezone.
export const MESSAGE_HISTORY_TIME_ZONE = 'America/Phoenix';

export type MessageHistoryRow<T> = {
  message: T;
  dateSeparator: { key: string; label: string } | null;
};

/**
 * A separator belongs to the oldest visible message on each calendar day.
 * Rebuilding from history keeps that boundary correct after loading older
 * messages, receiving new ones, or deleting the first message of a day.
 */
export function buildMessageHistoryRows<T extends { createdAt: string }>(
  messages: readonly T[],
  timeZone = MESSAGE_HISTORY_TIME_ZONE,
): MessageHistoryRow<T>[] {
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const labelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', month: 'long', day: 'numeric',
  });
  const sorted = messages.map((message, index) => ({
    message, index, timestamp: Date.parse(message.createdAt),
  })).sort((a, b) => {
    const aTime = Number.isFinite(a.timestamp) ? a.timestamp : Infinity;
    const bTime = Number.isFinite(b.timestamp) ? b.timestamp : Infinity;
    return (aTime - bTime) || (a.index - b.index);
  });
  let previousDay: string | undefined;
  return sorted.map(({ message, timestamp }) => {
    let key = 'unknown';
    let label = 'Unknown date';
    if (Number.isFinite(timestamp)) {
      const parts = dayFormatter.formatToParts(timestamp);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
      key = `${part('year')}-${part('month')}-${part('day')}`;
      label = labelFormatter.format(timestamp);
    }
    const dateSeparator = key === previousDay ? null : { key, label };
    previousDay = key;
    return { message, dateSeparator };
  });
}
