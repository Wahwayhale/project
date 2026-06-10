# Security Policy

## Scope

This is a personal-use chat application. The following measures are in place to protect data and access.

## Authentication

- JWT tokens, 7-day expiry, signed with `JWT_SECRET`
- bcrypt password hashing, 10 rounds
- All private routes require `verifyToken` middleware
- Login rate-limited: 10 requests/min per IP

## Authorization

- Room access: `isRoomMember(room, username)` check on join/send/read
- Admin operations: additional `username === 'admin'` check
- Message actions: sender-only (recall/edit/delete) or room creator (delete)

## Data Protection

- Atomic file writes (tmp → rename) prevent corruption on crash
- Hourly automated backups with 24-hour retention
- Graceful shutdown flushes all pending writes before exit
- Recovery: damaged JSON auto-restores from `.bak` on startup

## Network Security

- helmet middleware: XSS, clickjacking, MIME sniffing protection
- Global rate limit: 120 requests/min per IP
- CORS: restricted to same-origin for web, cross-origin allowed for API
- ngrok TLS termination for public access

## Hardening Checklist

- [x] No hardcoded secrets (all in .env)
- [x] Input validation via `typeof` checks + multer size limits
- [x] File upload capped at 500MB
- [x] WebSocket transport restricted to WebSocket-only (no polling)
- [x] APK signed with debug keystore (production needs release signing)
- [ ] DDoS protection (Cloudflare or similar)
- [ ] HTTPS on server (currently ngrok provides TLS)
- [ ] Audit logging for sensitive operations
- [ ] Regular dependency vulnerability scanning (`npm audit`)
