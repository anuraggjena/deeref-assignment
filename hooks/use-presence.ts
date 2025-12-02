"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { getSocket } from "@/lib/socket"
import { BACKEND_URL } from "@/lib/api"
import type { OnlineUser } from "@/lib/presence"

export function usePresence() {
  const { user } = useUser()
  const [online, setOnline] = useState<OnlineUser[]>([])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // initial presence fetch
    const fetchPresence = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/presence`)
        if (!res.ok) return
        const data: OnlineUser[] = await res.json()
        setOnline(data)
      } catch (e) {
        console.error("Failed to fetch presence", e)
      }
    }
    fetchPresence()

    socket.on("presence:update", (list: OnlineUser[]) => {
      setOnline(list)
    })

    return () => {
      socket.off("presence:update")
    }
  }, [])

  // tell server we're online when user is loaded
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !user) return

    socket.emit("presence:join", {
      clerkId: user.id,
      name:
        user.fullName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress ||
        null,
    })
  }, [user])

  return online
}
