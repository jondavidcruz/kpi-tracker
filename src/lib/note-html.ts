// ✍️ Rich-note sanitizer (Jon 2026-10-20: GHL-style notes — bold, underline,
// bullets). Notes are typed by authenticated internal reps, but they render via
// dangerouslySetInnerHTML, so we still whitelist tags and strip every attribute
// except safe hrefs on <a> — no scripts, no event handlers, no inline styles.
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "a"]);

export function sanitizeNoteHtml(input: string): string {
  let s = String(input || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
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
  return s.slice(0, 8000);
}

/** Does this note body carry our allowed rich-text markup (vs plain text)? */
export function isHtmlNote(s: string): boolean {
  return /<\/?(b|strong|i|em|u|ul|ol|li|br|p|div|a)\b/i.test(s || "");
}
