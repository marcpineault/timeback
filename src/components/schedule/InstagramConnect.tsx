'use client'

import { useState } from 'react'
import { InstagramAccount } from '@/hooks/useSchedule'

interface InstagramConnectProps {
  accounts: InstagramAccount[]
  onConnected: () => void
}

export default function InstagramConnect({ accounts, onConnected }: InstagramConnectProps) {
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/instagram/auth', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.authUrl
      }
    } catch (err) {
      console.error('Failed to start Instagram auth:', err)
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm('Disconnect this Instagram account? All scheduled posts for this account will be cancelled.')) {
      return
    }

    setDisconnecting(accountId)
    try {
      await fetch(`/api/instagram/accounts/${accountId}`, { method: 'DELETE' })
      onConnected()
    } catch (err) {
      console.error('Failed to disconnect:', err)
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="bg-[#1A1A24] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Instagram Accounts</h3>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : '+ Connect Account'}
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-2">No Instagram accounts connected</p>
          <p className="text-gray-500 text-sm">
            Connect your Instagram Business or Creator account to start scheduling posts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-3 bg-[#2A2A3A] rounded-lg"
            >
              <div className="flex items-center gap-3">
                {account.instagramProfilePic ? (
                  <img
                    src={account.instagramProfilePic}
                    alt={account.instagramUsername}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold">
                    {account.instagramUsername[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">@{account.instagramUsername}</p>
                  <p className="text-gray-500 text-xs">
                    {account.facebookPageName || 'Connected'}
                    {!account.isActive && (
                      <span className="ml-2 text-red-400">Inactive - reconnect needed</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${account.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                <button
                  onClick={() => handleDisconnect(account.id)}
                  disabled={disconnecting === account.id}
                  className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                >
                  {disconnecting === account.id ? 'Removing...' : 'Disconnect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
