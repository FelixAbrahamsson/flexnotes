import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface Heading {
  level: number;
  text: string;
  index: number;
}

interface HeadingOutlineProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export function HeadingOutline({
  scrollContainerRef,
}: HeadingOutlineProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const headingsRef = useRef<Heading[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const inZoneRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const extractHeadings = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const domHeadings = container.querySelectorAll("h1, h2, h3");
    const result: Heading[] = [];
    domHeadings.forEach((el, index) => {
      const level = parseInt(el.tagName.slice(1));
      const text = el.textContent || "";
      result.push({ level, text, index });
    });

    // Only update state if headings actually changed
    const prev = headingsRef.current;
    const changed =
      prev.length !== result.length ||
      prev.some(
        (h, i) => h.level !== result[i].level || h.text !== result[i].text
      );

    if (changed) {
      headingsRef.current = result;
      setHeadings(result);
    }
  }, [scrollContainerRef]);

  // Extract headings from DOM and watch for changes via MutationObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    extractHeadings();

    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(extractHeadings, 150);
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
  }, [scrollContainerRef, extractHeadings]);

  // Document-level mousemove listener for hover zone detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 640) return;
      if (headingsRef.current.length === 0) return;
      if (panelRef.current?.contains(e.target as Node)) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      if (y < rect.top || y > rect.bottom) {
        if (inZoneRef.current) {
          inZoneRef.current = false;
          if (showTimerRef.current) clearTimeout(showTimerRef.current);
          hideTimerRef.current = setTimeout(() => setShowPanel(false), 300);
        }
        return;
      }

      // Modal (container offset from left): zone is in the backdrop.
      // Fullscreen (container flush-left): zone is in the left margin of centered content.
      let refLeft: number;
      if (rect.left > 40) {
        refLeft = rect.left;
      } else {
        const editorDom = container.querySelector(".tiptap");
        if (!editorDom) return;
        refLeft = editorDom.getBoundingClientRect().left;
      }

      const zoneWidth = Math.min(180, refLeft - 8);
      if (zoneWidth < 20) return;

      const inZone = x >= refLeft - zoneWidth && x < refLeft;

      if (inZone) {
        if (!inZoneRef.current) {
          inZoneRef.current = true;
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          setPanelPos({
            top: rect.top + 16,
            left: Math.max(8, refLeft - 224),
          });
          showTimerRef.current = setTimeout(() => {
            setShowPanel(true);
          }, 150);
        }
      } else if (inZoneRef.current) {
        inZoneRef.current = false;
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        hideTimerRef.current = setTimeout(() => setShowPanel(false), 300);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      clearTimers();
      inZoneRef.current = false;
      setShowPanel(false);
    };
  }, [scrollContainerRef, clearTimers]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handlePanelEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  const handlePanelLeave = () => {
    inZoneRef.current = false;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowPanel(false), 300);
  };

  const scrollToHeading = (headingIndex: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const domHeadings = container.querySelectorAll("h1, h2, h3");
    const target = domHeadings[headingIndex];
    if (!target) return;

    const targetRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop;

    container.scrollTo({ top: offset - 16, behavior: "smooth" });
  };

  if (headings.length === 0) return null;
  if (!showPanel) return null;

  const indent: Record<number, string> = {
    1: "pl-3",
    2: "pl-6",
    3: "pl-9",
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[60] w-56 max-h-[calc(100vh-8rem)] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-lg py-2"
      style={{ top: panelPos.top, left: panelPos.left }}
      onMouseEnter={handlePanelEnter}
      onMouseLeave={handlePanelLeave}
    >
      {headings.map((heading, i) => (
        <button
          key={i}
          onClick={() => scrollToHeading(heading.index)}
          className={`block w-full text-left text-sm px-3 py-1.5 truncate text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ${indent[heading.level] || "pl-3"}`}
        >
          {heading.text || "(empty)"}
        </button>
      ))}
    </div>,
    document.body
  );
}
