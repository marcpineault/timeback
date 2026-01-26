import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upgradeToEnterprise() {
  const email = 'mpineault1@gmail.com'

  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    console.error(`User with email ${email} not found`)
    process.exit(1)
  }

  console.log(`Found user: ${user.name || user.email} (current plan: ${user.plan})`)

  const updatedUser = await prisma.user.update({
    where: { email },
    data: { plan: 'ENTERPRISE' },
  })

  console.log(`Successfully upgraded ${updatedUser.email} to ENTERPRISE plan`)
  console.log('You now have unlimited videos, unlimited duration, and 4K resolution!')
}

upgradeToEnterprise()
  .catch((e) => {
    console.error('Error upgrading user:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
