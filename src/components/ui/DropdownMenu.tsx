import type { ReactNode, MouseEvent } from 'react'

interface DropdownMenuProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

/**
 * A dropdown menu container with backdrop and consistent styling.
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
  if (!open) return null

  const handleBackdropClick = (e: MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={handleBackdropClick} />
      <div
        className={`absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[140px] ${className}`}
      >
        {children}
      </div>
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
