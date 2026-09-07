# SomeBody Backend API Server

Fastify TypeScript API server connecting to Neon PostgreSQL, Socket.IO WebSockets, Cloudflare R2 object storage, and BullMQ background workers for ephemeral message purging.

## Quickstart
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Type-check TypeScript:
   ```bash
   npm run type-check
   ```
4. Run development server:
   ```bash
   npm run dev
   ```

## Key API Endpoints
- `GET /health` — Health check status
- `POST /api/v1/auth/signup` — User registration & token generation
- `POST /api/v1/auth/signin` — User login & token generation
- `POST /api/v1/auth/refresh` — Token rotation
- `GET /api/v1/auth/me` — Fetch current user profile
- `POST /api/v1/storage/upload-url` — Pre-signed Cloudflare R2 upload URL
