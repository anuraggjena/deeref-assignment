import "../globals.css"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="max-h flex items-stretch justify-center px-4 py-6 md:px-8 gap-8">
      {/* Left Panel */}
      <aside className="hidden flex-1 flex-col justify-between rounded-2xl bg-linear-to-b from-slate-900 to-slate-950 p-8 shadow-xl md:flex">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
            HiveChat
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
            A focused hive for your team&apos;s conversations.
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-400">
            Channels, real-time messaging, presence, and more — all in a
            minimal interface designed for fast collaboration.
          </p>
        </div>
        <div className="mt-8 space-y-2 text-xs text-slate-500">
          <p>Built by Anurag Jena.</p>
          <p className="text-slate-600">
            For Assignment Purpose.
          </p>
        </div>
      </aside>

      {/* Right Panel */}
      <main className="flex w-full max-w-md items-center justify-center rounded-2xl bg-slate-900/80 p-4 shadow-xl">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
