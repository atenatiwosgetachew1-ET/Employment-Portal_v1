# Project Handoff & Technical Analysis: Employment Portal

This document provides a comprehensive technical overview, repository architecture breakdown, security audit, deployment instructions (Render + Vercel + Neon DB), and local development setup instructions for the **Employment Portal** application.

---

## 1. Project Overview & System Architecture

The **Employment Portal** is a production-oriented SaaS application designed for candidate recruitment, workforce tracking, agency commissions, document OCR processing, and travel/flight logistics management.

### Key Architecture Components

```mermaid
graph TD
    subgraph Frontend ["Frontend (Vercel / Local)"]
        UI["React 19 + React Router 7"]
        AuthCtx["AuthContext (Session + CSRF)"]
        Scanner["Asprise ScannerJS Client"]
        JSPSDF["jsPDF CV Generator"]
    end

    subgraph Backend ["Backend (Render / Local)"]
        API["Django REST Framework API"]
        LicenseEngine["Licensing & Quota Engine"]
        CompanyBootstrap["Company Sync & Ed25519 Validator"]
        DB[(PostgreSQL / Neon DB)]
    end

    subgraph External ["External Services"]
        OCR["PaddleOCR HTTP Service (:8766)"]
        TravelAPI["Travel Provider Microservice"]
        CompanyControl["Central Company Control Center"]
    end

    UI <-->|Session Cookie + CSRF| API
    Scanner -->|Hardware TWAIN| UI
    JSPSDF -->|Render PDF| UI

    API <--> DB
    API <-->|Ed25519 Signed HTTP| CompanyControl
    API <-->|REST HTTP| OCR
    API <-->|REST HTTP| TravelAPI
```

---

## 2. Directory Structure

```text
Employment-Portal/
├── backend/                  # Django REST Framework backend
│   └── portal/               # Django project root
│       ├── app/              # Core Django app (models, views, services, serializers)
│       │   ├── models.py     # Database models & relationships
│       │   ├── serializers.py# DRF Serializers
│       │   ├── employee_views.py # Candidate lifecycle & document endpoints
│       │   ├── licensing.py  # Quota & read-only access enforcement
│       │   ├── company_bootstrap.py & sync_security.py # Ed25519 Control Center Sync
│       │   ├── employee_ocr.py # PaddleOCR HTTP client
│       │   ├── travel_service.py # Travel provider proxy & fallbacks
│       │   └── tests.py      # Automated Django test suite (~111KB)
│       ├── portal/           # Project settings & WSGI/ASGI configuration
│       ├── manage.py
│       ├── dev.sqlite3       # Local SQLite database (optional for dev)
│       └── requirements.txt
├── frontend/                 # Vite + React 19 Single Page Application
│   ├── src/
│   │   ├── api/              # Fetch API wrapper with CSRF injection
│   │   ├── components/       # Layout, Auth Modals, Toast UI components
│   │   ├── constants/        # System options & fixed choices
│   │   ├── context/          # AuthContext & UiFeedbackContext
│   │   ├── pages/            # 19 Views (Employees, Profiles, Commissions, Travel, etc.)
│   │   ├── routes/           # ProtectedRoute guard wrapper
│   │   ├── services/         # API wrappers & Scanner JS hardware service
│   │   ├── styles/           # Numbered modular CSS design system (00 to 10)
│   │   └── utils/            # Theme, density, profile store, and filter helpers
│   ├── package.json
│   └── vite.config.js
├── docs/                     # Architectural, Business, & Privilege Mermaid diagrams
├── scripts/                  # PowerShell setup and bootstrap scripts
├── HANDOFF.md                # Project Handoff Documentation
└── README.md
```

---

## 3. Tech Stack & Integration Summary

| Category | Component / Library | Usage |
| :--- | :--- | :--- |
| **Backend** | Django 6.0.3 + Django REST Framework 3.17 | REST API backend |
| **Database** | PostgreSQL (Neon DB for Prod / Local Postgres or SQLite for Dev) | Persistent relational store |
| **Authentication** | Django Session Cookies + CSRF | Google Identity Services OAuth fallback |
| **Security / Sync** | Cryptography (Ed25519) | Asymmetric signature verification for server-to-server sync |
| **Frontend** | React 19.2.4 + React Router 7.13.1 + Vite 8 | Single Page Application |
| **Styling** | Vanilla CSS (00 to 10 modular stylesheets) | Dynamic theme support (light/dark/system) & density modes |
| **OCR & Hardware**| Asprise ScannerJS + PaddleOCR sidecar | Physical scanner interaction & automated OCR data extraction |
| **Document Export**| `jspdf` + `jspdf-autotable` | Client-side CV export |

