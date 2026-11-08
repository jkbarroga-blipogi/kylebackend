# Shelter Admin — Frontend

Simple na admin panel para sa NestJS + MySQL backend. Walang build step —
puro HTML/CSS/JS.

**Default API:** `https://kylebackend.onrender.com` (deployed sa Render)
— pwedeng palitan sa loob ng login screen o click ang API pill sa topbar,
at naka-save ang choice sa localStorage.

## Paano i-run

1. Buksan ang `frontend/index.html` sa browser (double-click).
2. **Test connection** → dapat `✅ Server Running Successfully!`

⚠️ **Cold start note:** Hindi tumatakbo 24/7 ang Render free tier — kapag
mga ~15 minuto na walang tao, natutulog ito. Ang **unang** hiling ay maaaring
umabot ng 30–90 segundo bago tumugon — hayaan lang, sa susunod mabilis na muli.

3. Mag-**Login** (o **Register**). Lahat ng request pagkatapos ng login ay may
   `Authorization: Bearer <token>` — kaya gumagana ang mga JWT-guard na endpoints
   (`/species`, `/breed`, `/animal`, `/shelter/*`, `/category`, `/users`).

## Mga Tampok

- Login / Register / Logout (JWT access + refresh token)
- Auto token refresh kapag may 401
- CRUD sa LAHAT ng resources: species, breed, animal, category, users,
  at `/shelter/*` tables: adopter, staff, adoption-application, medical-record, adoption
- Search + reload per tab; Edit pre-fills ang form; Delete may confirm

## Para gumaganang maigi ang Render deployment

Nasa **Render Dashboard → Environment** dapat ang mga env vars na ito
(dahil ang `.env` ay naka-gitignore — hindi kasama sa push):

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET, JWT_REFRESH_TOKEN_SECRET
```

⚠️ Kapag wala ang mga ito sa Render, magagamit ng backend ang **hardcoded
fallback** sa `src/database/database.service.ts` — unit Aiven database ng
IBANG host/password, at hindi ito gagana.
