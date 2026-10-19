# Self-hosted Jitsi with JWT auth for video consultations

## Why

By default this app points at the public `meet.jit.si` with no authentication
on the room itself (`JITSI_DOMAIN=meet.jit.si` in `.env.local`). That means
anyone who obtains a room name (visible in API responses, the iframe URL, or
browser history) can join the call directly, bypassing YurCore's own login.

The app's backend (`src/backend/service/appointments.service.ts`,
`signJitsiJwt`) already supports signing a Jitsi-compatible JWT per session
when the right environment variables are present. This doc covers the other
half: standing up a Jitsi instance that actually *requires* that token.

If `JITSI_JWT_APP_ID` / `JITSI_JWT_APP_SECRET` are **not** set, the app keeps
working exactly as it does today (public meet.jit.si, no token). Nothing
breaks if you don't do this — but production traffic should not ship without
it.

## Already done: local dev instance

A local self-hosted stack is already running on this machine for development,
set up at `/Users/trivine/Desktop/MeyVeda-jitsi` (a sibling checkout of
`jitsi/docker-jitsi-meet`, outside the app repo — not committed anywhere).

- **Containers**: `web`, `prosody`, `jicofo`, `jvb`, managed by
  `docker compose` in that directory. Restart policy is `unless-stopped`, so
  they come back up whenever Docker Desktop is running — no need to
  re-`docker compose up` by hand after a reboot as long as Docker Desktop
  itself is running (or set to launch at login).
- **URL**: `https://localhost:8443`. Certificate is a locally-trusted one
  issued by `mkcert` (installed via `brew install mkcert`, then
  `mkcert -install` added its CA to this Mac's system trust store — that's
  why it's trusted with no browser warning in Safari/Chrome/Opera on this
  machine, but it will NOT be trusted on any other device). The cert files
  live in `MeyVeda-jitsi/local-certs/` and are copied into
  `~/.jitsi-meet-cfg/storage/web/keys/{cert.crt,cert.key}` — re-copy them
  there and `docker compose restart web` if that config volume is ever
  wiped.
- **JWT secret**: generated with `openssl rand -hex 32`, stored in
  `MeyVeda-jitsi/.jwt_secret_generated` and mirrored into both
  `MeyVeda-jitsi/.env` (`JWT_APP_SECRET`) and this app's `.env.local`
  (`JITSI_JWT_APP_SECRET`) — they must always match.
- **This app's `.env.local`** now has:
  ```
  JITSI_DOMAIN=localhost:8443
  JITSI_JWT_APP_ID=meyveda
  JITSI_JWT_APP_SECRET=<the generated secret>
  ```
  (changed from the earlier default of `meet.jit.si`).

To manage the stack:
```bash
cd /Users/trivine/Desktop/MeyVeda-jitsi
docker compose ps       # status
docker compose logs -f  # logs
docker compose down     # stop (keeps config/data)
docker compose up -d    # start again
```

**This is a dev-only setup** — it's on `localhost`, tied to this Mac's trust
store, and not reachable from any other device (including the patient's or
doctor's own phone/laptop if they're not on this machine). For real usage —
anything beyond testing on this one Mac — you need a real deployment: a
server with a public domain and a CA-issued certificate (Let's Encrypt, which
`docker-jitsi-meet` can provision automatically — see its `LETSENCRYPT_*` env
vars), following the general steps below.

## 1. Deploy Jitsi with token auth enabled

Use the official `jitsi/docker-jitsi-meet` stack. Clone it, then in its
`.env` set:

```
ENABLE_AUTH=1
ENABLE_GUESTS=0
AUTH_TYPE=jwt
JWT_APP_ID=meyveda
JWT_APP_SECRET=<generate a long random secret, e.g. `openssl rand -hex 32`>
# Optional but recommended:
JWT_ACCEPTED_ISSUERS=meyveda
JWT_ACCEPTED_AUDIENCES=jitsi
```

Then:

```bash
docker compose up -d
```

Put it behind your own TLS-terminated domain (e.g. `meet.yourdomain.com`) —
Jitsi requires HTTPS for camera/mic access in production.

## 2. Point this app at it

In this app's environment (`.env.local` in dev, your real secrets manager in
production — do **not** commit these):

```
JITSI_DOMAIN=meet.yourdomain.com
JITSI_JWT_APP_ID=meyveda
JITSI_JWT_APP_SECRET=<same secret as JWT_APP_SECRET above>
```

That's it — `AppointmentsService.getOrCreateJitsiSession` will start signing
a token per session automatically (moderator claim set for the practitioner/
admin, non-moderator for the patient), and `consult/page.tsx` already passes
`jwt={session.jwt}` into the `<JitsiMeeting>` component.

## 3. Verify

1. Restart the app so the new env vars are picked up.
2. Open a video consultation from both a doctor and a patient account.
3. Confirm both join successfully.
4. Try opening the same room name directly against your Jitsi domain from an
   unauthenticated browser tab (no YurCore cookies) — it should be rejected
   or held in the lobby, not let you straight in.

## Notes / things this does not (yet) cover

- Token expiry is set to 4 hours from issuance (`signJitsiJwt`) — long enough
  for any single consultation, short enough that a leaked token doesn't
  stay valid indefinitely. Adjust in `signJitsiJwt` if you need different.
- This does not enable Jitsi's lobby feature (host must manually admit each
  guest) — the JWT token itself is the access control here. If you want a
  lobby *in addition*, set `ENABLE_LOBBY=1` on the Jitsi side.
- Scaling a self-hosted Jitsi (multiple Jicofo/JVB instances, TURN servers
  for restrictive networks) is outside the scope of this doc — see Jitsi's
  own docs for that once you have real concurrent-call volume.
