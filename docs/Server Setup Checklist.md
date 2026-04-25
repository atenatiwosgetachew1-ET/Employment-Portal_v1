# Server Setup Checklist

This checklist is the source of truth for preparing a machine to run Employment Portal from scratch.

## 1. Machine prerequisites

Install these first:

- Python 3.13 for the Django backend
- PostgreSQL
- Node.js and npm

Optional but common:

- Git
- A process manager or Windows service wrapper
- A reverse proxy if serving over a public domain

## 2. Repo-level folders

Important project locations:

- Backend app: `backend/portal/`
- Frontend app: `frontend/`
- Setup scripts: `scripts/`

## 3. Backend setup

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_backend.ps1
```

This will:

- create `backend/portal/.venv`
- install `backend/portal/requirements.txt`

Then make sure:

- `backend/portal/.env` exists
- PostgreSQL credentials are correct

## 4. Database setup

Required:

- PostgreSQL database created
- matching `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` in `backend/portal/.env`

Then run:

```powershell
cd backend\portal
.\.venv\Scripts\python.exe manage.py migrate
```

Optional admin bootstrap:

```powershell
.\.venv\Scripts\python.exe manage.py createsuperuser
```

## 5. Frontend setup

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_frontend.ps1
```

This will:

- install frontend npm dependencies

Make sure:

- `frontend/.env` exists if needed
- `VITE_API_BASE_URL` is correct for the environment

## 6. Local development start

Start Django:

```powershell
cd backend\portal
.\.venv\Scripts\python.exe manage.py runserver
```

In another terminal, start the frontend:

```powershell
cd frontend
npm run dev
```

## 7. Health checks

Backend:

```powershell
cd backend\portal
.\.venv\Scripts\python.exe manage.py check
```

OCR service:

Open in browser or fetch:

Use the configured `EMPLOYEE_OCR_SERVICE_URL`, for example:

```text
http://127.0.0.1:8766/health
```

Frontend build:

```powershell
cd frontend
npm run build -- --emptyOutDir false
```

## 8. Required env/config reminders

Backend:

- database settings in `backend/portal/.env`
- optional `COMPANY_CONTROL_CENTER_BASE_URL`
- optional `EMPLOYEE_OCR_SERVICE_URL`
- optional `EMPLOYEE_OCR_SERVICE_TIMEOUT_SECONDS`

Frontend:

- optional `VITE_API_BASE_URL`

## 9. Deployment notes

For customer/server deployments, keep this order:

1. install machine prerequisites
2. clone/copy project
3. run backend setup
4. configure backend env
5. create database and run migrations
6. run frontend setup/build
7. start backend
8. verify backend and OCR service health endpoints

## 10. Troubleshooting

If OCR status says service is not reachable:

- confirm the external OCR service is running
- confirm the configured `EMPLOYEE_OCR_SERVICE_URL` responds on `/health`

If frontend OCR still fails:

- confirm backend is running
- confirm the backend can reach the OCR service URL from `backend/portal/.env`
- retry from the OCR setup modal
