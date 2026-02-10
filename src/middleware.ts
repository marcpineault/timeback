import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing',
  '/privacy',
  '/terms',
  '/api/webhooks(.*)',
  '/api/upload', // Upload route handles its own auth after parsing body
  '/api/health', // Health check endpoint for monitoring
  '/api/instagram/callback', // Instagram OAuth callback
  '/api/cron(.*)', // Cron endpoints (auth via CRON_SECRET header)
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  // Add security headers to all responses
  const response = NextResponse.next()

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY')

  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Enforce HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  // Permissions policy to disable unnecessary browser features
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
