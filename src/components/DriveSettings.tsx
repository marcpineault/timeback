'use client'

import { useState, useEffect } from 'react'

export default function DriveSettings() {
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/drive/status')
        if (response.ok) {
          const data = await response.json()
          setIsConnected(data.connected)
        }
      } catch (error) {
        console.error('Failed to check Drive status:', error)
      } finally {
        setIsLoading(false)
      }
    }
    checkStatus()
  }, [])

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const response = await fetch('/api/drive/disconnect', { method: 'POST' })
      if (response.ok) {
        setIsConnected(false)
      }
    } catch (error) {
      console.error('Failed to disconnect Drive:', error)
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-green-400 text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 19.5h20L12 2zm0 4l6.5 11.5h-13L12 6z"/>
          </svg>
          <span className="hidden sm:inline">Drive</span>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="text-gray-500 hover:text-red-400 transition-colors text-xs"
          title="Disconnect Google Drive"
        >
          {isDisconnecting ? '...' : '✕'}
        </button>
      </div>
    )
  }

  return (
    <a
      href="/api/auth/google"
      className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
      title="Connect Google Drive"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 19.5h20L12 2zm0 4l6.5 11.5h-13L12 6z"/>
      </svg>
      <span className="hidden sm:inline">Drive</span>
    </a>
  )
}
