"use client"

import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="flex min-h-[420px] w-full items-center justify-center pl-2">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-50">
            Welcome back
          </h2>
          <p className="text-sm text-slate-400">
            Sign in to access your channels and conversations.
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary:
                "bg-slate-50 text-slate-900 hover:bg-slate-200",
            },
          }}
        />
      </div>
    </div>
  )
}
