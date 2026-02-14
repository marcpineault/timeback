import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="landing-page min-h-screen flex items-center justify-center">
      <SignIn
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
      />
    </div>
  )
}
