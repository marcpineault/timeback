import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="landing-page min-h-screen flex items-center justify-center">
      <SignUp
        fallbackRedirectUrl="/dashboard"
        signInFallbackRedirectUrl="/dashboard"
      />
    </div>
  )
}
