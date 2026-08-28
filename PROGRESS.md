# Tamasha Hub MVP — Progress Tracker

Last updated: 2026-08-28

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
- [x] Mobile camera QR scanning with manual-token fallback
- [x] Event poster displayed together with the ticket QR
- [x] Duplicate Transaction index warning fixed
- [x] Invalid Daraja access-token recovery: refresh once and retry
- [x] Wallet purchase balance deduction and ticket inventory reservation use MongoDB transactions
- [x] M-Pesa ticket purchase creates a pending ledger entry before STK push
- [x] M-Pesa callback records receipt/date/phone and finalizes ticket inventory atomically
- [x] Duplicate callbacks do not re-credit wallet or re-sell inventory
- [x] Callback arriving before STK identifiers are persisted returns non-2xx so Daraja can retry safely
- [x] Savings contributions create ledger entries atomically with wallet deduction
- [x] Wallet ticket refunds restore wallet balance/inventory and create ledger entries atomically

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

- [ ] Add automated tests for wallet/inventory concurrency and callback idempotency
- [ ] Verify duplicate M-Pesa callbacks and failed payments against the live sandbox callback
- [ ] Verify sold-out/concurrent ticket purchases with automated/integration tests
- [ ] Verify every ledger flow in the deployed environment: top-up, purchase, savings, refund, receipt

### Day 6 refinements

- [ ] Add user/event tag selectors and visible tags in the post form/feed
- [ ] Add public non-artist profile pages if required
- [ ] Add post moderation, pagination, and reporting before public scale-up

### Testing

- [ ] Replace placeholder backend test script with automated tests
- [ ] Test RBAC and event ownership restrictions
- [ ] Test QR reuse, invalid QR tokens, and cross-artist validation attempts
- [ ] Run the complete end-to-end demo flow: register → create event → top up → buy → validate → post

## Current blockers

- No known blocker for sandbox M-Pesa STK initiation; the correct Daraja M-Pesa Express application is now configured.
- Phase A should not be considered production-ready until automated concurrency/idempotency tests and the remaining callback/ledger cases pass.

## Next recommended task

Add focused automated tests for the transaction ledger, wallet balance atomicity, ticket inventory concurrency, M-Pesa callback idempotency, and QR reuse. Then run the deployed sandbox end-to-end flow and merge Phase A only after those checks pass.
