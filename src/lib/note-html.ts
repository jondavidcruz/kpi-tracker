// ✍️ Rich-note sanitizer (Jon 2026-10-20: GHL-style notes — bold, underline,
// bullets). Notes are typed by authenticated internal reps, but they render via
// dangerouslySetInnerHTML, so we still whitelist tags and strip every attribute
// except safe hrefs on <a> — no scripts, no event handlers, no inline styles.
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "a"]);

export function sanitizeNoteHtml(input: string): string {
  let s = String(input || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // 🛡 Drop a trailing UNCLOSED tag (Jon 2026-10-26): GHL imports truncated a giant
  // <p style="…"> mid-attribute. Left in dangerouslySetInnerHTML it swallows the rest of
  // the page — including React's streaming <script> tags — so the browser's stream reader
  // hits an incomplete stream ("Connection closed") and the whole page fails to load.
  s = s.replace(/<\/?[a-zA-Z][^>]*$/, "");
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return "";
    if (close) return `</${t}>`;
    if (t === "a") {
      const url = ((attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[0] || "").match(/https?:\/\/[^\s"'>]+|mailto:[^\s"'>]+/i)?.[0] || "";
      return url ? `<a href="${url.replace(/"/g, "")}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${t}>`;
  });
  // Belt-and-suspenders: neutralize any stray "<" that isn't the start of a clean tag, so
  // no malformed fragment can ever reach the DOM and break the stream.
  s = s.replace(/<(?![a-zA-Z/])/g, "&lt;");
  return s.slice(0, 8000);
}

/** Does this note body carry our allowed rich-text markup (vs plain text)? */
export function isHtmlNote(s: string): boolean {
  return /<\/?(b|strong|i|em|u|ul|ol|li|br|p|div|a)\b/i.test(s || "");
}

/** Rich-HTML note → editable plain text (so the edit box doesn't show raw tags). */
export function htmlNoteToText(h: string): string {
  return (h || "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n").trim();
}
