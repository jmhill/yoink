
# "Yoink" Universal Capture: Design Document

A personal "universal inbox" for quick text capture from browser and mobile, replacing Google Keep's capture functionality.

## 1. Core Entities and Data Flows

### Domain Model

```
Organization {
  id: UUID
  name: string                 // "Justin's Captures", etc.
  createdAt: DateTime
}

User {
  id: UUID
  organizationId: UUID         // users belong to an org
  email: string                // for identification
  createdAt: DateTime
}

ApiToken {
  id: UUID
  userId: UUID                 // tokens belong to a user
  tokenHash: string            // bcrypt hash of the token
  name: string                 // "macbook", "pixel", "firefox-extension"
  lastUsedAt?: DateTime        // track usage for auditing
  createdAt: DateTime
}

Capture {
  id: UUID
  organizationId: UUID         // captures scoped to org (shared inbox)
  createdById: UUID            // which user captured it
  content: string              // the captured text (required, 1-10000 chars)
  title?: string               // optional title/summary (max 200 chars)
  sourceUrl?: string           // URL where capture originated (browser extension)
  sourceApp?: string           // app identifier (Android share: "android-share")
  status: "inbox" | "archived"
  capturedAt: DateTime
  archivedAt?: DateTime
}
```

### Multi-Tenant Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      REQUEST WITH TOKEN                             │
├─────────────────────────────────────────────────────────────────────┤
│  Authorization: Bearer <plaintext-token>                            │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AUTH MIDDLEWARE                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Hash incoming token                                             │
│  2. Look up ApiToken by hash                                        │
│  3. Load User and Organization                                      │
│  4. Attach to request context:                                      │
│     req.auth = { user, organization, token }                        │
│  5. Update token.lastUsedAt                                         │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CAPTURE SERVICE                                │
├─────────────────────────────────────────────────────────────────────┤
│  All queries scoped: WHERE organizationId = req.auth.organization.id│
│  Creates include: createdById = req.auth.user.id                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flows

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CAPTURE SOURCES                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Browser Extension       PWA (Android Share)      Web Quick Add    │
│   ┌──────────────┐       ┌──────────────┐        ┌──────────────┐  │
│   │ Select text, │       │ Share from   │        │ Type in      │  │
│   │ click button │       │ any app      │        │ inbox view   │  │
│   └──────┬───────┘       └──────┬───────┘        └──────┬───────┘  │
│          │                      │                       │           │
│          └──────────────────────┼───────────────────────┘           │
│                                 │                                   │
│                                 ▼                                   │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  POST /captures   Authorization: Bearer <token>              │  │
│   │  { content, title?, sourceUrl?, sourceApp? }                │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            BACKEND                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Auth Middleware             Application Layer                     │
│   ┌─────────────────┐        ┌─────────────────┐                   │
│   │ Validate token  │───────▶│ ts-rest router  │                   │
│   │ Load user + org │        │                 │                   │
│   └─────────────────┘        └────────┬────────┘                   │
│                                       │                             │
│                                       ▼                             │
│                              ┌─────────────────┐                   │
│                              │ CaptureService  │                   │
│                              │ (scoped to org) │                   │
│                              └────────┬────────┘                   │
│                                       │                             │
│                                       ▼                             │
│                              ┌─────────────────┐                   │
│                              │  CaptureStore   │ (port)            │
│                              └────────┬────────┘                   │
│                                       │                             │
│   Infrastructure Layer                ▼                             │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │         SQLiteCaptureStore (adapter)                        │  │
│   │              captures.db                                    │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          CONSUMPTION                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Web UI / PWA                                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                                                             │  │
│   │  ┌─────────────────────────────────────────────────────┐   │  │
│   │  │  [ Quick capture... ]                    [Capture]  │   │  │
│   │  └─────────────────────────────────────────────────────┘   │  │
│   │                                                             │  │
│   │  Inbox (newest first)                                       │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  │ Captured text snippet...              [Archive] [Delete]│  │
│   │  │ Captured text snippet...              [Archive] [Delete]│  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │                                                             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### State Transitions

```
          ┌──────────────────┐
          │                  │
  create  │      inbox       │
 ────────▶│                  │
          └────────┬─────────┘
                   │
                   │ archive
                   ▼
          ┌──────────────────┐
          │                  │
          │     archived     │
          │                  │
          └──────────────────┘

Note: No "unarchive" in MVP. Can add later if needed.
Hard delete is available but discouraged (archive instead).
```

## 2. API and Architecture

### API Contract (ts-rest)

