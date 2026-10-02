# Project Handoff & Architecture Blueprint

> Please refer to the complete, up-to-date agent handoff documentation at:  
> **[`docs/AGENT_HANDOFF.md`](file:///D:/Projects/Employment-Portal/docs/AGENT_HANDOFF.md)**

---

## Quick Reference Summary

- **Repository**: Employment Portal (Recruitment, Candidate Deployment, Commissions, Travel & OCR Logistics)
- **Backend**: Django 6.0.3 + Django REST Framework 3.17 (Python 3.13)
- **Database**: PostgreSQL 16 (`employment_portal_db` on `127.0.0.1:5432` / Neon DB)
- **Frontend**: React 19.2.4 + Vite 8.0.1 + React Router 7.13.1
- **Auth**: Session Cookies + CSRF (No JWT)
- **Terminology Rule**: UI uses **"Candidate(s)"**; Database & Backend models preserve **"Employee"** to ensure data continuity.
- **Verification Status**:
  - `python manage.py test app`: **80/80 tests passing**
  - `npm.cmd run test`: **75/75 tests passing**
  - `npm.cmd run build`: **Build succeeds**

For full architectural diagrams, API maps, local development runbook, and business logic state machines, open [`docs/AGENT_HANDOFF.md`](file:///D:/Projects/Employment-Portal/docs/AGENT_HANDOFF.md).
