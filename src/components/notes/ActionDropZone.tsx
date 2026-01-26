import { useDroppable } from '@dnd-kit/core'

export interface ActionDropZoneProps {
  id: string
  icon: React.ReactNode
  label: string
  variant: 'archive' | 'trash'
}

export function ActionDropZone({ id, icon, label, variant }: ActionDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  const baseClasses =
    'flex flex-col items-center justify-center gap-2 py-4 px-6 rounded-xl transition-all duration-200'
  const variantClasses =
    variant === 'trash'
      ? isOver
        ? 'bg-red-500 text-white scale-110'
        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      : isOver
        ? 'bg-amber-500 text-white scale-110'
        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'

  return (
    <div ref={setNodeRef} className={`${baseClasses} ${variantClasses}`}>
      <div className={`transition-transform ${isOver ? 'scale-125' : ''}`}>
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}
