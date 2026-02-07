import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { validateSignupEmail, isEmailVerified } from '@/lib/signupSecurity'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET to .env')
  }

  // Rate limit webhook calls by IP to prevent abuse
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  const rateLimitResult = checkRateLimit(`ip:${ip}`, 'webhook')
  if (!rateLimitResult.allowed) {
    logger.warn('Webhook rate limit exceeded', { ip })
    return new Response('Too many requests', { status: 429 })
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  const eventType = evt.type

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data
    const primaryEmail = email_addresses[0]
    const email = primaryEmail?.email_address

    if (!email) {
      logger.warn('Signup blocked: no email address provided', { clerkId: id })
      return new Response('OK', { status: 200 })
    }

    // Check 1: Verify the email address has been verified by Clerk
    if (!isEmailVerified(primaryEmail)) {
      logger.warn('Signup blocked: email not verified', {
        clerkId: id,
        email,
      })
      return new Response('OK', { status: 200 })
    }

    // Check 2: Run signup security checks (disposable email, allowlist)
    const signupCheck = validateSignupEmail(email)
    if (!signupCheck.allowed) {
      logger.warn('Signup blocked by security check', {
        clerkId: id,
        email,
        reason: signupCheck.reason,
      })
      return new Response('OK', { status: 200 })
    }

    await prisma.user.create({
      data: {
        clerkId: id,
        email,
        name: [first_name, last_name].filter(Boolean).join(' ') || null,
      },
    })

    logger.info('New user created', { clerkId: id, email })
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data
    const email = email_addresses[0]?.email_address

    if (email) {
      await prisma.user.update({
        where: { clerkId: id },
        data: {
          email,
          name: [first_name, last_name].filter(Boolean).join(' ') || null,
        },
      })
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data
    if (id) {
      await prisma.user.delete({
        where: { clerkId: id },
      }).catch((err: unknown) => {
        // User may not exist in database (already deleted or never created)
        console.warn('[Clerk Webhook] Failed to delete user:', id, err instanceof Error ? err.message : err)
      })
    }
  }

  return new Response('OK', { status: 200 })
}
