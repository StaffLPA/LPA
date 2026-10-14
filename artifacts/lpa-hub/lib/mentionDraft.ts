type Mention = { userId: string; displayName: string; start: number; end: number };

export function reconcileMentions(previousText: string, nextText: string, mentions: Mention[]): Mention[] {
  if (!mentions.length || previousText === nextText) return mentions;
  let prefixLength = 0;
  while (prefixLength < previousText.length && prefixLength < nextText.length && previousText[prefixLength] === nextText[prefixLength]) prefixLength += 1;
  let previousSuffix = previousText.length;
  let nextSuffix = nextText.length;
  while (previousSuffix > prefixLength && nextSuffix > prefixLength && previousText[previousSuffix - 1] === nextText[nextSuffix - 1]) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }
  const delta = nextText.length - previousText.length;
  return mentions.flatMap((mention) => {
    const token = `@${mention.displayName}`;
    if (mention.end <= prefixLength && nextText.slice(mention.start, mention.end) === token) return [mention];
    if (mention.start >= previousSuffix) {
      const shifted = { ...mention, start: mention.start + delta, end: mention.end + delta };
      return nextText.slice(shifted.start, shifted.end) === token ? [shifted] : [];
    }
    return [];
  });
}

export function collapseMentionLastName(
  previousText: string,
  nextText: string,
  mentions: Mention[],
  selection: { start: number; end: number },
  fullNameForUser: (userId: string) => string | undefined,
): { text: string; mentions: Mention[]; cursor: number } | null {
  if (selection.start !== selection.end || previousText.length !== nextText.length + 1) return null;
  for (const mention of mentions) {
    // Only a chosen full-name mention gets this first-backspace behavior.
    // A shortened mention's next edit removes its metadata as usual.
    if (mention.displayName !== fullNameForUser(mention.userId)) continue;
    const lastSpace = mention.displayName.lastIndexOf(' ');
    if (lastSpace <= 0) continue;
    // Some native keyboards report the post-backspace caret before onChangeText.
    const deletingLastCharacter = (selection.start === mention.end || selection.start === mention.end - 1)
      && nextText === previousText.slice(0, mention.end - 1) + previousText.slice(mention.end);
    const deletingFollowingSpace = (selection.start === mention.end + 1 || selection.start === mention.end)
      && previousText[mention.end] === ' '
      && nextText === previousText.slice(0, mention.end) + previousText.slice(mention.end + 1);
    if (!deletingLastCharacter && !deletingFollowingSpace) continue;
    const displayName = mention.displayName.slice(0, lastSpace);
    const end = mention.start + displayName.length + 1;
    const rest = previousText.slice(mention.end + (deletingFollowingSpace ? 1 : 0));
    const separator = deletingFollowingSpace && rest && !/^[\s.,!?;:)]/.test(rest) ? ' ' : '';
    const text = previousText.slice(0, mention.start) + `@${displayName}` + separator + rest;
    const delta = text.length - previousText.length;
    return {
      text,
      cursor: end,
      mentions: mentions.map((item) => item === mention
        ? { ...item, displayName, end }
        : item.start >= mention.end ? { ...item, start: item.start + delta, end: item.end + delta } : item),
    };
  }
  return null;
}