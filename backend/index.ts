import express from "express"
import http from "http"
import { Server as SocketIOServer } from "socket.io"
import cors from "cors"
import dotenv from "dotenv"
import { db, channels, users, messages, channelMembers } from "./db"
import { desc, eq, and, asc, lt, sql } from "drizzle-orm"
import { randomUUID } from "crypto"

dotenv.config()

type PresenceInfo = {
  name: string | null
}

const onlineUsers = new Map<string, PresenceInfo & { count: number }>()

const app = express()
const server = http.createServer(app)

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

async function getDbUserByClerkId(clerkId?: string) {
  if (!clerkId) return null
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  })
}


// Health route
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hivechat-backend" })
})

// Sync user from Clerk
app.post("/users/sync", async (req, res) => {
  try {
    const { clerkId, name, imageUrl } = req.body as {
      clerkId?: string
      name?: string | null
      imageUrl?: string | null
    }

    console.log("[/users/sync] payload:", { clerkId, name, imageUrl })

    if (!clerkId) {
      return res.status(400).json({ error: "clerkId is required" })
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    })

    if (existing) {
      console.log("[/users/sync] updating existing user", existing.id)
      const [updated] = await db
        .update(users)
        .set({
          name: name ?? existing.name,
          imageUrl: imageUrl ?? existing.imageUrl,
        })
        .where(eq(users.clerkId, clerkId))
        .returning()

      return res.json(updated)
    }

    console.log("[/users/sync] creating new user")
    const [created] = await db
      .insert(users)
      .values({
        clerkId,
        name: name ?? null,
        imageUrl: imageUrl ?? null,
      })
      .returning()

    return res.status(201).json(created)
  } catch (err) {
    console.error("Error syncing user:", err)
    return res.status(500).json({ error: "Failed to sync user" })
  }
})

// Get all channels
app.get("/channels", async (req, res) => {
  try {
    const clerkId = req.query.clerkId as string | undefined
    const dbUser = await getDbUserByClerkId(clerkId)

    const allChannels = await db.query.channels.findMany({
      orderBy: asc(channels.createdAt),
    })

    // member counts per channel
    const countRows = await db
      .select({
        channelId: channelMembers.channelId,
        count: sql<number>`count(*)`,
      })
      .from(channelMembers)
      .groupBy(channelMembers.channelId)

    const countMap = new Map<string, number>()
    for (const row of countRows) {
      countMap.set(row.channelId, Number(row.count))
    }

    // which channel current user has joined
    let memberSet = new Set<string>()
    if (dbUser) {
      const membershipRows = await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(eq(channelMembers.userId, dbUser.id))

      memberSet = new Set(membershipRows.map((m) => m.channelId))
    }

    const result = allChannels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      createdAt: ch.createdAt,
      memberCount: countMap.get(ch.id) ?? 0,
      isMember: memberSet.has(ch.id),
    }))

    res.json(result)
  } catch (err) {
    console.error("Error fetching channels:", err)
    res.status(500).json({ error: "Failed to fetch channels" })
  }
})

// Create a new channel
app.post("/channels", async (req, res) => {
  try {
    const { name, description, clerkId } = req.body as {
      name?: string
      description?: string | null
      clerkId?: string
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Channel name is required" })
    }

    const dbUser = await getDbUserByClerkId(clerkId)

    const [createdChannel] = await db
      .insert(channels)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        createdBy: dbUser?.id ?? randomUUID(),
      })
      .returning()

    // creator auto-joins
    if (dbUser) {
      await db.insert(channelMembers).values({
        userId: dbUser.id,
        channelId: createdChannel.id,
      })
    }

    io.emit("channel:new", {
      id: createdChannel.id,
      name: createdChannel.name,
      description: createdChannel.description,
    })

    res.status(201).json(createdChannel)
  } catch (err) {
    console.error("Error creating channel:", err)
    res.status(500).json({ error: "Failed to create channel" })
  }
})

