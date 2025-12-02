"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { BACKEND_URL } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Plus, Hash } from "lucide-react"
import { Chat } from "@/components/chat"
import { useSyncUser } from "@/hooks/use-sync-user"
import { usePresence } from "@/hooks/use-presence"
import { getSocket } from "@/lib/socket"
import { UserButton } from "@clerk/nextjs"

type Channel = {
  id: string
  name: string
  description: string | null
  createdAt: string
  memberCount: number
  isMember: boolean
}

export default function ChannelsPage() {
  useSyncUser()
  const { user } = useUser()
  const onlineUsers = usePresence()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  )
  const [loadingChannels, setLoadingChannels] = useState(false)

  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")

  // fetch channels from backend
  const fetchChannels = async (clerkId?: string) => {
  try {
    setLoadingChannels(true)

    const params = clerkId
      ? `?${new URLSearchParams({ clerkId }).toString()}`
      : ""

    const res = await fetch(`${BACKEND_URL}/channels${params}`)
    if (!res.ok) {
      console.error("Failed to fetch channels", await res.text())
      return
    }

    const data: Channel[] = await res.json()
    setChannels(data)

    if (!selectedChannelId && data.length > 0) {
      setSelectedChannelId(data[0].id)
    }
  } catch (err) {
    console.error("Failed to fetch channels", err)
  } finally {
    setLoadingChannels(false)
  }
}

  // create a new channel
  const handleCreateChannel = async () => {
    if (!newName.trim() || !user) return
    try {
      setIsCreating(true)
      const res = await fetch(`${BACKEND_URL}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription || null,
          clerkId: user.id,
        }),
      })
      if (!res.ok) {
        console.error("Failed to create channel")
        return
      }
      setNewName("")
      setNewDescription("")
      await fetchChannels()
    } catch (err) {
      console.error("Failed to create channel", err)
    } finally {
      setIsCreating(false)
    }
  }

  const joinChannel = async (channelId: string) => {
    if (!user) return
    try {
      await fetch(`${BACKEND_URL}/channels/${channelId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkId: user.id }),
      })
      await fetchChannels()
    } catch (err) {
      console.error("Failed to join channel", err)
    }
  }

  const leaveChannel = async (channelId: string) => {
    if (!user) return
    try {
      await fetch(`${BACKEND_URL}/channels/${channelId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkId: user.id }),
      })
      await fetchChannels()
    } catch (err) {
      console.error("Failed to leave channel", err)
    }
  }

 useEffect(() => {
  const socket = getSocket()

  fetchChannels()

  if (user?.id) {
    fetchChannels(user.id)
  }

  if (socket) {
    const handleNewChannel = () => fetchChannels(user?.id)
    const handleMemberUpdate = () => fetchChannels(user?.id)

    socket.on("channel:new", handleNewChannel)
    socket.on("channel:memberUpdate", handleMemberUpdate)

    return () => {
      socket.off("channel:new", handleNewChannel)
      socket.off("channel:memberUpdate", handleMemberUpdate)
    }
  }
}, [user])

  const selectedChannel = channels.find((c) => c.id === selectedChannelId)

  return (
    <div className="flex h-[80vh] rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
      {/* Channels sidebar */}
      <aside className="w-60 shrink-0 border-r border-slate-800 pr-4 flex flex-col">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Channels
            </p>
            <p className="text-[11px] text-slate-500">
              {loadingChannels
                ? "Loading..."
                : `${channels.length} channel${channels.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            onClick={handleCreateChannel}
            disabled={isCreating || !newName.trim()}
            title="Create channel"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition text-xs",
              (isCreating || !newName.trim()) && "opacity-50 cursor-default"
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
        </header>

        {/* New channel input */}
        <div className="mb-3 space-y-1.5 rounded-xl border border-dashed border-slate-700/80 bg-slate-900/60 p-2.5">
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] outline-none focus:border-slate-400"
            placeholder="New channel name (e.g. general)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] outline-none focus:border-slate-400"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <p className="text-[10px] text-slate-500">
            Press the + button to create.
          </p>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannelId(channel.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
                "border border-transparent hover:border-slate-700 hover:bg-slate-900/80",
                selectedChannelId === channel.id &&
                  "border-slate-600 bg-slate-900"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-800 text-[10px] text-slate-300">
                <Hash className="h-3 w-3" />
              </span>
              <span className="truncate text-slate-100">{channel.name}</span>
            </button>
          ))}

          {!loadingChannels && channels.length === 0 && (
            <p className="text-[11px] text-slate-500">
              No channels yet. Create your first one above.
            </p>
          )}
        </div>

        <div className="flex justify-center gap-3">
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-8 w-8",
              },
            }}
          /> You
        </div>
      </aside>

      {/* Chat area */}
      <section className="ml-4 flex flex-1 flex-col rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <header className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <p className="text-sm font-semibold text-slate-50 flex items-center gap-2">
              {selectedChannel ? (
                <>
                  <Hash className="h-4 w-4 text-slate-500" />
                  {selectedChannel.name}
                </>
              ) : (
                "No channel selected"
              )}
            </p>
            <p className="text-xs text-slate-500">
              {selectedChannel?.description ||
                "Select a channel to start chatting."}
            </p>

            {selectedChannel && (
              <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                <span>
                  {selectedChannel.memberCount} member
                  {selectedChannel.memberCount === 1 ? "" : "s"}
                </span>

                {selectedChannel.isMember ? (
                  <button
                    onClick={() => leaveChannel(selectedChannel.id)}
                    className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    Leave channel
                  </button>
                ) : (
                  <button
                    onClick={() => joinChannel(selectedChannel.id)}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-900 hover:bg-white"
                  >
                    Join channel
                  </button>
                )}
              </div>
            )}
          </div>
          {user && (
            <div className="flex flex-col items-end text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {onlineUsers.length} online
              </span>
              <span className="max-w-[220px] truncate text-slate-500">
                {onlineUsers
                  .map((u) => (u.clerkId === user.id ? "You" : u.name || "Member"))
                  .join(", ")}
              </span>
            </div>
          )}
        </header>

        <div className="mt-2 flex flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80">
          {selectedChannel && <Chat channelId={selectedChannel.id} canSend={selectedChannel.isMember} />}
        </div>
      </section>
    </div>
  )
}
