import type { NoteType } from "@/types";

/**
 * Convert HTML to plain text, preserving line structure.
 * Used for markdown-to-text conversion and general HTML stripping.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<\/li>\s*<li[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Convert plain text to HTML paragraphs for TipTap.
 * Each line becomes a `<p>` element; empty lines use `<br>`.
 * HTML special characters are escaped.
 */
export function plainTextToHtml(text: string): string {
  if (!text.trim()) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

/**
 * Parse list JSON content into plain text lines.
 */
function listToPlainText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items
        .map((item: { text: string }) => item.text)
        .join("\n");
    }
  } catch {
    // Keep as-is
  }
  return content;
}

/**
 * Convert plain text lines into list JSON.
 */
function plainTextToList(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim());
  return JSON.stringify({
    items: lines.map((text, i) => ({
      id: `item-${i}-${Date.now()}`,
      text: text.trim(),
      checked: false,
    })),
  });
}

/**
 * Convert note content between types (text, markdown, list).
 * Returns the converted content string.
 *
 * Note: Image-related transformations (orphaned image cleanup, appending
 * missing images) are handled separately by the caller since they depend
 * on image store state.
 */
export function convertNoteContent(
  content: string,
  fromType: NoteType,
  toType: NoteType
): string {
  if (fromType === toType) return content;

  // list -> text or markdown
  if (fromType === "list" && toType !== "list") {
    const plainText = listToPlainText(content);
    if (toType === "markdown") {
      return plainTextToHtml(plainText);
    }
    return plainText;
  }

  // text or markdown -> list
  if (fromType !== "list" && toType === "list") {
    const plainText =
      fromType === "markdown" ? htmlToPlainText(content) : content;
    return plainTextToList(plainText);
  }

  // markdown -> text
  if (fromType === "markdown" && toType === "text") {
    return htmlToPlainText(content);
  }

  // text -> markdown
  if (fromType === "text" && toType === "markdown") {
    return plainTextToHtml(content);
  }

  return content;
}
