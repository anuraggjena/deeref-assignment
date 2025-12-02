"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = require("crypto");
dotenv_1.default.config();
const onlineUsers = new Map();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: [
            process.env.FRONTEND_ORIGIN || "http://localhost:3000",
            "https://deeref-assignment.vercel.app/"
        ],
        methods: ["GET", "POST"],
    },
});
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)({
    origin: [
        "http://localhost:3000",
        "https://deeref-assignment.vercel.app/",
    ],
    credentials: true
}));
app.use(express_1.default.json());
async function getDbUserByClerkId(clerkId) {
    if (!clerkId)
        return null;
    return db_1.db.query.users.findFirst({
        where: (0, drizzle_orm_1.eq)(db_1.users.clerkId, clerkId),
    });
}
// Health route
app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "hivechat-backend" });
});
// Sync user from Clerk
app.post("/users/sync", async (req, res) => {
    try {
        const { clerkId, name, imageUrl } = req.body;
        console.log("[/users/sync] payload:", { clerkId, name, imageUrl });
        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }
        const existing = await db_1.db.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.users.clerkId, clerkId),
        });
        if (existing) {
            console.log("[/users/sync] updating existing user", existing.id);
            const [updated] = await db_1.db
                .update(db_1.users)
                .set({
                name: name ?? existing.name,
                imageUrl: imageUrl ?? existing.imageUrl,
            })
                .where((0, drizzle_orm_1.eq)(db_1.users.clerkId, clerkId))
                .returning();
            return res.json(updated);
        }
        console.log("[/users/sync] creating new user");
        const [created] = await db_1.db
            .insert(db_1.users)
            .values({
            clerkId,
            name: name ?? null,
            imageUrl: imageUrl ?? null,
        })
            .returning();
        return res.status(201).json(created);
    }
    catch (err) {
        console.error("Error syncing user:", err);
        return res.status(500).json({ error: "Failed to sync user" });
    }
});
// Get all channels
app.get("/channels", async (req, res) => {
    try {
        const clerkId = req.query.clerkId;
        const dbUser = await getDbUserByClerkId(clerkId);
        const allChannels = await db_1.db.query.channels.findMany({
            orderBy: (0, drizzle_orm_1.asc)(db_1.channels.createdAt),
        });
        // member counts per channel
        const countRows = await db_1.db
            .select({
            channelId: db_1.channelMembers.channelId,
            count: (0, drizzle_orm_1.sql) `count(*)`,
        })
            .from(db_1.channelMembers)
            .groupBy(db_1.channelMembers.channelId);
        const countMap = new Map();
        for (const row of countRows) {
            countMap.set(row.channelId, Number(row.count));
        }
        // which channel current user has joined
        let memberSet = new Set();
        if (dbUser) {
            const membershipRows = await db_1.db
                .select({ channelId: db_1.channelMembers.channelId })
                .from(db_1.channelMembers)
                .where((0, drizzle_orm_1.eq)(db_1.channelMembers.userId, dbUser.id));
            memberSet = new Set(membershipRows.map((m) => m.channelId));
        }
        const result = allChannels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            description: ch.description,
            createdAt: ch.createdAt,
            memberCount: countMap.get(ch.id) ?? 0,
            isMember: memberSet.has(ch.id),
        }));
        res.json(result);
    }
    catch (err) {
        console.error("Error fetching channels:", err);
        res.status(500).json({ error: "Failed to fetch channels" });
    }
});
// Create a new channel
app.post("/channels", async (req, res) => {
    try {
        const { name, description, clerkId } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Channel name is required" });
        }
        const dbUser = await getDbUserByClerkId(clerkId);
        const [createdChannel] = await db_1.db
            .insert(db_1.channels)
            .values({
            name: name.trim(),
            description: description?.trim() || null,
            createdBy: dbUser?.id ?? (0, crypto_1.randomUUID)(),
        })
            .returning();
        // creator auto-joins
        if (dbUser) {
            await db_1.db.insert(db_1.channelMembers).values({
                userId: dbUser.id,
                channelId: createdChannel.id,
            });
        }
        io.emit("channel:new", {
            id: createdChannel.id,
            name: createdChannel.name,
            description: createdChannel.description,
        });
        res.status(201).json(createdChannel);
    }
    catch (err) {
        console.error("Error creating channel:", err);
        res.status(500).json({ error: "Failed to create channel" });
    }
});
app.post("/channels/:id/join", async (req, res) => {
    try {
        const channelId = req.params.id;
        const { clerkId } = req.body;
        const dbUser = await getDbUserByClerkId(clerkId);
        if (!dbUser) {
            return res.status(404).json({ error: "User not found for clerkId" });
        }
        // check existing membership
        const existing = await db_1.db.query.channelMembers.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.channelMembers.userId, dbUser.id), (0, drizzle_orm_1.eq)(db_1.channelMembers.channelId, channelId)),
        });
        if (!existing) {
            await db_1.db.insert(db_1.channelMembers).values({
                userId: dbUser.id,
                channelId,
            });
        }
        io.emit("channel:memberUpdate", {
            channelId,
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Error joining channel:", err);
        res.status(500).json({ error: "Failed to join channel" });
    }
});
app.post("/channels/:id/leave", async (req, res) => {
    try {
        const channelId = req.params.id;
        const { clerkId } = req.body;
        const dbUser = await getDbUserByClerkId(clerkId);
        if (!dbUser) {
            return res.status(404).json({ error: "User not found for clerkId" });
        }
        await db_1.db
            .delete(db_1.channelMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.channelMembers.userId, dbUser.id), (0, drizzle_orm_1.eq)(db_1.channelMembers.channelId, channelId)));
        io.emit("channel:memberUpdate", {
            channelId,
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Error leaving channel:", err);
        res.status(500).json({ error: "Failed to leave channel" });
    }
});
// Get messages for a specific channel
app.get("/channels/:id/messages", async (req, res) => {
    try {
        const channelId = req.params.id;
        const cursor = req.query.cursor;
        const limit = 30;
        let whereClause = (0, drizzle_orm_1.eq)(db_1.messages.channelId, channelId);
        if (cursor) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.lt)(db_1.messages.createdAt, new Date(cursor)));
        }
        const data = await db_1.db
            .select({
            id: db_1.messages.id,
            channelId: db_1.messages.channelId,
            userId: db_1.messages.userId,
            content: db_1.messages.content,
            createdAt: db_1.messages.createdAt,
            userName: db_1.users.name,
            clerkId: db_1.users.clerkId,
            isDeleted: db_1.messages.isDeleted,
            updatedAt: db_1.messages.updatedAt,
        })
            .from(db_1.messages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.messages.userId, db_1.users.id))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.lt)(db_1.messages.createdAt, new Date(0)) ? (0, drizzle_orm_1.asc)(db_1.messages.createdAt) : (0, drizzle_orm_1.asc)(db_1.messages.createdAt)) // simple asc
            .limit(limit);
        res.json(data);
    }
    catch (err) {
        console.error("Error fetching messages:", err);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});
