'use client'

import { useState, useEffect } from 'react'
import { ScheduledPostData } from '@/hooks/useSchedule'

interface CalendarViewProps {
  onDayClick: (date: Date) => void
}

interface CalendarPost {
  id: string
  status: string
  scheduledFor: string
  video: { originalName: string }
}

export default function CalendarView({ onDayClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [posts, setPosts] = useState<CalendarPost[]>([])

  useEffect(() => {
    fetchCalendarPosts()
  }, [currentMonth])

  async function fetchCalendarPosts() {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1, 23, 59, 59)

    try {
      const res = await fetch(
        `/api/schedule/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts)
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err)
    }
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  // Count posts per day
  const postsByDay: Record<number, CalendarPost[]> = {}
  posts.forEach((p) => {
    const day = new Date(p.scheduledFor).getDate()
    if (!postsByDay[day]) postsByDay[day] = []
    postsByDay[day].push(p)
  })

  const monthName = currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          className="text-[#8a8580] hover:text-[#0a0a0a] transition-colors px-2 py-1"
        >
          &lt;
        </button>
        <h4 className="text-[#0a0a0a] font-medium">{monthName}</h4>
        <button
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          className="text-[#8a8580] hover:text-[#0a0a0a] transition-colors px-2 py-1"
        >
          &gt;
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-[#8a8580] text-xs py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
          const dayPosts = postsByDay[day] || []
          const hasScheduled = dayPosts.some((p) => p.status === 'SCHEDULED' || p.status === 'QUEUED')
          const hasPublished = dayPosts.some((p) => p.status === 'PUBLISHED')
          const hasFailed = dayPosts.some((p) => p.status === 'FAILED')

          return (
            <button
              key={day}
              onClick={() => onDayClick(new Date(year, month, day))}
              className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 text-sm transition-colors
                ${isToday ? 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]' : 'hover:bg-[#f5f0e8] text-[#8a8580]'}
                ${dayPosts.length > 0 ? 'cursor-pointer' : ''}`}
            >
              <span className={isToday ? 'font-bold' : ''}>{day}</span>
              {dayPosts.length > 0 && (
                <div className="flex gap-0.5">
                  {hasScheduled && <span className="w-1.5 h-1.5 rounded-full bg-[#e85d26]" />}
                  {hasPublished && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                  {hasFailed && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-[#8a8580]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#e85d26]" /> Scheduled
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" /> Published
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" /> Failed
        </div>
      </div>
    </div>
  )
}
