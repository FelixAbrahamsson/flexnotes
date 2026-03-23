import { useEffect, useCallback, useRef } from "react";
import { useNoteStore } from "@/stores/noteStore";
import { useNoteUIStore } from "@/stores/noteUIStore";
import { useSyncStore } from "@/stores/syncStore";

type ModalType = "settings" | "note";

interface UseNoteEditorLifecycleOptions {
  clearNoteFromUrl: () => void;
  onCloseSettings: () => void;
  isMobileRef: React.MutableRefObject<boolean>;
}

export function useNoteEditorLifecycle({
  clearNoteFromUrl,
  onCloseSettings,
  isMobileRef,
}: UseNoteEditorLifecycleOptions) {
  const { deleteNoteIfEmpty } = useNoteStore();
  const { activeNoteId, setActiveNote } = useNoteUIStore();
  const { pendingCount } = useSyncStore();

  const modalStackRef = useRef<ModalType[]>([]);
  const activeNoteIdRef = useRef(activeNoteId);
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  const editorFlushSaveRef = useRef<() => void>(() => {});
  const editorDirtyRef = useRef(false);
  const paneFlushSaveRef = useRef<() => void>(() => {});
  const paneDirtyRef = useRef(false);

  // Keep onCloseSettings in a ref to avoid re-subscribing popstate
  const onCloseSettingsRef = useRef(onCloseSettings);
  useEffect(() => {
    onCloseSettingsRef.current = onCloseSettings;
  }, [onCloseSettings]);

  const openModal = useCallback((modalType: ModalType) => {
    modalStackRef.current.push(modalType);
    window.history.pushState({ modal: modalType }, "");
  }, []);

  const closeModalNormally = useCallback((modalType: ModalType) => {
    const index = modalStackRef.current.lastIndexOf(modalType);
    if (index !== -1) {
      modalStackRef.current.splice(index, 1);
      window.history.back();
    }
  }, []);

  // Handle back button / swipe back
  useEffect(() => {
    const handlePopState = () => {
      const topModal = modalStackRef.current.pop();
      if (topModal === "settings") {
        onCloseSettingsRef.current();
      } else if (topModal === "note") {
        editorFlushSaveRef.current();
        const noteId = activeNoteIdRef.current;
        if (noteId) {
          deleteNoteIfEmpty(noteId);
        }
        setActiveNote(null);
        clearNoteFromUrl();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [deleteNoteIfEmpty, setActiveNote, clearNoteFromUrl]);

  // Warn before closing tab with unsaved changes
  const pendingCountRef = useRef(pendingCount);
  useEffect(() => {
    pendingCountRef.current = pendingCount;
  }, [pendingCount]);
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      editorFlushSaveRef.current();
      paneFlushSaveRef.current();
      if (
        editorDirtyRef.current ||
        paneDirtyRef.current ||
        pendingCountRef.current > 0
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleCloseEditor = useCallback(async () => {
    editorFlushSaveRef.current();
    const noteId = activeNoteIdRef.current;
    if (isMobileRef.current && modalStackRef.current.includes("note")) {
      const index = modalStackRef.current.lastIndexOf("note");
      if (index !== -1) {
        modalStackRef.current.splice(index, 1);
      }
      if (noteId) {
        await deleteNoteIfEmpty(noteId);
      }
      setActiveNote(null);
      clearNoteFromUrl();
      window.history.back();
    } else {
      if (noteId) {
        await deleteNoteIfEmpty(noteId);
      }
      setActiveNote(null);
      clearNoteFromUrl();
    }
  }, [deleteNoteIfEmpty, setActiveNote, clearNoteFromUrl]);

  return {
    modalStackRef,
    activeNoteIdRef,
    editorFlushSaveRef,
    editorDirtyRef,
    paneFlushSaveRef,
    paneDirtyRef,
    openModal,
    closeModalNormally,
    handleCloseEditor,
  };
}
