# Notification System Style Paradigm & Design Specification

> **Theme Baseline:** `html[data-theme='dark'][data-accent='natural']`  
> **Density Modes:** Default (`normal`) & Compact (`compact`)  
> **Primary Source Files:** [`05-admin-settings.css`](file:///D:/Projects/Employment-Portal/frontend/src/styles/05-admin-settings.css), [`NotificationsPage.jsx`](file:///D:/Projects/Employment-Portal/frontend/src/pages/NotificationsPage.jsx)

---

## 1. Architectural Philosophy

The notification system follows a modern, restraint-first design paradigm inspired by Linear and Vercel. In dark mode, visual clarity is achieved through **luminance layering** and **contrast pacing** rather than harsh borders or saturated colors.

Key design principles:
1. **Subtle Elevation without Accent Noise:** Unread cards distinguish themselves via a brighter surface background (`color-mix`) rather than high-contrast or neon borders.
2. **Paced Information Hierarchy:** Titles dominate; collapsed descriptions are intentionally dimmed (`0.65` opacity); metadata is treated as a subdued footer.
3. **Harmonious Vertical Rhythm:** Cards maintain a generous **20px vertical padding** for breathing room across both default and compact density configurations.
4. **Tactile Micro-Controls:** Micro-action buttons and expand/collapse toggles are unified with subtle borders, background fills, and solid filled glyphs (`fill="currentColor"`).

---

## 2. Card Anatomy & Grid Layout

Each notification card (`.notifications-page-item`) is structured with a 3-column CSS Grid:

```
+-----------------------------------------------------------------------------------------+
| [•]  [ ICON TILE ]  Title Row ......................... Category [Time Ago]  [ACTIONS]  |
|      (36x36)        Body Description (dimmed to 0.65 when collapsed)          [Read]    |
|                     -------------------------------------------------------   [Remind]  |
|                     Received: <timestamp>   Status: <Unread/Read>             [ ▼ / ▲ ] |
+-----------------------------------------------------------------------------------------+
```

### Grid Metrics
* **Grid Template:** `grid-template-columns: 36px minmax(0, 1fr) auto;`
* **Column Gap:** `14px`
* **Card Padding:** `padding: 20px 18px 20px 22px;` (both default & compact modes)
* **Card Gap (in list):** `8px`
* **List Height:** `min-height: auto;` (naturally hugs items)

---

## 3. Read vs. Unread State Paradigm

| Attribute | Unread (`.is-unread`) | Read (`.is-read`) |
| :--- | :--- | :--- |
| **Surface Background** | `color-mix(in oklch, var(--color-card) 60%, var(--color-muted))` | `var(--color-card)` |
| **Resting Opacity** | `1.0` (Full contrast) | `0.58` (Soft muted appearance) |
| **Resting Border** | Standard boundary: `color-mix(in oklch, var(--color-border) 75%, transparent)` | `transparent` (No border) |
| **Hover Effect** | Background: `54%` mix; border: `color-mix(in oklch, #3c3c3c 85%, transparent)` | Opacity transitions smoothly to `1.0`; border appears |
| **Top-Left Indicator** | Glowing dynamic accent dot: `rgb(var(--accent-active))` | None |
| **Title Weight** | `font-weight: 600;` | `font-weight: 500;` |

---

## 4. Unread Indicator Dot

* **Placement:** Anchored to the **top-left corner** (`left: 8px; top: 12px;`).
* **Geometry:** `width: 7px; height: 7px; border-radius: 999px;`
* **Glow & Color:**
  ```css
  background: rgb(var(--accent-active));
  box-shadow: 0 0 6px rgb(var(--accent-active) / 0.7);
  ```
* **Compact Mode Adjustment:** `top: 10px; left: 7px;`

---

## 5. Domain Category Icon Tiles (36px)

Each notification type has a purpose-crafted 36px icon tile with a distinct semantic tint against dark backgrounds:

| Domain | Semantic Color Variable | Background Mix (14% Tint) | Icon Glyph |
| :--- | :--- | :--- | :--- |
| **Travel** | `var(--tag-orange-bg)` | `color-mix(in oklch, var(--tag-orange-bg) 14%, var(--color-card))` | Airplane ✈️ |
| **Finance** | `var(--tag-purple-bg)` | `color-mix(in oklch, var(--tag-purple-bg) 14%, var(--color-card))` | Payment Card 💳 |
| **Employee** | `var(--tag-green-bg)` | `color-mix(in oklch, var(--tag-green-bg) 14%, var(--color-card))` | User Profile 👤 |
| **Security** | `var(--tag-red-bg)` | `color-mix(in oklch, var(--tag-red-bg) 14%, var(--color-card))` | Shield Alert ⚠️ |
| **System** | `var(--color-muted)` | `color-mix(in oklch, var(--color-muted) 80%, var(--color-card))` | Bell 🔔 |

---

## 6. Body Text & Footer Hierarchy

### 6.1 Collapsed State (`:not(.is-expanded)`)
* **Line Clamping:** `-webkit-line-clamp: 2;` with `text-overflow: ellipsis;`
* **Visibility Damping:** `opacity: 0.65; font-size: 0.84rem; line-height: 1.45;`
* **Hover Preview:** Opacity lifts slightly to `0.85` on card hover.

### 6.2 Expanded State (`.is-expanded`)
* **Unrestricted Display:** `-webkit-line-clamp: unset !important; overflow: visible !important;`
* **Full Contrast:** `opacity: 1 !important; color: var(--color-foreground) !important;`

### 6.3 Secondary Metadata Footer (`.notification-item-expanded-meta`)
* **Divider:** `border-top: 1px dashed color-mix(in oklch, var(--color-border) 45%, transparent);`
* **Subdued Footprint:** `font-size: 0.72rem; opacity: 0.65; gap: 16px; margin-top: 10px; padding-top: 8px;`
* **Values:** `font-weight: 500;` in muted foreground tone.

---

## 7. Control Ergonomics & Expand Arrow

### 7.1 Micro-Action Buttons (`.notification-micro-btn`)
* **Height & Radius:** `height: 28px; border-radius: 6px; padding: 0 8px;`
* **Surface:** `border: 1px solid var(--color-border); background: color-mix(in oklch, var(--color-card) 88%, var(--color-muted));`
* **Font:** `font-size: 0.76rem; font-weight: 500;`
* **Disabled / Active State:** When a notification is in an active reminder state, the `Snoozed` button displays with `.is-active.is-disabled`, `cursor: not-allowed`, and `opacity: 0.8` (unclickable).
* **Tab Action Visibility:**
  - In general tabs (`All`, `Unread`): notifications on active reminder hide the `Read` button and display the `Snoozed` button as disabled.
  - In the `Reminders` tab: only the `Read` button is displayed, allowing instant completion and removal upon being marked as read.

### 7.2 Solid Filled Arrow (Chevron Toggle)
Instead of thin hollow strokes that degrade on small displays, the expand/collapse button uses a **solid filled triangle** (`fill="currentColor"`):

```html
<!-- Collapsed: Solid Downward Triangle -->
<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
  <path d="M5.5 7.5h9L10 13.5l-4.5-6z" />
</svg>

<!-- Expanded: Solid Upward Triangle -->
<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
  <path d="M5.5 12.5h9L10 6.5l-4.5 6z" />
</svg>
```

* **Control Box:** `28px × 28px`, centered with `inline-flex`.
* **Expanded State (`.is-expanded`):** Receives active background tint `color-mix(in oklch, var(--color-muted) 70%, var(--color-card))`.
* **Read-Card Protection:** Given `.notification-expand-chevron { opacity: 0.92; }` so controls remain unmistakably interactive on read cards.

---

## 8. Search Input Collision Prevention Rule

To guarantee that the 15px search icon at `left: 14px` never overlaps the placeholder or query text in any cascade layer or density mode:

```css
.notifications-search-input {
  height: 36px;
  padding-left: 44px !important;
  padding-right: 34px !important;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: color-mix(in oklch, var(--color-card) 95%, var(--color-muted));
}
```

* Explicit overrides are maintained in [`05-admin-settings.css`](file:///D:/Projects/Employment-Portal/frontend/src/styles/05-admin-settings.css), [`07-primitives.css`](file:///D:/Projects/Employment-Portal/frontend/src/styles/07-primitives.css), and [`09-density.css`](file:///D:/Projects/Employment-Portal/frontend/src/styles/09-density.css).

---

## 9. Compact Density Rule (`html[data-density='compact']`)

In compact density, card proportions retain their generous 20px vertical padding while scaling down inner utilities:

```css
html[data-density='compact'] .notifications-page-item {
  padding: 20px 18px 20px 22px;
  gap: 12px;
  min-height: auto;
}

html[data-density='compact'] .notification-unread-dot {
  left: 7px;
  top: 10px;
}

html[data-density='compact'] .notification-icon-tile {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

html[data-density='compact'] .notification-micro-btn {
  height: 26px;
  padding: 0 7px;
  font-size: 0.72rem;
}
```

---

## 10. Empty Slate Placeholder Specification

The empty state container (`.notifications-page-empty`) provides a generous, vertically centered presence that comfortably fills the available viewport height:

```css
.notifications-page-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 24px;
  border-radius: 12px;
  border: 1px dashed var(--color-border);
  background: color-mix(in oklch, var(--color-card) 60%, transparent);
  min-height: max(460px, calc(100vh - 300px));
  margin: 12px 0;
  box-sizing: border-box;
}

.notifications-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: color-mix(in oklch, var(--color-muted) 80%, var(--color-card));
  border: 1px solid var(--color-border);
  color: var(--color-muted-foreground);
  margin-bottom: 16px;
}
```

### 10.1 Dedicated Loadscreen Indicator (`.notifications-loading-icon-wrap`)
Whenever the page or listing is fetching or refreshing, a dedicated loadscreen indicator renders in the center of the surface:
* **Outer Spinner Ring (`.notifications-loading-spinner-ring`):** 68px circular ring with top border highlighted in `rgb(var(--accent-active))` spinning smoothly at 850ms intervals.
* **Center Glowing Icon Tile (`.notifications-loading-center-icon`):** 48px rounded tile with 14% accent tint (`color-mix(in oklch, rgb(var(--accent-active)) 14%, var(--color-card))`), containing a softly pulsing bell icon with ambient glow (`box-shadow: 0 0 16px rgb(var(--accent-active) / 0.22)`).
* **Live Refresh State:** Activates dynamically while fetching data from `notificationsService` and clears immediately as live notifications arrive.

---

## 11. Reminders Tab Lifecycle & In-Place Refresh

* **Reminders Tab Filtering & Lifecycle:** The Reminders tab strictly reflects **active, unread pending reminders** (`isReminderPending(item)`). Setting a reminder keeps or marks the notification as unread (`read: false`) so it displays with the complete unread visual paradigm (brighter surface, glowing unread dot, font-weight 600, full 1.0 opacity, hover border `color-mix(in oklch, #3c3c3c 85%, transparent)`, and the "Read" action button). Once the user marks a reminder item as read, its scheduled reminder is dismissed/cleared (`remind_at = null`, `is_reminder_pending = false`). This immediately removes it from the Reminders tab and restores the clickable `Remind` button on the item card across the `All` tab, enabling the user to set a reminder on it again if desired.
* **Unread Tab & Reminder Isolation:** A notification that is set under reminder does not appear inside the `Unread` tab (`!item.read && !isReminderPending(item)`), nor is it included in the unread count badge, while its reminder is pending. It remains secluded exclusively within the `Reminders` tab until the scheduled time is reached.
* **Real-Time Automatic Transition on Scheduled Time:** The instant the scheduled reminder time arrives, the item automatically matures in real time:
  - It moves **out** of the `Reminders` tab immediately.
  - It appears **inside** the `Unread` tab immediately as an active unread notification.
  - The unread counter pill in the title increments, and the reminders counter decrements.
  - On the `All` tab, its disabled "Snoozed" state clears and restores the active, clickable "Read" and "Remind" action buttons.
  - This transition occurs seamlessly in local state without any page reload or disruptive loading screens, while silently persisting the change to the backend (`read=False, remind_at=null`) and broadcasting the update across application listeners (`notifications:updated`).
* **Reminder Notification Popups (Toast Feedback):**
  - **On Setting Reminder:** When a reminder is scheduled, a toast notification immediately pops up via `useUiFeedback` in the fixed bottom-right toast stack (`.app-toast-stack`), displaying `title: 'Reminder scheduled'` and message `Reminder set for [Formatted Time].` with `tone: 'success'`.
  - **On Maturing Reminder:** When a reminder reaches its due time while active in the app, a contextual alert toast pops up with `title: 'Reminder Alert'` and the notification's title (`tone: 'info'`).
  - **On Dismissing/Cancelling:** When a reminder is cancelled or completed as read from the Reminders tab, appropriate feedback toasts (`Reminder cancelled` / `Reminder marked as read`) provide clear confirmation.
* **In-Place List Refresh:** The top-bar Refresh button exclusively fetches data in the background and spins its icon (`.notifications-btn-icon.is-spinning`) without triggering browser reloads or unmounting page state.

---

## 12. Reminder Modal Dialog & Presets Specification

The reminder scheduling modal (`.notification-reminder-modal-dialog`) is designed as an ergonomic, focused surface reflecting the dark-natural design aesthetic:

### 12.1 Elevation & Surface
* **Backdrop Blur:** `rgba(0, 0, 0, 0.68)` with `backdrop-filter: blur(8px);` for clear depth separation.
* **Dialog Surface:** `color-mix(in oklch, var(--color-card) 96%, var(--color-muted))` with `border-radius: 14px;` and deep ambient shadow `0 24px 54px -12px rgba(0, 0, 0, 0.75)`.
* **Dimensions:** Max-width `500px`, padding `22px 24px 20px 24px`.

### 12.2 Target Notification Context Card
* **Purpose:** Immediately reinforces which notification is being snoozed.
* **Layout:** Mini 2-column grid (`34px minmax(0, 1fr)`) mirroring the main list item.
* **Components:** Domain category icon tile (34px), category pill, relative timestamp, bold title, and 2-line clamped body snippet.
* **Background:** Subdued tint `color-mix(in oklch, var(--color-muted) 38%, var(--color-card))` with border `color-mix(in oklch, var(--color-border) 65%, transparent)`.

### 12.3 Presets Grid & Live Time Previews
* **Symmetrical 2x2 Grid:** 4 primary presets (`In 1 hour`, `In 4 hours`, `Tomorrow morning`, `In 3 days`).
* **Live Calculated Previews:** Each preset displays its calculated trigger time (e.g. `Today, 6:52 PM`, `Tomorrow, 9:00 AM`, `Sun, Sep 28, 5:52 PM`) in muted secondary text.
* **Full-Width Custom Card:** Dedicated card below the grid for picking custom date and time.
* **Selection State:** Accent border `rgb(var(--accent-active))`, active tint `color-mix(in oklch, rgb(var(--accent-active)) 12%, var(--color-card))`, and subtle outline glow `box-shadow: 0 0 0 1px rgb(var(--accent-active) / 0.35)`.

### 12.4 Custom Radio Indicators
* **Tactile Indicator:** Circular ring `16px × 16px` with inner centered dot (`width: 6px; height: 6px; border-radius: 999px;`).
* **Unselected:** Border `color-mix(in oklch, var(--color-border) 80%, transparent)`.
* **Selected:** Ring and dot transition to active accent `rgb(var(--accent-active))` with white inner core.
* **Accessibility:** Real hidden `<input type="radio" />` maintains keyboard arrow navigation and ARIA radiogroup compliance.

### 12.5 Custom Datetime Picker
* **Calendar Input:** 38px height, rounded corners (8px), clean horizontal padding (`padding: 0 12px !important;`) ensuring zero visual collision with date/time digits.
* **Label Header Icon:** The calendar icon glyph is paired alongside the label text ("Select Date & Time") rather than positioned inside the input box, preserving native text alignment across browsers.
* **Native Theme Integration:** `color-scheme: dark;` under dark mode to ensure the browser's date/time calendar picker matches dark styling.
* **Live Confirmation:** Displays `Will alert: [Formatted Time]` above the input.
* **Validation & Error Handling:** Future-date validation prevents past selections; inline badge (`.notification-reminder-error-badge`) displays contextual feedback inside the dialog.

---

*This document serves as the canonical design contract for notification cards, badges, modal dialogs, and controls throughout the portal.*