app.post("/channels/:id/join", async (req, res) => {
  try {
    const channelId = req.params.id
    const { clerkId } = req.body as { clerkId?: string }

    const dbUser = await getDbUserByClerkId(clerkId)
    if (!dbUser) {
      return res.status(404).json({ error: "User not found for clerkId" })
    }

    // check existing membership
    const existing = await db.query.channelMembers.findFirst({
      where: and(
        eq(channelMembers.userId, dbUser.id),
        eq(channelMembers.channelId, channelId)
      ),
    })

    if (!existing) {
      await db.insert(channelMembers).values({
        userId: dbUser.id,
        channelId,
      })
    }

    io.emit("channel:memberUpdate", {
      channelId,
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error("Error joining channel:", err)
    res.status(500).json({ error: "Failed to join channel" })
  }
})

app.post("/channels/:id/leave", async (req, res) => {
  try {
    const channelId = req.params.id
    const { clerkId } = req.body as { clerkId?: string }

    const dbUser = await getDbUserByClerkId(clerkId)
    if (!dbUser) {
      return res.status(404).json({ error: "User not found for clerkId" })
    }

    await db
      .delete(channelMembers)
      .where(
        and(
          eq(channelMembers.userId, dbUser.id),
          eq(channelMembers.channelId, channelId)
        )
      )

      io.emit("channel:memberUpdate", {
        channelId,
      })

      return res.json({ ok: true })
    } catch (err) {
      console.error("Error leaving channel:", err)
      res.status(500).json({ error: "Failed to leave channel" })
    }
  })


// Get messages for a specific channel
app.get("/channels/:id/messages", async (req, res) => {
  try {
    const channelId = req.params.id
    const cursor = req.query.cursor as string | undefined
    const limit = 30

    let whereClause = eq(messages.channelId, channelId)

    if (cursor) {
      whereClause = and(
        whereClause,
        lt(messages.createdAt, new Date(cursor))
      ) as typeof whereClause
    }

    const data = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        userId: messages.userId,
        content: messages.content,
        createdAt: messages.createdAt,
        userName: users.name,
        clerkId: users.clerkId,
        isDeleted: messages.isDeleted,
        updatedAt: messages.updatedAt,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(whereClause)
      .orderBy(lt(messages.createdAt, new Date(0)) ? asc(messages.createdAt) : asc(messages.createdAt)) // simple asc
      .limit(limit)

    res.json(data)
  } catch (err) {
    console.error("Error fetching messages:", err)
    res.status(500).json({ error: "Failed to fetch messages" })
  }
})

// Create a message
app.post("/channels/:id/messages", async (req, res) => {
  try {
    const channelId = req.params.id
    const { clerkId, content } = req.body as {
      clerkId?: string
      content?: string
    }

    if (!clerkId || !content?.trim()) {
      return res
        .status(400)
        .json({ error: "clerkId and content are required" })
    }

    const dbUser = await getDbUserByClerkId(clerkId)
    if (!dbUser) {
      return res.status(404).json({ error: "User not found for clerkId" })
    }

    const membership = await db.query.channelMembers.findFirst({
      where: and(
        eq(channelMembers.userId, dbUser.id),
        eq(channelMembers.channelId, channelId)
      ),
    })

    if (!membership) {
      return res
        .status(403)
        .json({ error: "Join the channel before sending messages" })
    }

    const [created] = await db
      .insert(messages)
      .values({
        channelId,
        userId: dbUser.id,
        content: content.trim(),
      })
      .returning()

    const payload = {
      id: created.id,
      channelId: created.channelId,
      userId: created.userId,
      content: created.content,
      createdAt: created.createdAt,
      userName: dbUser.name,
      clerkId: dbUser.clerkId,
    }

    io.to(channelId).emit("message:new", payload)

    res.status(201).json(payload)
  } catch (err) {
    console.error("Error creating message:", err)
    res.status(500).json({ error: "Failed to create message" })
  }
})

app.patch("/messages/:id", async (req, res) => {
  try {
    const messageId = req.params.id
    const { clerkId, content } = req.body as {
      clerkId?: string
      content?: string
    }

    if (!clerkId || !content?.trim()) {
      return res
        .status(400)
        .json({ error: "clerkId and content are required" })
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    })

    if (!dbUser) {
      return res.status(404).json({ error: "User not found for clerkId" })
    }

    const existing = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    })

    if (!existing) {
      return res.status(404).json({ error: "Message not found" })
    }

    if (existing.userId !== dbUser.id) {
      return res.status(403).json({ error: "Not allowed to edit this message" })
    }

    const [updated] = await db
      .update(messages)
      .set({
        content: content.trim(),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning()

    const payload = {
      id: updated.id,
      channelId: updated.channelId,
      userId: updated.userId,
      content: updated.content,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      isDeleted: updated.isDeleted,
      userName: dbUser.name,
      clerkId: dbUser.clerkId,
    }

    io.to(updated.channelId).emit("message:updated", payload)

    return res.json(payload)
  } catch (err) {
    console.error("Error editing message:", err)
    return res.status(500).json({ error: "Failed to edit message" })
  }
})

app.delete("/messages/:id", async (req, res) => {
  try {
    const messageId = req.params.id
    const { clerkId } = req.body as { clerkId?: string }

    if (!clerkId) {
      return res.status(400).json({ error: "clerkId is required" })
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    })

    if (!dbUser) {
      return res.status(404).json({ error: "User not found for clerkId" })
    }

    const existing = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    })

    if (!existing) {
      return res.status(404).json({ error: "Message not found" })
    }

    if (existing.userId !== dbUser.id) {
      return res
        .status(403)
        .json({ error: "Not allowed to delete this message" })
    }

    const [updated] = await db
      .update(messages)
      .set({
        isDeleted: true,
        content: "[deleted]",
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning()

    const payload = {
      id: updated.id,
      channelId: updated.channelId,
      userId: updated.userId,
      content: updated.content,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      isDeleted: updated.isDeleted,
      userName: dbUser.name,
      clerkId: dbUser.clerkId,
    }

    io.to(updated.channelId).emit("message:updated", payload)

    return res.json(payload)
  } catch (err) {
    console.error("Error deleting message:", err)
    return res.status(500).json({ error: "Failed to delete message" })
  }
})

