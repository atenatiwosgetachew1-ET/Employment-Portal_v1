`frontend/src/App.css` is now only a manifest.

Family rules:

- `00-foundation.css`: app-wide density tokens and base elements
- `01-shell.css`: dashboard shell and page chrome
- `02-analytics.css`: concept, reports, and analytics surfaces
- `03-profiles.css`: profile and agreement domain styles
- `04-commissions.css`: commission workflow domain styles
- `05-admin-settings.css`: users, settings, notifications, and activity styles
- `06-employees.css`: employee registration, cards, review, preview, and progress styles
- `10-travel.css`: travel ticketing, booking, queue, and departure workflow styles
- `07-primitives.css`: shared element families such as cards, buttons, form controls, tables, overlays, and utilities
- `08-themes.css`: theme and accent-specific visual tuning
- `09-density.css`: compact-density remapping only

Editing rules:

- Put new component structure in its owning family file, not in `App.css`.
- Put page-specific domain styles in that page's dedicated domain file whenever one exists; do not place new travel rules back into `03-profiles.css`.
- Put shared element behavior in `07-primitives.css`.
- Put theme or accent changes in `08-themes.css`.
- Put density-only sizing and spacing changes in `09-density.css`.
- If a rule is compensating for an earlier selector, move the source rule instead of adding another late override when possible.