```typescript
// libs/api-contracts/src/capture-contract.ts

const CaptureSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceApp: z.string().max(100).optional(),
  status: z.enum(["inbox", "archived"]),
  capturedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

const CreateCaptureSchema = z.object({
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceApp: z.string().max(100).optional(),
});

const captureContract = c.router({
  // Create a new capture
  create: {
    method: "POST",
    path: "/captures",
    body: CreateCaptureSchema,
    responses: {
      201: CaptureSchema,
      400: ErrorSchema,
      401: ErrorSchema,
    },
  },

  // List captures (filterable by status)
  list: {
    method: "GET",
    path: "/captures",
    query: z.object({
      status: z.enum(["inbox", "archived"]).optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(), // cursor-based pagination
    }),
    responses: {
      200: z.object({
        captures: z.array(CaptureSchema),
        nextCursor: z.string().uuid().optional(),
      }),
      401: ErrorSchema,
    },
  },

  // Get single capture
  get: {
    method: "GET",
    path: "/captures/:id",
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
    },
  },

  // Update capture (archive, edit title/content)
  update: {
    method: "PATCH",
    path: "/captures/:id",
    body: z.object({
      title: z.string().max(200).optional(),
      content: z.string().min(1).max(10000).optional(),
      status: z.enum(["inbox", "archived"]).optional(),
    }),
    responses: {
      200: CaptureSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema,
    },
  },

  // Hard delete (if needed)
  delete: {
    method: "DELETE",
    path: "/captures/:id",
    responses: {
      204: z.undefined(),
      401: ErrorSchema,
      404: ErrorSchema,
    },
  },
});
```

Note: All endpoints are implicitly scoped to the authenticated user's organization.
The `organizationId` and `createdById` are set server-side from the auth context.

### Project Structure

```
universal-capture/
├── apps/
│   ├── api/                      # Express API
│   │   ├── src/
│   │   │   ├── captures/
│   │   │   │   ├── application/  # ts-rest router
│   │   │   │   ├── domain/       # CaptureService, CaptureStore interface
│   │   │   │   └── infrastructure/ # SQLite adapter
│   │   │   ├── auth/
│   │   │   │   ├── application/  # Auth middleware (token + admin session)
│   │   │   │   ├── domain/       # TokenService, stores interfaces
│   │   │   │   └── infrastructure/ # SQLite adapters for org/user/token
│   │   │   ├── admin/
│   │   │   │   └── application/  # Admin routes (login, org/user/token CRUD)
│   │   │   ├── config/
│   │   │   └── app.ts
│   │   └── tests/
│   │
│   ├── web/                      # React + Vite PWA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   │   ├── inbox/        # Main capture inbox
│   │   │   │   ├── share/        # PWA share target handler
│   │   │   │   └── admin/        # Admin panel pages
│   │   │   └── lib/              # ts-rest client
│   │   ├── public/
│   │   │   └── manifest.json     # PWA manifest with share_target
│   │   └── vite.config.ts
│   │
│   └── extension/                # Browser extension (Manifest v3)
│       ├── manifest.json
│       ├── popup/
│       ├── content/
│       └── background/
│
├── libs/
│   ├── api-contracts/            # Shared ts-rest contracts
│   └── infrastructure/           # Clock, IdGenerator, PasswordHasher
│
├── package.json
└── tsconfig.base.json
```

### Authentication

Multi-tenant token-based authentication with organization scoping.

**How it works:**

1. **Client includes token** in requests: `Authorization: Bearer <token>`
2. **Middleware validates**:
   - Hash incoming token
   - Look up ApiToken by hash
   - Load associated User and Organization
   - Attach to request context
   - Update `lastUsedAt` for auditing

**Security properties:**
- Tokens are never stored in plaintext (only bcrypt hashes)
- Each token is tied to a specific user
- Tokens can be individually revoked without affecting others
- `lastUsedAt` provides audit trail
- Organization scoping means users only see their org's captures

### Admin Panel

Separate authentication for administrative tasks (provisioning orgs, users, tokens).

**Why separate auth?**

Admin and user are different roles with different concerns:
- **Users** capture things (via API tokens from extension/PWA)
- **Admins** provision access (via web panel)

They don't need to be the same entity. Keeping them separate avoids polluting the user model with admin concerns.

**How it works:**

