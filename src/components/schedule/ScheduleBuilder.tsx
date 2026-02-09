'use client'

import { useState } from 'react'
import { ScheduleSlot } from '@/hooks/useSchedule'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ScheduleBuilderProps {
  slots: ScheduleSlot[]
  instagramAccountId: string
  onSlotsChanged: () => void
}

export default function ScheduleBuilder({ slots, instagramAccountId, onSlotsChanged }: ScheduleBuilderProps) {
  const [adding, setAdding] = useState(false)
  const [newDay, setNewDay] = useState(1)
  const [newTime, setNewTime] = useState('09:00')
  const [quickSetting, setQuickSetting] = useState(false)

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Group slots by day
  const slotsByDay: Record<number, ScheduleSlot[]> = {}
  for (let d = 0; d < 7; d++) slotsByDay[d] = []
  slots.forEach((s) => {
    if (slotsByDay[s.dayOfWeek]) {
      slotsByDay[s.dayOfWeek].push(s)
    }
  })

  async function handleAddSlot() {
    setAdding(true)
    try {
      const res = await fetch('/api/schedule/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagramAccountId,
          dayOfWeek: newDay,
          timeOfDay: newTime,
          timezone,
        }),
      })
      if (res.ok) {
        onSlotsChanged()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to add slot')
      }
    } catch {
      alert('Failed to add slot')
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteSlot(slotId: string) {
    try {
      await fetch(`/api/schedule/slots/${slotId}`, { method: 'DELETE' })
      onSlotsChanged()
    } catch {
      alert('Failed to delete slot')
    }
  }

  async function handleQuickSetup(preset: string) {
    setQuickSetting(true)
    try {
      const res = await fetch('/api/schedule/slots/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, instagramAccountId, timezone }),
      })
      if (res.ok) {
        onSlotsChanged()
      }
    } catch {
      alert('Failed to apply preset')
    } finally {
      setQuickSetting(false)
    }
  }

  function formatTime(time24: string): string {
    const [h, m] = time24.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  return (
    <div className="bg-[#1A1A24] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Posting Schedule</h3>
          <p className="text-gray-500 text-sm">{timezone}</p>
        </div>
        <div className="text-gray-400 text-sm">
          {slots.length} slot{slots.length !== 1 ? 's' : ''}/week
        </div>
      </div>

      {/* Quick Setup */}
      <div className="flex gap-2 mb-6">
        <span className="text-gray-500 text-sm self-center">Quick:</span>
        {['1x', '2x', '3x'].map((preset) => (
          <button
            key={preset}
            onClick={() => handleQuickSetup(preset)}
            disabled={quickSetting}
            className="px-3 py-1.5 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {preset}/day
          </button>
        ))}
      </div>

      {/* Weekly Schedule Grid */}
      <div className="space-y-2 mb-6">
        {DAY_NAMES.map((dayName, dayIndex) => (
          <div key={dayIndex} className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-12 flex-shrink-0 hidden sm:block">
              {DAY_SHORT[dayIndex]}
            </span>
            <span className="text-gray-400 text-sm w-8 flex-shrink-0 sm:hidden">
              {DAY_SHORT[dayIndex].slice(0, 2)}
            </span>
            <div className="flex flex-wrap gap-2 flex-1">
              {slotsByDay[dayIndex].length === 0 ? (
                <span className="text-gray-600 text-sm italic">No posts</span>
              ) : (
                slotsByDay[dayIndex]
                  .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))
                  .map((slot) => (
                    <span
                      key={slot.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/20 text-violet-300 rounded-full text-xs font-medium"
                    >
                      {formatTime(slot.timeOfDay)}
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="hover:text-red-400 transition-colors ml-0.5"
                      >
                        x
                      </button>
                    </span>
                  ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Slot Form */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-800">
        <select
          value={newDay}
          onChange={(e) => setNewDay(Number(e.target.value))}
          className="bg-[#2A2A3A] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-violet-500 outline-none"
        >
          {DAY_NAMES.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="bg-[#2A2A3A] text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-violet-500 outline-none"
        />
        <button
          onClick={handleAddSlot}
          disabled={adding}
          className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {adding ? 'Adding...' : '+ Add Slot'}
        </button>
      </div>
    </div>
  )
}
