# Tamasha Hub MVP — Progress Tracker

Last updated: 2026-08-27

## Completed

### Foundation, auth, and events

- [x] Separate Next.js frontend and Express backend projects
- [x] MongoDB connection, User model, fan/artist roles, and JWT cookie auth
- [x] Registration, login, refresh, logout, and current-user endpoints
- [x] Frontend protected routes and role-aware dashboards
- [x] Artist event CRUD with Cloudinary banner uploads
- [x] Public event discovery and event-detail pages

### Wallet, M-Pesa, and tickets

- [x] Wallet model and wallet dashboard
- [x] Daraja STK-push initiation for wallet top-ups and ticket purchases
- [x] M-Pesa callback and client polling endpoints
- [x] Ticket purchase by wallet or M-Pesa
- [x] QR image generation and Cloudinary storage
- [x] Signed QR ticket tokens
- [x] Artist-only ticket validation endpoint and validation screen
- [x] Duplicate Transaction index warning fixed
- [x] Invalid Daraja access-token recovery: refresh once and retry

### Community and profiles

- [x] Public community feed at `/community` (canonical feed implementation at `/posts`)
- [x] Photo posts with Cloudinary uploads
- [x] Likes and comments
- [x] Post caption editing, image replacement, and deletion
- [x] Server-side post ownership checks
- [x] Profile name and avatar upload
- [x] Public artist/organizer profile API and frontend page
- [x] Mobile-first improvements to feed/profile controls
- [x] Post data model supports user and event tags

### Deployment readiness

- [x] Backend health endpoint: `/api/health`
- [x] `.env.example` with safe placeholders
- [x] `render.yaml` deployment blueprint
- [x] Backend README with local and Render deployment instructions
- [x] Backend syntax validation and frontend production builds completed locally

## Pending

### Highest priority — payment safety

- [ ] Make wallet balance deduction and ticket inventory updates atomic
- [ ] Make M-Pesa callback processing fully idempotent under simultaneous callbacks
- [ ] Prevent simultaneous purchases from overselling an event
- [ ] Add transaction-ledger entries for ticket purchases, refunds, and savings contributions

### Day 6 refinements

- [ ] Add user/event tag selectors and visible tags in the post form/feed
- [ ] Add camera QR scanning (current validation screen accepts scanner text)
- [ ] Add public non-artist profile pages if required
- [ ] Add post moderation, pagination, and reporting before public scale-up

### Deployment and Day 7

- [ ] Push the latest backend and frontend changes to GitHub
- [ ] Deploy backend to Render
- [ ] Set Render environment variables and MongoDB Atlas network access
- [ ] Replace `DARAJA_CALLBACK_URL` with the Render `/api/mpesa/callback` URL
- [ ] Deploy frontend to Vercel and set `NEXT_PUBLIC_API_URL`
- [ ] Verify production cookie/CORS behavior using the final Vercel URL as `CLIENT_URL`
- [ ] Test the live Daraja sandbox callback flow

### Testing

- [ ] Replace placeholder backend test script with automated tests
- [ ] Test RBAC and event ownership restrictions
- [ ] Test duplicate M-Pesa callbacks and failed payments
- [ ] Test sold-out/concurrent ticket purchases
- [ ] Test QR reuse, invalid QR tokens, and cross-artist validation attempts
- [ ] Run the end-to-end demo flow: register → create event → top up → buy → validate → post

## Current blockers

1. The backend is not yet deployed publicly, so Daraja cannot reach the callback endpoint.
2. Production M-Pesa testing must wait until the Render URL is set as `DARAJA_CALLBACK_URL`.
3. Payment/inventory concurrency hardening should be complete before accepting real payments.

## Next recommended task

Deploy the backend to Render, verify `/api/health`, then harden M-Pesa callback and ticket-inventory operations before enabling real payment testing.
