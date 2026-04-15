# ChatApp Project Overview

## Current Direction
ChatApp now has a Vercel-first deployment path using React and serverless APIs. The legacy Java desktop/server implementation is still in the repository for reference, but it is no longer required to launch on Vercel.

## Active Deployment Stack
- Frontend: React + Vite
- Backend: Vercel Serverless Functions (Node.js)
- Storage:
  - Vercel KV (recommended, persistent)
  - In-memory fallback (temporary, non-persistent)

## Active Architecture
- Browser client renders chat UI and sends requests to serverless APIs.
- API endpoints handle message listing and message publishing.
- Storage adapter writes to KV when configured, otherwise uses process memory.

Main web modules:
- `index.html`: Vite entry page
- `src/App.jsx`: React chat UI
- `src/main.jsx`: React bootstrap
- `src/index.css`: responsive and animated UI styling
- `api/messages.js`: message API endpoint
- `api/_store.js`: persistence abstraction
- `api/health.js`: service health endpoint
- `vercel.json`: runtime config
- `.vercelignore`: excludes non-web assets from deploy bundle

## Legacy Implementation
The original Java implementation remains under `src/main/java` and includes:
- JavaFX/Swing client code
- Java socket server
- SQLite persistence model

This legacy path can still be run locally via Maven, but it is not part of the Vercel deployment target.

## Runtime Flow (Web)
1. User opens deployed site.
2. Client polls `GET /api/messages` for updates.
3. User sends chat input to `POST /api/messages`.
4. API persists data to KV or in-memory fallback.
5. Messages are re-rendered in all connected clients on polling refresh.

## Recommended Next Enhancements
- Add auth provider (GitHub/Google) for identity
- Replace polling with managed realtime service (for example, Supabase Realtime or Pusher)
- Add message moderation rules and rate limiting middleware
- Add room support and per-room history
