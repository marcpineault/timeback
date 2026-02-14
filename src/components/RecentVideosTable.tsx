'use client'

import { useState, useMemo } from 'react'

interface Video {
  id: string
  originalName: string
  status: string
  createdAt: string
  processedUrl: string | null
}

interface RecentVideosTableProps {
  videos: Video[]
}

const STATUS_OPTIONS = ['ALL', 'COMPLETED', 'PROCESSING', 'PENDING', 'FAILED'] as const

const STATUS_CLASSES: Record<string, string> = {
  COMPLETED: 'status-completed',
  PROCESSING: 'status-processing',
  PENDING: 'status-queued',
  FAILED: 'status-failed',
  SCHEDULED: 'status-scheduled',
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  PROCESSING: 'Processing',
  PENDING: 'Queued',
  FAILED: 'Failed',
  SCHEDULED: 'Scheduled',
}

const ITEMS_PER_PAGE = 10

export default function RecentVideosTable({ videos }: RecentVideosTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter videos
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      const matchesSearch = !searchQuery || v.originalName.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [videos, searchQuery, statusFilter])

  // Pagination
  const totalPages = Math.ceil(filteredVideos.length / ITEMS_PER_PAGE)
  const paginatedVideos = filteredVideos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Selection
  const allPageSelected = paginatedVideos.length > 0 && paginatedVideos.every(v => selectedIds.has(v.id))
  const someSelected = selectedIds.size > 0

  function toggleSelectAll() {
    if (allPageSelected) {
      const newSet = new Set(selectedIds)
      paginatedVideos.forEach(v => newSet.delete(v.id))
      setSelectedIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      paginatedVideos.forEach(v => newSet.add(v.id))
      setSelectedIds(newSet)
    }
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  function handleBulkDownload() {
    const selected = videos.filter(v => selectedIds.has(v.id) && v.status === 'COMPLETED' && v.processedUrl)
    selected.forEach((video, i) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = video.processedUrl!
        link.download = video.originalName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }, i * 500)
    })
  }

  const selectedCompletedCount = videos.filter(v => selectedIds.has(v.id) && v.status === 'COMPLETED' && v.processedUrl).length

  return (
    <div className="mt-6 sm:mt-8">
      <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-3 sm:mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>
        Recent Videos
      </h3>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            className="w-full bg-white border border-[#e0dbd4] text-[#0a0a0a] rounded-full pl-10 pr-4 py-2 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          className="bg-white border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#e85d26]"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : STATUS_LABELS[s] || s}</option>
          ))}
        </select>
      </div>

      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-[#f5f0e8] border border-[#e0dbd4] rounded-full">
          <span className="text-sm text-[#0a0a0a] font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          {selectedCompletedCount > 0 && (
            <button
              onClick={handleBulkDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download ({selectedCompletedCount})
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-xs transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {paginatedVideos.map((video) => (
          <div key={video.id} className="bg-white border border-[#e0dbd4] rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-2">
              <input
                type="checkbox"
                checked={selectedIds.has(video.id)}
                onChange={() => toggleSelect(video.id)}
                className="mt-1 rounded border-[#e0dbd4] text-[#e85d26] focus:ring-[#e85d26]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-[#0a0a0a] text-sm font-medium truncate flex-1 mr-2">{video.originalName}</p>
                  <span className={`status-badge flex-shrink-0 ${STATUS_CLASSES[video.status] || 'status-queued'}`}>
                    {STATUS_LABELS[video.status] || video.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8a8580] text-xs">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                  {video.status === 'COMPLETED' && video.processedUrl && (
                    <a href={video.processedUrl} className="text-[#e85d26] hover:text-[#d14d1a] text-sm font-medium" download>
                      Download
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-white border border-[#e0dbd4] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f5f0e8]">
            <tr>
              <th className="text-left px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-[#e0dbd4] text-[#e85d26] focus:ring-[#e85d26]"
                />
              </th>
              <th className="text-left text-[#8a8580] text-sm font-medium px-4 py-3">Name</th>
              <th className="text-left text-[#8a8580] text-sm font-medium px-4 py-3">Status</th>
              <th className="text-left text-[#8a8580] text-sm font-medium px-4 py-3">Date</th>
              <th className="text-left text-[#8a8580] text-sm font-medium px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0dbd4]">
            {paginatedVideos.map((video) => (
              <>
                <tr
                  key={video.id}
                  className="video-table-row cursor-pointer"
                  onClick={(e) => {
                    // Don't expand when clicking checkbox or download link
                    if ((e.target as HTMLElement).closest('input, a')) return
                    setExpandedId(expandedId === video.id ? null : video.id)
                  }}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(video.id)}
                      onChange={() => toggleSelect(video.id)}
                      className="rounded border-[#e0dbd4] text-[#e85d26] focus:ring-[#e85d26]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Video thumbnail placeholder */}
                      <div className="w-10 h-10 bg-[#f5f0e8] border border-[#e0dbd4] rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-[#0a0a0a] text-sm truncate">{video.originalName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`status-badge ${STATUS_CLASSES[video.status] || 'status-queued'}`}>
                      {STATUS_LABELS[video.status] || video.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#8a8580] text-sm">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {video.status === 'COMPLETED' && video.processedUrl && (
                        <a href={video.processedUrl} className="text-[#e85d26] hover:text-[#d14d1a] text-sm" download onClick={e => e.stopPropagation()}>
                          Download
                        </a>
                      )}
                      <svg className={`w-4 h-4 text-[#8a8580] transition-transform ${expandedId === video.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </td>
                </tr>
                {/* Expanded row details */}
                {expandedId === video.id && (
                  <tr key={`${video.id}-detail`}>
                    <td colSpan={5} className="px-4 py-0">
                      <div className="expand-row py-4 pl-14">
                        <div className="flex items-start gap-6">
                          {video.status === 'COMPLETED' && video.processedUrl ? (
                            <div className="w-40 h-24 bg-[#0a0a0a] rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                              <video
                                src={video.processedUrl}
                                className="w-full h-full object-cover"
                                muted
                                preload="metadata"
                              />
                            </div>
                          ) : (
                            <div className="w-40 h-24 bg-[#f5f0e8] border border-[#e0dbd4] rounded-lg flex items-center justify-center flex-shrink-0">
                              <svg className="w-8 h-8 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="text-sm space-y-1">
                            <p className="text-[#0a0a0a] font-medium">{video.originalName}</p>
                            <p className="text-[#8a8580]">
                              Status: <span className={`font-medium ${video.status === 'COMPLETED' ? 'text-green-600' : video.status === 'FAILED' ? 'text-red-500' : 'text-[#e85d26]'}`}>{STATUS_LABELS[video.status] || video.status}</span>
                            </p>
                            <p className="text-[#8a8580]">
                              Uploaded: {new Date(video.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[#8a8580]">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredVideos.length)} of {filteredVideos.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-white border border-[#e0dbd4] rounded-full text-sm text-[#0a0a0a] hover:bg-[#f5f0e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  page === currentPage ? 'bg-[#e85d26] text-white' : 'text-[#8a8580] hover:bg-[#f5f0e8]'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-white border border-[#e0dbd4] rounded-full text-sm text-[#0a0a0a] hover:bg-[#f5f0e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Empty state for filtered results */}
      {filteredVideos.length === 0 && (searchQuery || statusFilter !== 'ALL') && (
        <div className="text-center py-8">
          <p className="text-[#8a8580] text-sm">No videos match your search or filter.</p>
          <button
            onClick={() => { setSearchQuery(''); setStatusFilter('ALL') }}
            className="text-[#e85d26] hover:text-[#d14d1a] text-sm mt-1"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
