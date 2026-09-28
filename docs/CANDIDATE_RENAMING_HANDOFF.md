# Candidate Terminology Migration & Handoff Guide

## 1. Executive Summary

- **Context**: The Employment Portal previously used the term **"Employee(s)"** to refer to individuals applying for jobs. To align terminology with domain semantics, the project underwent a terminology migration to **"Candidate(s)"**.
- **Strategy Executed**: **Tier 1 (Surface, Routing, UI, and Alias Layer)** was executed to deliver maximum user and developer clarity with **zero risk** to the database, data integrity, or system stability.
- **Current State**: 
  - All user-facing UI labels, routes, API endpoints, navigation, and re-export aliases now use **"Candidate(s)"**.
  - All database models, database tables, migrations, and internal model references were intentionally **left untouched** to guarantee 100% operational continuity without downtime or risk of data loss.

---

## 2. What Was Renamed & Added (Tier 1 - Implemented)

### A. Frontend Routing & Navigation
1. **Primary Routes** ([`frontend/src/app.jsx`](file:///D:/Projects/Employment-Portal/frontend/src/app.jsx)):
   - Primary path tree is now `/dashboard/candidates/*`:
     - `/dashboard/candidates/list`
     - `/dashboard/candidates/register`
     - `/dashboard/candidates/selected`
     - `/dashboard/candidates/under-process`
     - `/dashboard/candidates/employed`
     - `/dashboard/candidates/returned`
2. **Backward-Compatible Redirects**:
   - Seamless `<Navigate>` redirects are maintained for all `/dashboard/employees/*` paths so bookmarks, historical links, and existing workflows continue functioning without broken links.
3. **Sidebar Navigation** ([`frontend/src/components/layout/DashboardLayoutSidebar.jsx`](file:///D:/Projects/Employment-Portal/frontend/src/components/layout/DashboardLayoutSidebar.jsx)):
   - Sidebar displays **"Candidates"** with sub-menu links directly pointing to `/dashboard/candidates/...`.
   - Route matchers (`isEmployeesRoute`, `employeesView`, auto-expand) recognize both `/dashboard/candidates` and legacy `/dashboard/employees`.

### B. Frontend Re-Export Aliases & Modules
New files were introduced to allow modern code and new feature components to import from `candidates` directly:

- **Pages** ([`frontend/src/pages/candidates/`](file:///D:/Projects/Employment-Portal/frontend/src/pages/candidates/)):
  - `CandidatesLayout.jsx` &rarr; Re-exports `../employees/EmployeesLayout`
  - `CandidatesListPage.jsx` &rarr; Re-exports `../employees/EmployeesListPage`
  - `CandidateRegisterPage.jsx` &rarr; Re-exports `../employees/EmployeeRegisterPage`
  - `SelectedCandidatesPage.jsx` &rarr; Re-exports `../employees/SelectedEmployeesPage`
  - `UnderProcessPage.jsx` &rarr; Re-exports `../employees/UnderProcessPage`
  - `EmployedPage.jsx` &rarr; Re-exports `../employees/EmployedPage`
  - `ReturnedPage.jsx` &rarr; Re-exports `../employees/ReturnedPage`

- **Components** ([`frontend/src/components/candidates/`](file:///D:/Projects/Employment-Portal/frontend/src/components/candidates/)):
  - `CandidateCard.jsx` &rarr; Re-exports `../employees/EmployeeCard`
  - `CandidatesListingView.jsx` &rarr; Re-exports `../employees/EmployeesListingView`
  - `CandidateBatchRegistrationModal.jsx` &rarr; Re-exports `../employees/EmployeeBatchRegistrationModal`
  - `CandidateReturnModal.jsx` &rarr; Re-exports `../employees/EmployeeReturnModal`
  - `CandidateDocumentPreview.jsx` &rarr; Re-exports `../employees/EmployeeDocumentPreview`
  - `CandidateCameraModal.jsx` &rarr; Re-exports `../employees/EmployeeCameraModal`
  - `CandidateScanImportModal.jsx` &rarr; Re-exports `../employees/EmployeeScanImportModal`
  - `CandidateFilters.jsx` &rarr; Re-exports `../employees/EmployeeFilters`
  - `index.js` &rarr; Unified entrypoint re-exporting all above components.

- **Services, Utilities & Constants**:
  - [`frontend/src/services/candidatesService.js`](file:///D:/Projects/Employment-Portal/frontend/src/services/candidatesService.js) &rarr; Re-exports `employeesService`
  - [`frontend/src/utils/candidateHelpers.js`](file:///D:/Projects/Employment-Portal/frontend/src/utils/candidateHelpers.js) &rarr; Re-exports `employeeHelpers`
  - [`frontend/src/constants/candidateOptions.js`](file:///D:/Projects/Employment-Portal/frontend/src/constants/candidateOptions.js) &rarr; Re-exports `employeeOptions`

### C. UI & User-Facing Text
All end-user copy was updated across the portal:
- Subtabs, page titles, empty states, search placeholders, modal headers, button text, and tooltips across `CommissionsPage`, `TravelPage`, `ReportsPage`, `ChatsPage`, `CompliancesPage`, `NotificationsPage`, `EmployeesListingView`, `EmployeeRegisterPage`, etc.
- Action messages changed to "Candidate created successfully", "Update Candidate", "Register Candidates", etc.

### D. Local Storage & Draft Fallbacks
- Added `CANDIDATE_REGISTRATION_DRAFT_KEY` and `CANDIDATE_REGISTRATION_TEMPLATE_STORAGE_KEY` in [`frontend/src/utils/employeeHelpers.js`](file:///D:/Projects/Employment-Portal/frontend/src/utils/employeeHelpers.js).
- Loaders read candidate keys first; if absent, they fall back to legacy employee keys. Drafts are safely preserved across browser sessions.

### E. Backend API Aliases & Messages
1. **URL Aliases** ([`backend/portal/app/urls.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/urls.py)):
   - Dual endpoints registered for `/api/candidates/...` alongside `/api/employees/...`:
     - Form options: `/api/candidates/form-options/`
     - OCR extraction & status: `/api/candidates/ocr/`, `/api/candidates/ocr/status/`
     - Listing & Creation: `/api/candidates/`
     - Detail & Actions: `/api/candidates/<int:pk>/`
     - Selection & Lifecycle: `/api/candidates/<int:pk>/selection/`, `/api/candidates/<int:pk>/process/`, `/api/candidates/<int:pk>/process/decline/`
     - Returns: `/api/candidates/<int:pk>/return-request/`, `/api/candidates/<int:pk>/return-request/approve/`, etc.
     - Travel: `/api/candidates/<int:pk>/travel-booking/`
     - Documents: `/api/candidates/<int:employee_pk>/documents/`, `/api/candidates/candidate-documents/<int:pk>/`
2. **API Messages**:
   - Status responses updated to `"Candidate created successfully."` and `"Candidate not found."` in:
     - [`crud_views.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/employee_views/crud_views.py)
     - [`document_views.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/employee_views/document_views.py)
     - [`return_views.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/employee_views/return_views.py)
     - [`travel_views.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/employee_views/travel_views.py)
     - [`workflow_views.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/employee_views/workflow_views.py)

---

## 3. What Was Left Untouched (By Design)

To preserve 100% database stability, zero-downtime deployment, and backward compatibility, the following were intentionally preserved in their original form:

### A. Database Layer
1. **Database Table Names**:
   - `app_employee`
   - `app_employeedocument`
   - `app_employeeselection`
   - `app_employeeselectioninterest`
   - `app_employeereturnrequest`
   - `app_employeetravelbooking`
   *(No database migrations were created or run, preventing any risks of database locks, table renames, or data corruption).*
2. **Database Columns & Foreign Keys**:
   - Foreign key field names like `employee_id`, `employee` relationships remain as defined in Django models.

### B. Backend Python Models & Serializers
1. **Model Classes**:
   - `Employee`, `EmployeeDocument`, `EmployeeSelection`, etc. in [`backend/portal/app/models.py`](file:///D:/Projects/Employment-Portal/backend/portal/app/models.py).
2. **Serializer Classes**:
   - `EmployeeSerializer`, `EmployeeListSerializer`, `EmployeeDocumentSerializer`, etc.
3. **Internal Module & File Paths**:
   - `backend/portal/app/employee_views/` folder and individual view class names (`EmployeeListCreateView`, `EmployeeRetrieveUpdateDestroyView`, etc.).
4. **Audit Action Strings**:
   - Audit logs retain consistent audit keys (`employee.create`, `employee.update`, `employee.select`, etc.) to prevent corrupting historical audit records.

### C. Frontend Core File Names
1. Core implementation files remain in:
   - `frontend/src/components/employees/` (`EmployeesListingView.jsx`, `EmployeeRegisterPage.jsx`, etc.)
   - `frontend/src/pages/employees/`
   - `frontend/src/utils/employeeHelpers.js`
   - `frontend/src/constants/employeeOptions.js`
   - `frontend/src/styles/employees/`
   *(All candidate files simply re-export or alias these implementations).*

---

## 4. Developer Conventions for Future Work

When developing new features or maintaining existing code:

1. **New UI Components & Pages**:
   - Import from candidate aliases:
     ```javascript
     import { CandidateCard } from '@/components/candidates'
     import * as candidatesService from '@/services/candidatesService'
     import { CANDIDATE_VIEW_TABS } from '@/utils/candidateHelpers'
     ```
2. **Routing**:
   - Always link to `/dashboard/candidates/...` for user navigation.
   - If writing route checks, accommodate both paths:
     ```javascript
     const isCandidateRoute = location.pathname.startsWith('/dashboard/candidates') || 
                              location.pathname.startsWith('/dashboard/employees')
     ```
3. **Backend API Calls**:
   - Frontend services can call `/api/candidates/...` or `/api/employees/...`; both route to the same view logic.
4. **Database Models (If full renaming is considered in the future)**:
   - Full model/table renaming (Tier 2/3) should ONLY be performed during a planned maintenance window with a complete database backup and an explicit migration plan (`db_table` meta options should be kept or mapped with multi-phase Django migrations).

---

## 5. Verification & Test Suite

The entire system has been verified with zero regressions:
- **Frontend Unit & Component Tests**: 8 test suites, 60 tests passed (`npm test -- --run`).
- **Backend Django Tests**: 71 tests passed across all test classes (`EmployeeManagementTests`, `AuthFlowTests`, `NotificationReminderTests`, `UserManagementPermissionTests`, `CompanySyncTests`).
