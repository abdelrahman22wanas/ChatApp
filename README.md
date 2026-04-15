# ChatApp (React + Vercel)

This repository now includes a Vercel-ready React chat app with serverless APIs.

## What Changed
- Replaced deploy target from JavaFX desktop apps to web + serverless APIs.
- Added a React/Vite client (`src/App.jsx`, `src/main.jsx`, `src/index.css`).
- Added Vercel serverless endpoints (`api/messages.js`, `api/health.js`).
- Added storage abstraction with Vercel KV support (`api/_store.js`).
- Added Vercel deployment config (`vercel.json`) and exclusion rules (`.vercelignore`).

## New Stack (Vercel-Compatible)
- Frontend: React + Vite
- Backend: Vercel Serverless Functions (Node.js 20)
- Storage:
	- Preferred: Vercel KV (persistent and shared)
	- Fallback: in-memory temporary storage (works for quick tests only)

## Files For The Web Version
- `index.html` - Vite entry page
- `src/App.jsx` - React chat UI
- `src/main.jsx` - React bootstrap
- `src/index.css` - responsive styling and animations
- `api/messages.js` - GET/POST chat messages API
- `api/_store.js` - KV + in-memory storage adapter
- `api/health.js` - health endpoint
- `vercel.json` - runtime config for serverless functions
- `.vercelignore` - excludes Java/Maven artifacts from Vercel deployment bundle

## Deploy To Vercel
1. Push this project to GitHub.
2. Import the repository in Vercel.
3. (Recommended) Add environment variables in the Vercel project:
	 - `KV_REST_API_URL`
	 - `KV_REST_API_TOKEN`
4. Deploy.

If KV variables are not configured, chat runs in temporary memory mode and messages are not guaranteed to persist.

## Local Quick Run
1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Open the shown local URL.

## Deploy Notes
Vercel will build the React app from `npm run build` and serve the `dist` output.

## Legacy Java Desktop Code
The JavaFX/Swing client-server implementation still exists in this repository under `src/` and can be kept as legacy reference. It is not required for Vercel deployment.
