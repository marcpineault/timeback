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

  // Connected accounts management view
  if (accounts.length > 0) {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#0a0a0a]">Instagram Accounts</h3>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : '+ Connect Account'}
          </button>
        </div>
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-3 bg-[#f5f0e8] rounded-2xl"
            >
              <div className="flex items-center gap-3">
                {account.instagramProfilePic ? (
                  <img
                    src={account.instagramProfilePic}
                    alt={account.instagramUsername}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#e85d26] flex items-center justify-center text-[#0a0a0a] font-bold">
                    {account.instagramUsername[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-[#0a0a0a] font-medium">@{account.instagramUsername}</p>
                  <p className="text-[#8a8580] text-xs">
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
                  className="text-[#8a8580] hover:text-red-400 text-sm transition-colors"
                >
                  {disconnecting === account.id ? 'Removing...' : 'Disconnect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state: guided onboarding
  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 sm:p-8">
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#e85d26] flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-[#0a0a0a] mb-2">Connect your Instagram</h3>
        <p className="text-[#8a8580] text-sm mb-6">
          Link your account so TimeBack can auto-publish your videos as Reels.
        </p>

        <div className="text-left bg-[#f5f0e8] rounded-2xl p-4 mb-6 space-y-3">
          <p className="text-sm font-medium text-[#0a0a0a] mb-2">Before you connect, make sure you have:</p>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(232,93,38,0.1)] text-[#e85d26] flex items-center justify-center text-xs font-bold">1</span>
            <p className="text-sm text-[#8a8580]">
              An <span className="text-[#0a0a0a]">Instagram Business or Creator</span> account (not a personal one)
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(232,93,38,0.1)] text-[#e85d26] flex items-center justify-center text-xs font-bold">2</span>
            <p className="text-sm text-[#8a8580]">
              A <span className="text-[#0a0a0a]">Facebook Page</span> linked to that Instagram account
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(232,93,38,0.1)] text-[#e85d26] flex items-center justify-center text-xs font-bold">3</span>
            <p className="text-sm text-[#8a8580]">
              When Facebook asks, <span className="text-[#0a0a0a]">select your Page</span> and approve all permissions
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full font-semibold transition-colors disabled:opacity-50"
        >
          {connecting ? 'Redirecting to Facebook...' : 'Connect with Facebook'}
        </button>

        <p className="text-gray-600 text-xs mt-3">
          Instagram publishing requires connecting through Facebook. We only request the permissions needed to post on your behalf.
        </p>
      </div>
    </div>
  )
}
