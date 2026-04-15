# Full Feature Implementation Checklist

Status key: [ ] not started, [~] in progress, [x] done

## 1) Authentication (Clerk)
- [ ] Install and configure Clerk provider in frontend
- [ ] Add sign-in/sign-up screens and protected app shell
- [ ] Server-side session verification for all mutation APIs
- [ ] Audit trails use stable auth user IDs

## 2) Room Security
- [ ] Require room password/token for private rooms
- [ ] Join validation endpoint with rate-limited attempts
- [ ] Store per-room access policy

## 3) Host Transfer and Co-host
- [ ] Add co-host role in room state
- [ ] Transfer host action
- [ ] Auto host handoff if host leaves

## 4) Persistent Profiles
- [ ] Profile model (avatar, color, bio, status)
- [ ] Edit profile UI
- [ ] Render profile metadata in chat and participant list

## 5) Moderation Center
- [~] Mute/ban/kick and unmute/unban actions
- [ ] Unkick action
- [ ] Timed mute/ban with expiry
- [ ] Reason input for moderation actions
- [ ] Moderation export endpoint (CSV/JSON)

## 6) Search / History Controls
- [ ] Search by user/text/date API + UI
- [ ] Pin message action and pinned view
- [ ] Jump-to-mention navigation

## 7) Upload Pipeline
- [ ] Signed upload URL to Vercel Blob
- [ ] Size/type checks server-side
- [ ] VirusTotal scan workflow and message attachment status
- [ ] Preview UI for images/files

## 8) Anti-spam and Limits
- [ ] Per-user rate limits (read/write)
- [ ] Duplicate message suppression window
- [ ] Spam heuristics and moderation flags

## 9) Push Notifications
- [ ] Browser Notification permission flow
- [ ] Inactive-tab message notification
- [ ] Mention-only mode

## 10) Analytics and Health
- [ ] PostHog events for rooms/messages/mod actions
- [ ] Sentry frontend/backend integration
- [ ] Health dashboard endpoint with key metrics

## 11) Data Retention
- [ ] Per-room retention policy settings
- [ ] Purge job on read/write paths
- [ ] Admin controls for retention changes

## 12) Realtime Upgrade (Ably)
- [ ] Replace polling message refresh with channel subscriptions
- [ ] Presence and typing via Ably presence/events
- [ ] Reconnect and backfill strategy
