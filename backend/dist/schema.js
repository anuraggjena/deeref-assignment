"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messages = exports.channelMembers = exports.channels = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// Users in our system, mapped from Clerk users
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    clerkId: (0, pg_core_1.text)("clerk_id").notNull().unique(),
    name: (0, pg_core_1.text)("name"),
    imageUrl: (0, pg_core_1.text)("image_url"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
// Channels
exports.channels = (0, pg_core_1.pgTable)("channels", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    createdBy: (0, pg_core_1.uuid)("created_by").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
// Membership of users in channels
exports.channelMembers = (0, pg_core_1.pgTable)("channel_members", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    channelId: (0, pg_core_1.uuid)("channel_id").notNull(),
    joinedAt: (0, pg_core_1.timestamp)("joined_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
// Messages inside channels
exports.messages = (0, pg_core_1.pgTable)("messages", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    channelId: (0, pg_core_1.uuid)("channel_id").notNull(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }),
    isDeleted: (0, pg_core_1.boolean)("is_deleted").default(false).notNull(),
});
