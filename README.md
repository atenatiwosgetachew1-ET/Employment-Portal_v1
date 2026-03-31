# Employment Portal

Production-minded foundation for an Employment Portal built with Django and React.

## Included

- Session-based authentication with CSRF protection
- Email/password registration, verification, login, logout, and password reset
- Google sign-in via Google Identity Services
- Role-based access control (`superadmin`, `admin`, `staff`, `customer`)
- User management, notifications, audit logging, and per-user preferences
- Organization-aware licensing foundation for plans, subscriptions, seat limits, and read-only/suspended access states

## Stack

- Backend: Django 6, Django REST Framework, PostgreSQL
- Frontend: React 19, React Router 7, Vite
- Auth model: Django session cookies + CSRF

## Quick Start

### Backend

1. Create `backend/portal/.env`
2. Set PostgreSQL values for `DB_NAME` and `DB_USER`
3. Install dependencies from `backend/portal/requirements.txt`
4. Run migrations
5. Start Django from `backend/portal`

### Frontend

1. Create `frontend/.env`
2. Leave `VITE_API_BASE_URL` empty for local development so Vite proxies `/api` to Django
3. Install dependencies from `frontend/package.json`
4. Start the Vite dev server from `frontend`

## Configuration Notes

- Local development defaults to `DEBUG=true`
- Production should set `DEBUG=false`, real `ALLOWED_HOSTS`, and HTTPS cookie settings
- Repeated wrong-password attempts are rate-limited by `LOGIN_MAX_FAILED_ATTEMPTS` and `LOGIN_LOCKOUT_MINUTES`
- Google login needs only the `GOOGLE_CLIENT_ID` value in env; do not commit downloaded OAuth client-secret JSON files
- PostgreSQL is required in development, tests, and production

## Separate Company Project

The company-side management scaffold lives in `company-control-center/` and is intended to be deployed separately from this customer-facing Employment Portal.

## Secure Sync Setup

The safest integration path is a signed server-to-server sync between the company control center and the customer Employment Portal.

Set this environment variable on the customer Employment Portal:

- `COMPANY_CONTROL_CENTER_BASE_URL`

Set this on the company control center:

- `CUSTOMER_PORTAL_SYNC_BASE_URL`

Sync signing keys are now managed dynamically from the company control center database. The company control center signs sync requests with its active private key, and the customer Employment Portal fetches the matching public key over HTTPS before verifying the signature.

For lightweight retries on the company side, schedule:

`python manage.py retry_sync_jobs --limit 25`

## First Superadmin Bootstrap

For first-time use, this portal can optionally validate a not-yet-local username/password against the company control center and create the local superadmin automatically.

Set:

- `COMPANY_CONTROL_CENTER_BASE_URL`

Optional overrides:

- `COMPANY_CONTROL_CENTER_BOOTSTRAP_LOGIN_URL`
- `COMPANY_CONTROL_CENTER_BOOTSTRAP_SHARED_SECRET`
- `COMPANY_CONTROL_CENTER_BOOTSTRAP_TIMEOUT_SECONDS`

Expected company response shape from `POST /api/customer-portals/bootstrap-login/`:

```json
{
  "success": true,
  "user": {
    "username": "company-admin",
    "email": "owner@example.com",
    "first_name": "Acme",
    "last_name": "Owner",
    "role": "superadmin"
  },
  "organization": {
    "external_id": "company-org-1",
    "name": "Acme Hiring",
    "slug": "acme-hiring",
    "status": "active",
    "billing_contact_email": "owner@example.com",
    "reputation_tier": "trusted",
    "read_only_mode": false
  }
}
```

If the username already exists locally, normal Django authentication is used and the company bootstrap fallback is skipped.
