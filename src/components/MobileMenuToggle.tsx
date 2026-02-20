'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export default function MobileMenuToggle() {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggle = useCallback(() => {
    setOpen(prev => !prev)
  }, [])

  useEffect(() => {
    const nav = btnRef.current?.closest('nav')
    if (nav) {
      nav.classList.toggle('mobile-open', open)
    }
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Close menu on window resize past mobile breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close menu when a nav link is clicked
  useEffect(() => {
    if (!open) return
    const nav = btnRef.current?.closest('nav')
    if (!nav) return
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.closest('a')) {
        setOpen(false)
      }
    }
    nav.addEventListener('click', handleClick)
    return () => nav.removeEventListener('click', handleClick)
  }, [open])

  return (
    <button
      ref={btnRef}
      className="mobile-menu-btn"
      onClick={toggle}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
    >
      <span className={`mobile-menu-icon${open ? ' open' : ''}`}>
        <span />
        <span />
        <span />
      </span>
    </button>
  )
}
