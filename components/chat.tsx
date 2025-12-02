"use client"

import { useEffect, useRef, useState } from "react"
import { BACKEND_URL } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import { useUser } from "@clerk/nextjs"
import { Pencil, Trash2 } from "lucide-react"

type Message = {
  id: string
  channelId: string
  userId: string
  content: string
  createdAt: string
  userName: string | null
  clerkId: string
  isDeleted?: boolean
  updatedAt?: string | null
}

type TypingMap = Record<string, string | null>

export function Chat({
  channelId,
  canSend,
}: {
  channelId: string
  canSend: boolean
}) {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [typingUsers, setTypingUsers] = useState<TypingMap>({})
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const fetchMessages = async (cursor?: string) => {
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
      const res = await fetch(
        `${BACKEND_URL}/channels/${channelId}/messages${params}`
      )
      if (!res.ok) {
        const text = await res.text()
        console.error("Failed to fetch messages:", res.status, text)
        return
      }
      const data: Message[] = await res.json()

      if (cursor) {
        setMessages((prev) => [...data, ...prev])
        if (data.length === 0) setHasMore(false)
      } else {
        setMessages(data)
        setHasMore(data.length > 0)
      }
    } catch (err) {
      console.error("Error fetching messages:", err)
    }
  }

  const loadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]
    await fetchMessages(oldest.createdAt)
    setLoadingMore(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || !user || !canSend) return

    try {
      const res = await fetch(`${BACKEND_URL}/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: input,
          clerkId: user.id,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error("Failed to send message:", res.status, text)
        return
      }
      setInput("")
    } catch (err) {
      console.error("Error sending message:", err)
    }
  }

  const startEdit = (msg: Message) => {
    setEditingId(msg.id)
    setEditText(msg.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText("")
  }

  const saveEdit = async (id: string) => {
    if (!user || !editText.trim()) return
    try {
      const res = await fetch(`${BACKEND_URL}/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkId: user.id,
          content: editText,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error("Failed to edit message:", res.status, text)
        return
      }
      setEditingId(null)
      setEditText("")
    } catch (err) {
      console.error("Error editing message:", err)
    }
  }

  const deleteMessage = async (id: string) => {
    if (!user) return
    try {
      const res = await fetch(`${BACKEND_URL}/messages/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkId: user.id }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error("Failed to delete message:", res.status, text)
        return
      }
    } catch (err) {
      console.error("Error deleting message:", err)
    }
  }

  useEffect(() => {
    const socket = getSocket()
    socket?.emit("channel:join", channelId)

    fetchMessages()

    socket?.on("message:new", (msg: Message) => {
      if (msg.channelId === channelId) {
        setMessages((prev) => [...prev, msg])
      }
    })

    socket?.on("message:updated", (msg: Message) => {
      if (msg.channelId !== channelId) return
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
    })

    socket?.on(
      "typing:update",
      (payload: {
        channelId: string
        clerkId: string
        name: string | null
        isTyping: boolean
      }) => {
        if (payload.channelId !== channelId) return
        setTypingUsers((prev) => {
          const next: TypingMap = { ...prev }
          if (payload.isTyping) {
            next[payload.clerkId] = payload.name
          } else {
            delete next[payload.clerkId]
          }
          return next
        })
      }
    )

    return () => {
      socket?.off("message:new")
      socket?.off("message:updated")
      socket?.off("typing:update")
    }
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleInputChange = (value: string) => {
    if (!canSend) return
    setInput(value)
    if (!user) return
    const socket = getSocket()
    if (!socket) return

    socket.emit("typing", {
      channelId,
      clerkId: user.id,
      name:
        user.fullName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress ||
        null,
      isTyping: true,
    })

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        channelId,
        clerkId: user.id,
        name: null,
        isTyping: false,
      })
    }, 1500)
  }

  const typingNames = Object.values(typingUsers).filter(Boolean)

  return (
    <div className="flex h-full w-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col space-y-3">
        {hasMore && (
          <button
            onClick={loadOlder}
            disabled={loadingMore}
            className="self-center mb-1 text-[11px] text-slate-400 hover:text-slate-200"
          >
            {loadingMore ? "Loading..." : "Load older messages"}
          </button>
        )}

        {messages.map((msg) => {
          const isMine = user && msg.clerkId === user.id
          const name = msg.userName || (isMine ? "You" : "Member")
          const isEditing = editingId === msg.id
          const isDeleted = msg.isDeleted

          return (
            <div
              key={msg.id}
              className={`flex w-full ${
                isMine ? "justify-end" : "justify-start"
              }`}
            >
              <div className="group max-w-[60%] space-y-1">
                {isEditing && !isDeleted ? (
                  <div className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-50">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-xs outline-none focus:border-slate-400"
                    />
                    <div className="mt-2 flex justify-end gap-2 text-[11px]">
                      <button
                        onClick={() => saveEdit(msg.id)}
                        className="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-lg px-3 py-2 text-sm wrap-break-word ${
                      isDeleted
                        ? "bg-slate-800 text-slate-500 italic"
                        : isMine
                        ? "bg-blue-600 text-slate-50"
                        : "bg-slate-700 text-slate-50"
                    }`}
                  >
                    {isDeleted ? "Message deleted" : msg.content}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  {!isMine && (
                    <span className="font-medium truncate max-w-20">
                      {name}
                    </span>
                  )}
                  <span>
                    {formatTime(msg.createdAt)}
                    {msg.updatedAt && !isDeleted ? " · edited" : ""}
                  </span>

                  {isMine && !isDeleted && !isEditing && (
                    <span className="ml-auto flex items-center gap-1 transition-opacity">
                      <button
                        onClick={() => startEdit(msg)}
                        className="p-1 rounded hover:bg-slate-800"
                        title="Edit message"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="p-1 rounded hover:bg-slate-800"
                        title="Delete message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {typingNames.length > 0 && (
          <div className="text-[11px] text-slate-400 italic">
            {typingNames.join(", ")} is typing...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            disabled={!canSend}
            className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed focus:border-slate-400"
            placeholder={
              canSend ? "Send a message..." : "Join this channel to send messages"
            }
          />
          <button
            onClick={sendMessage}
            disabled={!canSend || !input.trim()}
            className="px-4 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
