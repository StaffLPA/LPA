// Keep the original message metadata for request navigation, never display it.
export function visibleFormMessageText(text: string) {
  return text.replace(/\s*\[LPA Request:[0-9a-f-]{36}\]/gi, "").trimEnd();
}

export function formRequestIdFromMessage(text: string) {
  return text.match(/\[LPA Request:([0-9a-f-]{36})\]\s*$/i)?.[1];
}
