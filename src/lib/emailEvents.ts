import { logger } from './logger'

const LOOPS_API_KEY = process.env.LOOPS_API_KEY

interface EmailEventPayload {
  email: string
  userId: string
  eventName: string
  properties?: Record<string, string | number | boolean>
}

export async function fireEmailEvent(payload: EmailEventPayload): Promise<void> {
  if (!LOOPS_API_KEY) return

  try {
    await fetch('https://app.loops.so/api/v1/events/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payload.email,
        userId: payload.userId,
        eventName: payload.eventName,
        ...(payload.properties || {}),
      }),
    })
  } catch (error) {
    // Fire-and-forget: don't block the main flow
    logger.error('Loops email event failed', {
      eventName: payload.eventName,
      error: String(error),
    })
  }
}
