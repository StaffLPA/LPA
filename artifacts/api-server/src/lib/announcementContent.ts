const allowedTags = new Set(["p", "div", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "a", "span"]);
const allowedStyles = new Set(["font-family", "font-size", "color", "background-color", "text-align"]);

function safeUrl(value: string) {
  return /^(?:https?:|mailto:)/i.test(value.trim()) ? value.trim() : null;
}

function safeStyle(value: string) {
  return value.split(";").map((declaration) => {
    const [property, ...rest] = declaration.split(":");
    const name = property?.trim().toLowerCase();
    const styleValue = rest.join(":").trim();
    if (!name || !styleValue || !allowedStyles.has(name)) return null;
    if (/[<>`{}]/.test(styleValue) || /url\s*\(/i.test(styleValue)) return null;
    if (name === "font-size" && !/^(?:\d+(?:\.\d+)?)(?:px|pt|em|rem|%)$/i.test(styleValue)) return null;
    if (name === "text-align" && !/^(?:left|center|right|justify)$/i.test(styleValue)) return null;
    return `${name}: ${styleValue}`;
  }).filter((item): item is string => Boolean(item)).join("; ");
}

function sanitizeTag(raw: string) {
  const match = raw.match(/^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>$/i);
  if (!match) return "";
  const [, closing, tagName, rawAttributes] = match;
  const tag = tagName.toLowerCase();
  if (!allowedTags.has(tag)) return "";
  if (closing) return `</${tag}>`;
  const attributes: string[] = [];
  const attributePattern = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const attribute of rawAttributes.matchAll(attributePattern)) {
    const name = attribute[1]?.toLowerCase();
    const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    if (name === "href" && tag === "a") {
      const url = safeUrl(value);
      if (url) attributes.push(`href="${url.replace(/"/g, "&quot;")}"`, `target="_blank"`, `rel="noopener noreferrer"`);
    } else if (name === "style") {
      const style = safeStyle(value);
      if (style) attributes.push(`style="${style.replace(/"/g, "&quot;")}"`);
    } else if (name === "title" && tag === "a") {
      attributes.push(`title="${value.replace(/["<>]/g, "")}"`);
    }
  }
  return `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
}

export function sanitizeAnnouncementHtml(input: string) {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(?:script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:script|style|iframe|object|embed|svg|math|template)\s*>|$)/gi, "")
    .replace(/<[^>]*>/g, (tag) => sanitizeTag(tag))
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export function announcementPlainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim().slice(0, 100);
}