"use client"

import { useEffect, useRef } from "react"
import { useUser } from "@clerk/nextjs"
import { BACKEND_URL } from "@/lib/api"

export function useSyncUser() {
  const { user, isLoaded, isSignedIn } = useUser()
  const hasSyncedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return
    if (hasSyncedRef.current) return

    const sync = async () => {
      try {
        console.log("[useSyncUser] syncing user", user.id)
        const res = await fetch(`${BACKEND_URL}/users/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clerkId: user.id,
            name:
              user.fullName ||
              user.username ||
              user.primaryEmailAddress?.emailAddress,
            imageUrl: user.imageUrl,
          }),
        })

        if (!res.ok) {
          console.error("[useSyncUser] sync failed", await res.text())
          return
        }

        hasSyncedRef.current = true
        console.log("[useSyncUser] sync success")
      } catch (err) {
        console.error("[useSyncUser] error", err)
      }
    }

    sync()
  }, [isLoaded, isSignedIn, user])
}
