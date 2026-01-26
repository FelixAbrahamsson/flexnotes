import { type ReactNode, type MouseEvent, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface DropdownMenuProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

/**
 * A dropdown menu container with backdrop and consistent styling.
 * Uses a portal to render outside scroll containers.
 * Use with DropdownMenuItem for menu items.
 *
 * @example
 * <div className="relative">
 *   <button onClick={() => setOpen(!open)}>Menu</button>
 *   <DropdownMenu open={open} onClose={() => setOpen(false)}>
 *     <DropdownMenuItem icon={<Edit />} onClick={handleEdit}>Edit</DropdownMenuItem>
 *     <DropdownMenuItem icon={<Trash2 />} onClick={handleDelete} variant="danger">Delete</DropdownMenuItem>
 *   </DropdownMenu>
 * </div>
 */
export function DropdownMenu({ open, onClose, children, className = '' }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false })

  useEffect(() => {
    if (!open || !menuRef.current) return

    // Find the trigger button (parent element's button)
    const parent = menuRef.current.parentElement
    if (!parent) return

    const triggerButton = parent.querySelector('button')
    if (!triggerButton) return

    const rect = triggerButton.getBoundingClientRect()
    const menuHeight = 100 // Approximate menu height
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    // Decide whether to open up or down
    const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow

    setPosition({
      top: openUp ? rect.top - 8 : rect.bottom + 4,
      left: rect.right - 140, // Menu width is min 140px, align to right edge
      openUp,
    })
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  // Render a placeholder div to get parent context, then portal the actual menu
  return (
    <>
      <div ref={menuRef} className="hidden" />
      {createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={handleBackdropClick} />
          <div
            className={`fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[140px] ${className}`}
            style={{
              top: position.openUp ? 'auto' : position.top,
              bottom: position.openUp ? `${window.innerHeight - position.top}px` : 'auto',
              left: Math.max(8, position.left), // Ensure doesn't go off left edge
            }}
          >
            {children}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

interface DropdownMenuItemProps {
  icon?: ReactNode
  children: ReactNode
  onClick: (e: MouseEvent) => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

/**
 * A single item in a dropdown menu.
 */
export function DropdownMenuItem({
  icon,
  children,
  onClick,
  variant = 'default',
  disabled = false,
}: DropdownMenuItemProps) {
  const baseClasses = 'flex items-center gap-2 px-3 py-2 text-sm w-full text-left transition-colors'
  const variantClasses =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : ''

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabledClasses}`}
    >
      {icon}
      {children}
    </button>
  )
}