---

## 4. Environment Setup: Switching Between Production and Local Development

### Why local development connects to online database:
When deploying to Render/Vercel, `DATABASE_URL` is often copied directly into `backend/portal/.env`. When `DATABASE_URL` is set to the online Neon PostgreSQL URI, Django automatically connects to Neon across the internet, even when running on `localhost`.

### A. Local Development Setup (Offline / Local DB)

1. **Backend Environment (`backend/portal/.env`)**:
   Set `DEBUG=true` and use local database configuration (local PostgreSQL or SQLite):
   ```env
   DEBUG=true
   SECRET_KEY=dev-secret-key
   ALLOWED_HOSTS=localhost,127.0.0.1
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

   # Local PostgreSQL Settings (or leave empty if using SQLite fallback)
   DB_NAME=employment_portal_db
   DB_USER=postgres
   DB_PASSWORD=admin
   DB_HOST=127.0.0.1
   DB_PORT=5432

   # IMPORTANT: Comment out DATABASE_URL when developing locally so it doesn't hit Neon!
   # DATABASE_URL=postgresql://...

   EMPLOYEE_OCR_SERVICE_URL=http://127.0.0.1:8766
   TRAVEL_SERVICE_URL=http://127.0.0.1:8001
   ```

2. **Frontend Environment (`frontend/.env`)**:
   ```env
   # Leave VITE_API_BASE_URL empty for local development so Vite proxies /api to http://127.0.0.1:8000
   VITE_API_BASE_URL=
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   ```

3. **Running Backend Locally**:
   ```bash
   cd backend/portal
   python -m venv venv
   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python manage.py migrate
   python manage.py runserver 8000
   ```

4. **Running Frontend Locally**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

### B. Production Deployment Setup (Render + Vercel + Neon)

1. **Database (Neon PostgreSQL)**:
   - Create database project on [Neon.tech](https://neon.tech).
   - Copy connection string (e.g. `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`).

2. **Backend (Render Web Service)**:
   - Root directory: `backend/portal`
   - Build Command: `pip install -r requirements.txt && python manage.py migrate`
   - Start Command: `gunicorn portal.wsgi:application --bind 0.0.0.0:$PORT`
   - **Environment Variables on Render**:
     - `DEBUG=false`
     - `SECRET_KEY=<strong-production-secret-key>`
     - `ALLOWED_HOSTS=<your-render-app-name>.onrender.com`
     - `CORS_ALLOWED_ORIGINS=https://<your-vercel-app-name>.vercel.app`
     - `CSRF_TRUSTED_ORIGINS=https://<your-vercel-app-name>.vercel.app`
     - `DATABASE_URL=postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require`

3. **Frontend (Vercel)**:
   - Root directory: `frontend`
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - **Environment Variables on Vercel**:
     - `VITE_API_BASE_URL=https://<your-render-app-name>.onrender.com`

---

## 5. Security & Technical Debt Audit

> [!CAUTION]
> **Action Completed**: Removed `creadentials.txt` from repository root to protect production Neon DB credentials.

### Technical Debt Items & Refactoring Plan

1. **Monolithic UI Views**:
   - `frontend/src/pages/EmployeesPage.jsx` (~8,000 lines, 366 KB) should be modularized into sub-components (`EmployeeListTable.jsx`, `EmployeeOcrModal.jsx`, `EmployeeTravelModal.jsx`).
   - `frontend/src/pages/CommissionsPage.jsx` (~137 KB) should be split into smaller tab panels.

2. **Placeholder Pages**:
   - `ChatsPage.jsx`, `CompliancesPage.jsx`, and `SubscriptionPlansPage.jsx` render static concept outline components. Backend APIs and interactive views should be built out as per product requirements.

3. **Sidecar Dependencies**:
   - OCR document parsing calls `EMPLOYEE_OCR_SERVICE_URL`. For production, ensure PaddleOCR service is hosted as an independent microservice container.

---

## 6. Verification & Test Suite

Run full backend test suite to verify app health:
```bash
cd backend/portal
python manage.py test app
```

---
*Report generated on 2026-08-11.*
