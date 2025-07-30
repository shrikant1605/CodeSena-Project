# CodeSena

A student-driven, tech-first community platform for collaborative learning, mentorship, and real-world projects.

## Tech Stack
- **Frontend:** React, Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** MongoDB

## Monorepo Structure
```
codesena/
  backend/   # Express API, MongoDB models
  frontend/  # React app, Tailwind CSS
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB (local or Atlas)

### Backend
```bash
cd codesena/backend
cp .env.example .env # or edit .env
npm install
node index.js
```

### Frontend
```bash
cd codesena/frontend
npm install
npm run dev
```

---

## Features (MVP)
- Authentication (JWT)
- Dashboard & Profile
- Workshops/Bootcamps
- Projects
- Mentorship & Points
- Leaderboard

---

Inspired by Vercel, Hashnode, and Linear. Clean, modern UI with blue/white theme and dark mode support.