// Socket.io handlers
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)

  socket.on(
    "presence:join",
    (payload: { clerkId: string; name: string | null }) => {
      const { clerkId, name } = payload || {}
      if (!clerkId) return

      socket.data.clerkId = clerkId

      const existing = onlineUsers.get(clerkId)
      if (existing) {
        onlineUsers.set(clerkId, {
          ...existing,
          count: existing.count + 1,
        })
      } else {
        onlineUsers.set(clerkId, {
          name: name ?? null,
          count: 1,
        })
      }

      broadcastPresence()
    }
  )

  socket.on("channel:join", (channelId: string) => {
    socket.join(channelId)
    console.log(`Socket ${socket.id} joined channel ${channelId}`)
  })

  socket.on(
    "typing",
    (payload: { channelId: string; clerkId: string; name: string | null; isTyping: boolean }) => {
      const { channelId, clerkId, name, isTyping } = payload
      if (!channelId || !clerkId) return

      // send to others in the same channel
      socket.to(channelId).emit("typing:update", {
        channelId,
        clerkId,
        name,
        isTyping,
      })
    }
  )

  socket.on("disconnect", () => {
    const clerkId = socket.data.clerkId as string | undefined
    if (clerkId && onlineUsers.has(clerkId)) {
      const info = onlineUsers.get(clerkId)!
      const nextCount = info.count - 1
      if (nextCount <= 0) {
        onlineUsers.delete(clerkId)
      } else {
        onlineUsers.set(clerkId, { ...info, count: nextCount })
      }
      broadcastPresence()
    }

    console.log("Client disconnected:", socket.id)
  })
})

function broadcastPresence() {
  const list = Array.from(onlineUsers.entries()).map(
    ([clerkId, { name }]) => ({
      clerkId,
      name,
    })
  )
  io.emit("presence:update", list)
}

app.get("/presence", (_req, res) => {
  const list = Array.from(onlineUsers.entries()).map(
    ([clerkId, { name }]) => ({
      clerkId,
      name,
    })
  )
  res.json(list)
})

server.listen(PORT, () => {
  console.log(`HiveChat backend running on http://localhost:${PORT}`)
})