1. Set `ADMIN_PASSWORD` environment variable at deploy time
2. Admin panel lives at `/admin` with its own login form
3. Login checks password against env var, sets HTTP-only session cookie
4. Session middleware protects all `/admin/*` routes
5. Logout clears the cookie

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ADMIN PANEL AUTH                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   GET /admin/login                                                  │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Password: [______________]  [Login]                        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│   POST /admin/login                                                 │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  if (password === process.env.ADMIN_PASSWORD)               │  │
│   │    → Set session cookie, redirect to /admin                 │  │
│   │  else                                                       │  │
│   │    → Show error                                             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│   GET /admin/* (protected by session middleware)                    │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Organizations  │  Users  │  Tokens                         │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  [Create Org]                                               │  │
│   │  • Justin's Inbox (3 users, 5 tokens)          [Manage]     │  │
│   │  • Family Captures (2 users, 3 tokens)         [Manage]     │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Admin panel screens:**

1. **Organizations list**: View all orgs, create new org
2. **Organization detail**: View users in org, create new user
3. **User detail**: View tokens, create new token, revoke tokens

**Session implementation:**

For MVP, use a simple signed cookie with express-session or equivalent:
- Secret from `SESSION_SECRET` env var
- In-memory session store (restarts log out admin, which is fine)
- Can graduate to Redis-backed sessions if needed

### PWA Share Target Configuration

```json
// public/manifest.json
{
  "name": "Capture",
  "short_name": "Capture",
  "start_url": "/",
  "display": "standalone",
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

The PWA will need a `/share` route that:
1. Receives the shared data
2. Posts to the API
3. Shows confirmation (or the inbox)

### Browser Extension Flow

```
┌─────────────────────────────────────────┐
│           Extension Popup               │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ [Selected text auto-populated]    │  │
│  │                                   │  │
│  │ "This is the text I selected     │  │
│  │  on the page..."                 │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Source: https://example.com/article    │
│                                         │
│         [ Cancel ]  [ Capture ]         │
│                                         │
└─────────────────────────────────────────┘
```

Extension needs:
- `activeTab` permission (to get selection and URL)
- `storage` permission (to store API URL and token)
- Options page for configuration

## 3. Implementation Plan

### Phase 1: Backend Foundation
**Goal**: Working API with persistence and multi-tenant auth

- [ ] Initialize monorepo (nx)
- [ ] Set up libs/api-contracts with capture contract
- [ ] Set up libs/infrastructure (Clock, IdGenerator, PasswordHasher)
- [ ] Create apps/api scaffold
  - [ ] Auth domain:
    - [ ] Organization, User, ApiToken entities and schemas
    - [ ] OrganizationStore, UserStore, TokenStore interfaces
    - [ ] SQLite adapters for all stores
    - [ ] TokenService (validate, hash, create, revoke)
    - [ ] Token auth middleware (Bearer token → user/org context)
  - [ ] Captures domain:
    - [ ] Capture entity, CaptureService, CaptureStore interface
    - [ ] SQLite adapter with org scoping
  - [ ] Application: ts-rest router with auth middleware
- [ ] Contract tests for all stores
- [ ] Seed script for bootstrapping first org/user/token (dev only)

**Deliverable**: Can POST/GET captures via curl with a seeded token

### Phase 2: Web App (Inbox + Admin)
**Goal**: View/manage captures and provision access via browser

- [ ] Create apps/web scaffold (Vite + React)
- [ ] Set up ts-rest client

**Admin Panel:**
- [ ] Admin session auth (password from env var)
- [ ] Admin login page
- [ ] Organizations list + create
- [ ] Organization detail (users list + create)
- [ ] User detail (tokens list + create/revoke)
- [ ] Session middleware protecting /admin/* routes

**Capture Inbox:**
- [ ] Token configuration (stored in localStorage)
- [ ] Quick add input at top of inbox
- [ ] Inbox view (list captures, newest first)
- [ ] Archive action (swipe or button)
- [ ] Delete action (with confirmation)
- [ ] Basic responsive styling (mobile-first)

**Deliverable**: Can create org/user/token via admin panel, then use inbox with that token

### Phase 3: PWA + Android Share
**Goal**: Capture from Android via share intent

- [ ] Add PWA manifest with share_target
- [ ] Implement /share route handler
- [ ] Service worker for installability
- [ ] Handle offline gracefully (show error, don't crash)
- [ ] Test on actual Android device

**Deliverable**: Can install PWA on Android, share text to it

### Phase 4: Browser Extension
**Goal**: Quick capture from desktop browser

- [ ] Create apps/extension scaffold
- [ ] Manifest v3 setup
- [ ] Popup UI (selection + source URL)
- [ ] Content script to grab selection
- [ ] Options page (API URL, token config)
- [ ] Build pipeline (extension needs bundling)

**Deliverable**: Working extension in Chromium browsers (Chrome, Brave, Edge)

### Phase 5: Deployment
**Goal**: Running in production

- [ ] Dockerize API
- [ ] Deploy to Fly.io (or VPS of choice)
- [ ] Set up SQLite persistence (Fly volume or Litestream backup)
- [ ] Deploy web app (same service or separate static host)
- [ ] Configure HTTPS
- [ ] Install PWA on phone, extension in browser

**Deliverable**: Fully functional personal capture system

---

## Future Considerations (Out of Scope for MVP)

- **Search**: Full-text search over captures
- **Tags/Labels**: Categorization beyond inbox/archived
- **Export**: Bulk export to markdown, JSON, or directly to Tadori
- **Offline sync**: PowerSync or similar if offline reading matters
- **Image capture**: Screenshot or image share support
- **Browser context**: Capture surrounding paragraph, not just selection
- **Unarchive**: Allow moving archived items back to inbox

---

## Decisions Made

- **Extension browsers**: Chromium-only (Chrome, Brave, Edge, etc.)
- **Deployment target**: Fly.io
- **Mobile approach**: PWA with Web Share Target API
- **Multi-tenancy**: Organization → User → Token hierarchy from day one
- **Quick add**: Include simple text input in web inbox
- **Admin auth**: Separate from user auth—env var password with session cookie (not user flags/roles)
