"use client"

import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="flex min-h-[420px] w-full items-center justify-center pl-2">
      <div className="w-full max-w-md space-y-6 pt-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-50">
            Create your Hive
          </h2>
          <p className="text-sm text-slate-400">
            Sign up to start collaborating with your team in real-time.
          </p>
        </div>
        <SignUp
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
