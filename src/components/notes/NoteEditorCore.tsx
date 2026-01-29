import { useState, useEffect, useCallback, useRef } from "react";
import {
  Archive,
  Trash2,
  MoreVertical,
  Type,
  List,
  FileText,
  Tag,
  ImagePlus,
  Share2,
  FolderInput,
} from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useTagStore } from "@/stores/tagStore";
import { useImageStore } from "@/stores/imageStore";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { TextEditor } from "./TextEditor";
import { ListEditor } from "./ListEditor";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { TagBadge } from "@/components/tags/TagBadge";
import { TagPicker } from "@/components/tags/TagPicker";
import { ImageGallery, ImageViewer } from "@/components/images/ImageGallery";
import { ShareModal } from "@/components/sharing/ShareModal";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/DropdownMenu";
import type { Note, NoteType } from "@/types";

export interface NoteEditorCoreProps {
  note: Note;
  hideTags?: boolean;
  onMoveToFolder?: () => void;
  /** Called after archiving/unarchiving. Modal uses this to close. */
  onAfterArchive?: () => void;
  /** Called after deleting. Modal uses this to close. */
  onAfterDelete?: () => void;
  /** Use 'delete' for permanent delete (modal), 'trash' for move to trash (pane) */
  deleteMode?: "delete" | "trash";
  /** Whether the editor is in fullscreen mode (affects content width) */
  isFullscreen?: boolean;
  /** Header slot for additional buttons (e.g., close, fullscreen) */
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  /** Called when content changes, useful for parent to track current content */
  onContentChange?: (content: string) => void;
}

/**
 * Core note editor component containing all editing logic.
 * Used by NoteEditor (modal) and NoteEditorPane (inline).
 */
