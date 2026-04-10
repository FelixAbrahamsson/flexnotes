import { useState, useCallback, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Archive, Trash2 } from 'lucide-react'
import { NoteCard } from './NoteCard'
import type { Note, Tag, Folder } from '@/types'

export interface SortableNoteCardProps {
  note: Note
  tags: Tag[]
  folder?: Folder | null
  onClick: () => void
  onPin?: () => void
  onArchive?: () => void
  onDelete: () => void
  onRestore?: () => void
  onShare?: () => void
  onDuplicate?: () => void
  onMoveToFolder?: () => void
  showRestore?: boolean
  showFolder?: boolean
  isDragDisabled?: boolean
  reorderMode?: boolean
}

const SWIPE_THRESHOLD = 80
const MAX_SWIPE = 150

export function SortableNoteCard({
  note,
  tags,
  folder,
  onClick,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onShare,
  onDuplicate,
  onMoveToFolder,
  showRestore,
  showFolder,
  isDragDisabled,
  reorderMode,
}: SortableNoteCardProps) {
  // On mobile outside reorder mode, disable sortable so @dnd-kit doesn't
  // interfere with swipe gestures or cause unwanted vertical dragging
  const isMobile = typeof window !== 'undefined' && window.matchMedia("(max-width: 639px)").matches
  const sortableDisabled = isDragDisabled || (isMobile && !reorderMode)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, disabled: sortableDisabled })

  // Swipe-to-action state (mobile only, outside reorder mode)
  const [swipeX, setSwipeX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const directionRef = useRef<'horizontal' | 'vertical' | null>(null)

  const swipeEnabled = !isDragDisabled && !reorderMode

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!swipeEnabled) return
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    directionRef.current = null
  }, [swipeEnabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeEnabled || !touchStartRef.current) return
    const deltaX = e.touches[0].clientX - touchStartRef.current.x
    const deltaY = e.touches[0].clientY - touchStartRef.current.y

    // First 10px of movement determines direction
    if (!directionRef.current) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        directionRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
      }
      return
    }

    if (directionRef.current === 'horizontal') {
      // Only allow right swipe if archive is available
      if (deltaX > 0 && !onArchive) return
      setIsSwiping(true)
      setSwipeX(deltaX)
    }
  }, [swipeEnabled, onArchive])

  const handleTouchEnd = useCallback(() => {
    if (isSwiping) {
      if (swipeX > SWIPE_THRESHOLD && onArchive) {
        onArchive()
      } else if (swipeX < -SWIPE_THRESHOLD) {
        onDelete()
      }
    }
    setSwipeX(0)
    setIsSwiping(false)
    touchStartRef.current = null
    directionRef.current = null
  }, [isSwiping, swipeX, onArchive, onDelete])

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  // touch-pan-y on mobile allows vertical scroll but gives JS control of horizontal swipe
  const touchActionClass = reorderMode && !isDragDisabled
    ? 'touch-none'
    : 'touch-pan-y sm:touch-auto'

  // Clamp visual displacement so the card can't slide off screen
  const displaySwipeX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, swipeX))

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={`relative overflow-hidden rounded-lg ${touchActionClass} ${sortableDisabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
      {...attributes}
      {...listeners}
    >
      {/* Swipe action backgrounds - revealed as card slides */}
      {displaySwipeX > 0 && onArchive && (
        <div className={`absolute inset-0 flex items-center pl-4 rounded-lg transition-colors ${
          swipeX > SWIPE_THRESHOLD ? 'bg-blue-600' : 'bg-blue-500/80'
        }`}>
          <Archive className="w-5 h-5 text-white" />
        </div>
      )}
      {displaySwipeX < 0 && (
        <div className={`absolute inset-0 flex items-center justify-end pr-4 rounded-lg transition-colors ${
          swipeX < -SWIPE_THRESHOLD ? 'bg-red-600' : 'bg-red-500/80'
        }`}>
          <Trash2 className="w-5 h-5 text-white" />
        </div>
      )}

      {/* Card content - slides horizontally during swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: displaySwipeX ? `translateX(${displaySwipeX}px)` : undefined,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        <NoteCard
          note={note}
          tags={tags}
          folder={folder}
          onClick={onClick}
          onPin={onPin}
          onArchive={onArchive}
          onDelete={onDelete}
          onRestore={onRestore}
          onShare={onShare}
          onDuplicate={onDuplicate}
          onMoveToFolder={onMoveToFolder}
          showRestore={showRestore}
          showFolder={showFolder}
        />
      </div>
    </div>
  )
}
