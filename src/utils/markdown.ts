import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Heuristically detect whether a block of plain text is Markdown.
 *
 * Used when pasting into the markdown (TipTap) editor: TipTap has no Markdown
 * parser, so raw Markdown would otherwise be inserted as literal text. If the
 * pasted text carries any of these structural signals we convert it to HTML
 * so it renders as intended.
 *
 * Lookbehind is intentionally avoided for broad mobile browser support, and
 * underscore-based emphasis is omitted to prevent false positives on
 * snake_case identifiers.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;

  const signals: RegExp[] = [
    /^\s{0,3}#{1,6}\s+\S/m, // ATX headings: "# Title"
    /^\s*[-*+]\s+\S/m, // unordered list: "- item"
    /^\s*\d+\.\s+\S/m, // ordered list: "1. item"
    /^\s*>\s+\S/m, // blockquote: "> quote"
    /^\s*```/m, // fenced code block
    /^\s*(?:-\s*){3,}$/m, // horizontal rule: "---"
    /^\s*(?:\*\s*){3,}$/m, // horizontal rule: "***"
    /\*\*[^*\n]+\*\*/, // bold: "**text**"
    /\[[^\]\n]+\]\([^)\n]+\)/, // link: "[text](url)"
    /`[^`\n]+`/, // inline code: "`code`"
    /^\s*\|.+\|\s*$/m, // table row: "| a | b |"
  ];

  return signals.some((re) => re.test(text));
}

/**
 * Rewrite GitHub-flavored task lists into the shape TipTap's TaskList/TaskItem
 * extensions recognize.
 *
 * marked renders `- [ ] item` as `<li><input type="checkbox"> item</li>`, which
 * TipTap parses as a plain bullet list (dropping the checkbox). TipTap instead
 * expects `<ul data-type="taskList">` with `<li data-type="taskItem"
 * data-checked="...">`. Any `<ul>` (including nested ones) that contains a
 * checkbox item is converted; the raw `<input>` and its trailing space are
 * removed.
 */
function mapTaskLists(html: string): string {
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("ul").forEach((ul) => {
    const items = Array.from(ul.children).filter(
      (child): child is HTMLLIElement => child.tagName === "LI"
    );
    const hasTaskItem = items.some((li) =>
      li.querySelector(":scope > input[type='checkbox']")
    );
    if (!hasTaskItem) return;

    ul.setAttribute("data-type", "taskList");
    items.forEach((li) => {
      const checkbox = li.querySelector<HTMLInputElement>(
        ":scope > input[type='checkbox']"
      );
      li.setAttribute("data-type", "taskItem");
      li.setAttribute(
        "data-checked",
        checkbox?.hasAttribute("checked") ? "true" : "false"
      );
      checkbox?.remove();
      // marked leaves a leading space (from "<input> text") after removal.
      const first = li.firstChild;
      if (first?.nodeType === Node.TEXT_NODE && first.textContent) {
        first.textContent = first.textContent.replace(/^\s+/, "");
      }
    });
  });

  return doc.body.innerHTML;
}

/**
 * Convert Markdown to sanitized HTML suitable for insertion into the TipTap
 * editor. GitHub-flavored Markdown is enabled; soft line breaks are left as-is
 * (matching typical Markdown rendering).
 */
export function markdownToSafeHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;
  return DOMPurify.sanitize(mapTaskLists(rawHtml), {
    ADD_ATTR: ["data-type", "data-checked"],
  });
}