export function NoteEditorCore({
  note,
  hideTags = false,
  onMoveToFolder,
  onAfterArchive,
  onAfterDelete,
  deleteMode = "trash",
  isFullscreen = false,
  headerLeft,
  headerRight,
  onContentChange,
}: NoteEditorCoreProps) {
  const { updateNote, deleteNote, trashNote } = useNoteStore();
  const { getTagsForNote, removeTagFromNote } = useTagStore();
  const { fetchImagesForNote } = useImageStore();
  const confirm = useConfirm();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const markdownEditorRef = useRef<MarkdownEditorHandle>(null);

  const {
    isDragging,
    uploading,
    fileInputRef,
    handleImageUpload,
    handleImageButtonClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useImageUpload({
    noteId: note.id,
    noteType: note.note_type,
    onImageInsert: (url) => markdownEditorRef.current?.insertImage(url),
  });

  const noteTags = getTagsForNote(note.id);

  // Sync from store when note ID changes
  const [lastNoteId, setLastNoteId] = useState<string | null>(null);
  useEffect(() => {
    if (note.id !== lastNoteId) {
      setTitle(note.title || "");
      setContent(note.content);
      setLastNoteId(note.id);
    }
  }, [note, lastNoteId]);

  // Notify parent of content changes
  useEffect(() => {
    onContentChange?.(content);
  }, [content, onContentChange]);

  // Fetch images when note opens
  useEffect(() => {
    fetchImagesForNote(note.id);
  }, [note.id, fetchImagesForNote]);

  const handleSave = useCallback(() => {
    const updates: Record<string, unknown> = {};

    if (title !== (note.title || "")) {
      updates.title = title || null;
    }
    if (content !== note.content) {
      updates.content = content;
    }

    if (Object.keys(updates).length > 0) {
      updateNote(note.id, updates);
    }
  }, [note, title, content, updateNote]);

  // Keep a ref to the latest save function for unmount flush
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(handleSave, 500);
    return () => clearTimeout(timer);
  }, [handleSave]);

  // Flush any pending save when unmounting
  useEffect(() => {
    return () => handleSaveRef.current();
  }, []);

  const handleToggleArchive = () => {
    updateNote(note.id, { is_archived: !note.is_archived });
    onAfterArchive?.();
  };

  const handleDelete = async () => {
    const isTrash = deleteMode === "trash";
    const confirmed = await confirm({
      title: isTrash ? "Move to trash" : "Delete note",
      message: isTrash
        ? "Move this note to trash?"
        : "Delete this note? This cannot be undone.",
      confirmText: isTrash ? "Move to trash" : "Delete",
      variant: "danger",
    });
    if (confirmed) {
      if (isTrash) {
        trashNote(note.id);
      } else {
        deleteNote(note.id);
      }
      onAfterDelete?.();
    }
  };

  const handleChangeType = async (newType: NoteType) => {
    const imageStore = useImageStore.getState();

    // If converting FROM markdown, clean up any images that were removed from content first
    if (note.note_type === "markdown") {
      await imageStore.cleanupOrphanedImages(note.id, content);
    }

    // Get images after cleanup
    const images = imageStore.getImagesForNote(note.id);
    const getImageUrl = imageStore.getImageUrl;

    // Get all valid image URLs
    const validImageUrls = new Set(
      images.map((img) => getImageUrl(img.storage_path))
    );

    let newContent = content;

    // Helper to remove img tags that reference deleted images
    const removeOrphanedImgTags = (currentContent: string) => {
      return currentContent.replace(
        /<img[^>]+src="([^"]+)"[^>]*>/g,
        (match, url) => {
          return validImageUrls.has(url) ? match : "";
        }
      );
    };

    // Helper to append images that aren't already in the content
    const appendMissingImages = (currentContent: string) => {
      if (images.length === 0) return currentContent;
      const missingImages = images.filter((img) => {
        const url = getImageUrl(img.storage_path);
        return !currentContent.includes(url);
      });
      if (missingImages.length === 0) return currentContent;
      const imageHtml = missingImages
        .map((img) => `<img src="${getImageUrl(img.storage_path)}">`)
        .join("");
      return currentContent + imageHtml;
    };

    // Convert content between types
    if (note.note_type === "list" && newType !== "list") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.items && Array.isArray(parsed.items)) {
          newContent = parsed.items
            .map((item: { text: string }) => item.text)
            .join("\n");
        }
      } catch {
        // Keep as-is
      }
      // If converting to markdown, append any missing images
      if (newType === "markdown") {
        newContent = appendMissingImages(newContent);
      }
    } else if (note.note_type !== "list" && newType === "list") {
      const plainText = content.replace(/<[^>]*>/g, "\n");
      const lines = plainText.split("\n").filter((line) => line.trim());
      newContent = JSON.stringify({
        items: lines.map((text, i) => ({
          id: `item-${i}-${Date.now()}`,
          text: text.trim(),
          checked: false,
        })),
      });
    } else if (note.note_type === "text" && newType === "markdown") {
      // Text to markdown - remove orphaned img tags, then append missing images
      newContent = removeOrphanedImgTags(content);
      newContent = appendMissingImages(newContent);
    }

    updateNote(note.id, { note_type: newType, content: newContent });
    setContent(newContent);
    setShowTypeMenu(false);
  };

  const showImageGallery = note.note_type === "text";

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && note.note_type !== "list" && (
        <div
          className="absolute inset-0 z-50 bg-primary-500/20 dark:bg-primary-500/30 flex items-center justify-center rounded-xl"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg text-center">
            <ImagePlus className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Drop images here
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Images will be uploaded to this note
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {headerLeft}
        </div>

        <div className="flex items-center gap-1">
          {/* Image upload button (for text/markdown) */}
          {note.note_type !== "list" && (
            <button
              onClick={handleImageButtonClick}
              disabled={uploading}
              className="btn btn-ghost p-2"
              title="Add image"
            >
              <ImagePlus
                className={`w-4 h-4 ${uploading ? "animate-pulse" : ""}`}
              />
            </button>
          )}

          {/* Note type selector */}
          <div className="relative">
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              className="btn btn-ghost p-2 text-xs font-medium text-gray-500"
            >
              {note.note_type === "text" && <Type className="w-4 h-4" />}
              {note.note_type === "list" && <List className="w-4 h-4" />}
              {note.note_type === "markdown" && (
                <FileText className="w-4 h-4" />
              )}
            </button>

            {showTypeMenu && (
              <>
                <div
                  className="fixed inset-0"
                  onClick={() => setShowTypeMenu(false)}
                />
                <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                  <button
                    onClick={() => handleChangeType("text")}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === "text" ? "text-primary-600 dark:text-primary-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    <Type className="w-4 h-4" />
                    Text
                  </button>
                  <button
                    onClick={() => handleChangeType("list")}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === "list" ? "text-primary-600 dark:text-primary-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    <List className="w-4 h-4" />
                    List
                  </button>
                  <button
                    onClick={() => handleChangeType("markdown")}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === "markdown" ? "text-primary-600 dark:text-primary-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    <FileText className="w-4 h-4" />
                    Markdown
                  </button>
                </div>
              </>
            )}
          </div>

          {headerRight}

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="btn btn-ghost p-2"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            <DropdownMenu open={showMenu} onClose={() => setShowMenu(false)}>
              <DropdownMenuItem
                icon={<Share2 className="w-4 h-4" />}
                onClick={() => {
                  setShowMenu(false);
                  setShowShareModal(true);
                }}
              >
                Share
              </DropdownMenuItem>
              {onMoveToFolder && (
                <DropdownMenuItem
                  icon={<FolderInput className="w-4 h-4" />}
                  onClick={() => {
                    setShowMenu(false);
                    onMoveToFolder();
                  }}
                >
                  Move to folder
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                icon={<Archive className="w-4 h-4" />}
                onClick={() => {
                  setShowMenu(false);
                  handleToggleArchive();
                }}
              >
                {note.is_archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setShowMenu(false);
                  handleDelete();
                }}
                variant="danger"
              >
                {deleteMode === "trash" ? "Move to trash" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleImageUpload(e.target.files)}
        className="hidden"
      />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className={isFullscreen ? "max-w-3xl mx-auto" : ""}>
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full text-xl font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 mb-3"
        />

        {/* Tags */}
        {!hideTags && (
          <div className="relative mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {noteTags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  onRemove={() => removeTagFromNote(note.id, tag.id)}
                />
              ))}
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <Tag className="w-3 h-3" />
                {noteTags.length === 0 ? "Add tag" : "Edit"}
              </button>
            </div>

            {showTagPicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTagPicker(false)}
                />
                <TagPicker
                  noteId={note.id}
                  selectedTags={noteTags}
                  onClose={() => setShowTagPicker(false)}
                />
              </>
            )}
          </div>
        )}

        {/* Editor */}
        {note.note_type === "list" ? (
          <ListEditor content={content} onChange={setContent} />
        ) : note.note_type === "markdown" ? (
          <MarkdownEditor
            ref={markdownEditorRef}
            content={content}
            onChange={setContent}
            placeholder="Start typing..."
            onImageDrop={handleImageUpload}
          />
        ) : (
          <TextEditor
            content={content}
            onChange={setContent}
            placeholder="Start typing..."
          />
        )}

        {/* Image gallery (for text notes) */}
        {showImageGallery && (
          <ImageGallery
            noteId={note.id}
            onImageClick={setViewingImage}
            editable={true}
          />
        )}
        </div>
      </div>

      {/* Full-screen image viewer */}
      {viewingImage && (
        <ImageViewer url={viewingImage} onClose={() => setViewingImage(null)} />
      )}

      {/* Share modal */}
      {showShareModal && (
        <ShareModal
          noteId={note.id}
          noteTitle={note.title}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}

/** Expose current content for cleanup purposes */
export function useNoteEditorContent() {
  const contentRef = useRef<string>("");
  const setContent = useCallback((content: string) => {
    contentRef.current = content;
  }, []);
  return { contentRef, setContent };
}