// Create a message
app.post("/channels/:id/messages", async (req, res) => {
    try {
        const channelId = req.params.id;
        const { clerkId, content } = req.body;
        if (!clerkId || !content?.trim()) {
            return res
                .status(400)
                .json({ error: "clerkId and content are required" });
        }
        const dbUser = await getDbUserByClerkId(clerkId);
        if (!dbUser) {
            return res.status(404).json({ error: "User not found for clerkId" });
        }
        const membership = await db_1.db.query.channelMembers.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.channelMembers.userId, dbUser.id), (0, drizzle_orm_1.eq)(db_1.channelMembers.channelId, channelId)),
        });
        if (!membership) {
            return res
                .status(403)
                .json({ error: "Join the channel before sending messages" });
        }
        const [created] = await db_1.db
            .insert(db_1.messages)
            .values({
            channelId,
            userId: dbUser.id,
            content: content.trim(),
        })
            .returning();
        const payload = {
            id: created.id,
            channelId: created.channelId,
            userId: created.userId,
            content: created.content,
            createdAt: created.createdAt,
            userName: dbUser.name,
            clerkId: dbUser.clerkId,
        };
        io.to(channelId).emit("message:new", payload);
        res.status(201).json(payload);
    }
    catch (err) {
        console.error("Error creating message:", err);
        res.status(500).json({ error: "Failed to create message" });
    }
});
app.patch("/messages/:id", async (req, res) => {
    try {
        const messageId = req.params.id;
        const { clerkId, content } = req.body;
        if (!clerkId || !content?.trim()) {
            return res
                .status(400)
                .json({ error: "clerkId and content are required" });
        }
        const dbUser = await db_1.db.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.users.clerkId, clerkId),
        });
        if (!dbUser) {
            return res.status(404).json({ error: "User not found for clerkId" });
        }
        const existing = await db_1.db.query.messages.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.messages.id, messageId),
        });
        if (!existing) {
            return res.status(404).json({ error: "Message not found" });
        }
        if (existing.userId !== dbUser.id) {
            return res.status(403).json({ error: "Not allowed to edit this message" });
        }
        const [updated] = await db_1.db
            .update(db_1.messages)
            .set({
            content: content.trim(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.messages.id, messageId))
            .returning();
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
        };
        io.to(updated.channelId).emit("message:updated", payload);
        return res.json(payload);
    }
    catch (err) {
        console.error("Error editing message:", err);
        return res.status(500).json({ error: "Failed to edit message" });
    }
});
app.delete("/messages/:id", async (req, res) => {
    try {
        const messageId = req.params.id;
        const { clerkId } = req.body;
        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }
        const dbUser = await db_1.db.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.users.clerkId, clerkId),
        });
        if (!dbUser) {
            return res.status(404).json({ error: "User not found for clerkId" });
        }
        const existing = await db_1.db.query.messages.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.messages.id, messageId),
        });
        if (!existing) {
            return res.status(404).json({ error: "Message not found" });
        }
        if (existing.userId !== dbUser.id) {
            return res
                .status(403)
                .json({ error: "Not allowed to delete this message" });
        }
        const [updated] = await db_1.db
            .update(db_1.messages)
            .set({
            isDeleted: true,
            content: "[deleted]",
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.messages.id, messageId))
            .returning();
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
        };
        io.to(updated.channelId).emit("message:updated", payload);
        return res.json(payload);
    }
    catch (err) {
        console.error("Error deleting message:", err);
        return res.status(500).json({ error: "Failed to delete message" });
    }
});
// Socket.io handlers
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("presence:join", (payload) => {
        const { clerkId, name } = payload || {};
        if (!clerkId)
            return;
        socket.data.clerkId = clerkId;
        const existing = onlineUsers.get(clerkId);
        if (existing) {
            onlineUsers.set(clerkId, {
                ...existing,
                count: existing.count + 1,
            });
        }
        else {
            onlineUsers.set(clerkId, {
                name: name ?? null,
                count: 1,
            });
        }
        broadcastPresence();
    });
    socket.on("channel:join", (channelId) => {
        socket.join(channelId);
        console.log(`Socket ${socket.id} joined channel ${channelId}`);
    });
    socket.on("typing", (payload) => {
        const { channelId, clerkId, name, isTyping } = payload;
        if (!channelId || !clerkId)
            return;
        // send to others in the same channel
        socket.to(channelId).emit("typing:update", {
            channelId,
            clerkId,
            name,
            isTyping,
        });
    });
    socket.on("disconnect", () => {
        const clerkId = socket.data.clerkId;
        if (clerkId && onlineUsers.has(clerkId)) {
            const info = onlineUsers.get(clerkId);
            const nextCount = info.count - 1;
            if (nextCount <= 0) {
                onlineUsers.delete(clerkId);
            }
            else {
                onlineUsers.set(clerkId, { ...info, count: nextCount });
            }
            broadcastPresence();
        }
        console.log("Client disconnected:", socket.id);
    });
});
function broadcastPresence() {
    const list = Array.from(onlineUsers.entries()).map(([clerkId, { name }]) => ({
        clerkId,
        name,
    }));
    io.emit("presence:update", list);
}
app.get("/presence", (_req, res) => {
    const list = Array.from(onlineUsers.entries()).map(([clerkId, { name }]) => ({
        clerkId,
        name,
    }));
    res.json(list);
});
server.listen(PORT, () => {
    console.log(`HiveChat backend running on http://localhost:${PORT}`);
});
