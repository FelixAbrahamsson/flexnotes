import { useEffect, useState } from 'react'
import { X, Link, Copy, Check, Trash2, Globe, Edit3 } from 'lucide-react'
import { useShareStore } from '@/stores/shareStore'
import { copyToClipboard } from '@/services/share'
import type { NoteShare } from '@/types'

interface ShareModalProps {
  noteId: string
  noteTitle: string | null
  onClose: () => void
}

export function ShareModal({ noteId, noteTitle, onClose }: ShareModalProps) {
  const { shares, loading, fetchShares, createShare, removeShare, updatePermission } =
    useShareStore()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newPermission, setNewPermission] = useState<'read' | 'write'>('read')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchShares(noteId)
  }, [noteId, fetchShares])

  const handleCreateShare = async () => {
    setCreating(true)
    const result = await createShare(noteId, newPermission)

    if ('url' in result) {
      await handleCopy(result.url, 'new')
    }
    setCreating(false)
  }

  const handleCopy = async (shareToken: string, shareId: string) => {
    const url = `${window.location.origin}/shared/${shareToken}`
    const success = await copyToClipboard(url)

    if (success) {
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const isExpired = (share: NoteShare): boolean => {
    return share.expires_at ? new Date(share.expires_at) < new Date() : false
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Share Note</h2>
            {noteTitle && (
              <p className="text-sm text-gray-500 truncate max-w-[250px]">
                {noteTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create new share */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <select
              value={newPermission}
              onChange={e => setNewPermission(e.target.value as 'read' | 'write')}
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
            </select>
            <button
              onClick={handleCreateShare}
              disabled={creating}
              className="btn btn-primary flex items-center gap-2"
            >
              <Link className="w-4 h-4" />
              {creating ? 'Creating...' : 'Create Link'}
            </button>
          </div>
        </div>

        {/* Existing shares */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && shares.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : shares.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No share links yet</p>
              <p className="text-sm">Create a link to share this note</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Active Links ({shares.length})
              </p>
              {shares.map(share => (
                <ShareLinkItem
                  key={share.id}
                  share={share}
                  expired={isExpired(share)}
                  copied={copiedId === share.id}
                  onCopy={() => handleCopy(share.share_token, share.id)}
                  onDelete={() => removeShare(share.id)}
                  onPermissionChange={perm => updatePermission(share.id, perm)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ShareLinkItemProps {
  share: NoteShare
  expired: boolean
  copied: boolean
  onCopy: () => void
  onDelete: () => void
  onPermissionChange: (permission: 'read' | 'write') => void
  formatDate: (date: string) => string
}

function ShareLinkItem({
  share,
  expired,
  copied,
  onCopy,
  onDelete,
  onPermissionChange,
  formatDate,
}: ShareLinkItemProps) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        expired ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {share.permission === 'write' ? (
            <Edit3 className="w-4 h-4 text-orange-500" />
          ) : (
            <Globe className="w-4 h-4 text-blue-500" />
          )}
          <span className="text-sm font-medium">
            {share.permission === 'write' ? 'Can edit' : 'Can view'}
          </span>
          {expired && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              Expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Copy link"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-500" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-100 rounded transition-colors"
            title="Delete link"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Created {formatDate(share.created_at)}</span>
        {share.expires_at && (
          <span>
            {expired ? 'Expired' : 'Expires'} {formatDate(share.expires_at)}
          </span>
        )}
      </div>

      {/* Permission toggle */}
      {!expired && (
        <div className="mt-2 pt-2 border-t">
          <select
            value={share.permission}
            onChange={e => onPermissionChange(e.target.value as 'read' | 'write')}
            className="w-full text-sm px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="read">View only</option>
            <option value="write">Can edit</option>
          </select>
        </div>
      )}
    </div>
  )
}
