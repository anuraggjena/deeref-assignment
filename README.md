# 📌 HiveChat — Real-Time Team Messaging App

A modern full-stack chat application built as part of the **Full-Stack Internship Assignment**.
HiveChat supports real-time communication, channel-based conversations, online presence, message history, and collaboration features — all inspired by Slack/Discord UX patterns.

---

## 🚀 Live Demo

🔗 **Frontend:** https://deeref-assignment.vercel.app/
🔗 **Backend:** https://deeref-assignment-4ofl.onrender.com
🔗 **Database:** Neon Postgres (Cloud hosted)

---

## 🧠 Tech Stack

| Layer          | Technology                                               |
| -------------- | -------------------------------------------------------- |
| Frontend       | Next.js (App Router), TypeScript, TailwindCSS, ShadCN UI |
| Backend        | Node.js + Express                                        |
| Realtime       | Socket.io                                                |
| Database       | Neon Postgres + Drizzle ORM                              |
| Authentication | Clerk Auth                                               |
| Deployment     | Vercel (Frontend) + Render (Backend)                     |

---

## ✨ Features

### 🧾 Authentication

✔ Sign-up / login with Clerk
✔ Persistent sessions
✔ User management

### 💬 Channels

✔ Create channels
✔ Join / leave channels
✔ Member count updated in **real-time**
✔ Channel list syncs across all browsers instantly

### ⚡ Real-Time Messaging

✔ Messages synced instantly using WebSockets
✔ Sender details, timestamp, edit history
✔ Soft delete support
✔ Non-members cannot send messages (permissions enforced)

### 👥 Presence System

✔ See who's online across browsers and devices
✔ Live presence sync without refresh

### 🕓 Message History

✔ Loads latest messages by default
✔ “Load older messages” pagination
✔ Efficient DB queries (cursor-based)

### 🔤 Typing Indicators

✔ Shows when another user is typing
✔ Disappears after inactivity delay

### 🛠 Optional Enhancements Implemented

| Feature                    | Status |
| -------------------------- | ------ |
| Typing indicators          | ✅      |
| Edit message               | ✅      |
| Delete message             | ✅      |
| Realtime member count      | ✅      |
| Soft delete + edited flags | ✅      |
| Pagination                 | ✅      |

---

## 🧱 Project Structure

```
hivechat/
 ├── app/                 # Next.js App Router frontend
 ├── backend/             # Node + Express server
 ├── drizzle/             # Database schema + migrations
 ├── lib/                 # shared socket/io utils
 └── README.md
```

---

## 🛠 Installation & Setup (Local)

### 1️⃣ Clone repository

```sh
git clone https://github.com/username/hivechat.git
cd hivechat
```

### 2️⃣ Install dependencies

```sh
npm install
```

### 3️⃣ Setup environment variables

Create `.env` (Frontend):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<YOUR_KEY>
CLERK_SECRET_KEY=<YOUR_KEY>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Create `.env` in `/backend`:

```
DATABASE_URL=<NEON CONNECTION STRING>
PORT=4000
```

### 4️⃣ Run database migrations

```sh
npm run db:push
```

### 5️⃣ Start backend

```sh
cd backend
npm run dev
```

### 6️⃣ Start frontend

```sh
cd ..
npm run dev
```

---

## 🌐 Deployment

### Frontend (Vercel)

1. Push project to GitHub
2. Import repo into Vercel
3. Add environment variables
4. Deploy

### Backend (Render)

1. Create new **Web Service**
2. Connect same GitHub repo
3. Root folder: `backend`
4. Build command: `npm install`
5. Start command: `npm run start`
6. Add environment variables and deploy

### Database (Neon)

✔ Already cloud hosted — no extra work
