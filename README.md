# NeuroWare (NW) 🧠🏥
### Official Neurosurgical Operating Storage Inventory & Operative Log System

**NeuroWare** is an iPhone-native styled progressive web application engineered specifically for neurosurgical operating rooms, on-call surgical shifts, and departmental implant storage.

---

## 🌟 Key Features

### 1. Multi-Role Authentication & Access Control
- **OWNER (Storage Director / Chief Neurosurgeon)**: Full administrative authority, approval/rejection of registration requests, assignment of device locks, promotion/demotion of admins, database audit.
- **ADMIN (OR Inventory Managers)**: Storage editor, refill operations with automated broadcast alerts, dynamic item schema configuration, sign-up approvals, operative reports.
- **REGULAR (Neurosurgeons, Residents, Scrub Nurses)**: Strictly restricted to reporting surgical consumption in their procedures (patient details, specialist care, beds, dynamic item parameters), browsing storage stock levels, and viewing operative history.

### 2. Hardware Device Lock System
- Protects departmental inventory from unauthorized sharing.
- Managers can lock accounts to:
  - **Single Device (1 Device)**: Locks the user account to their specific iPhone/iPad or phone. Unrecognized devices are blocked with an alert.
  - **Custom Limit (e.g., 2 or 3 Devices)**: Allows e.g. personal mobile + OR theatre tablet.
  - **Unlimited Devices**: For department directors and emergency accounts.
- **Device Reset Feature**: Managers can reset device bindings with 1 click if a surgeon gets a new phone.

### 3. Dynamic Item Schema & Custom Parameters Builder
- Every surgical tool or implant can have fully customizable dynamic dropdowns and parameters.
- **Example — VP Shunt System**:
  - Pressure Gauge Level: *Low (10-50 mmH2O), Medium (50-90 mmH2O), High (90-130 mmH2O), Programmable (1-5)*
  - Manufacturer: *Integra Codman, B. Braun, Medtronic Strata, Sophysa*
  - Type / Body: *Burr Hole Design, Flat Bottom Design, Unitized*
  - Anti-Siphon Mechanism: *Integrated, Diaphragm, None*
- Admins and Owners can add, rename, reorder, or remove parameters and dropdown options directly from the UI.

### 4. Surgical Consumption Logging
- Seamless operative entry:
  - Patient Full Name, Age, Gender
  - Under Specialist Care (*on his beds*) — dropdown of attending neurosurgeons
  - Bed / Ward / Room (e.g. Ward 3 - Bed 12 / ICU)
  - Date of Operation (defaults to today's date)
  - Consumed items selector with dynamic specifications and live stock limits
  - Multi-item surgical tray summary with batch/lot tracking
- On submission:
  - Stock is atomically deducted.
  - Real-time alarms are triggered if remaining stock falls at or below threshold.
  - Changes sync instantly to GitHub and local cache.

### 5. Automated Notification & Low-Stock Alarm System
- **Refill Broadcasts**: When an admin refills an item by `+N`, all neurosurgeons receive an in-app alert with the refilled amount and updated stock.
- **Low-Stock Alarms**: Triggered when stock &le; threshold (default is 2, configurable per item).
- **Distinct Visual Coding**: Items running low or out of stock glow with distinct warning colors (amber pulse and red borders) in the catalog and reporting portals.
- **Audio Chimes**: Subtle Apple-style audio tones on notifications.

### 6. Operative Logbook & Usage History
- Interactive Day & Month Selector: Filter reports by specific day or view all.
- Filter by attending neurosurgeon specialist.
- Search by patient name, procedure, or implant.
- 1-click CSV export and print summary.

### 7. iPhone App Design & Day/Night Mode
- Built following Apple Human Interface Guidelines (HIG):
  - Frosted glass navigation bars and floating bottom tab bar.
  - Smooth segmented controls and bottom sheets.
  - Dual viewing modes: realistic iPhone 16 Pro chassis on desktop or full-screen theatre station mode.
  - Day (iOS Light) and Night (iOS OLED Dark) themes.

### 8. Cloud Synchronization Engine
- Integrated with GitHub REST API (`mHub96/NW`) using safe chunked tokens.
- Offline-first caching with automatic background synchronization.

---

## ⚡ Default Accounts for Verification

| Role | Username | Password | Device Limit |
|---|---|---|---|
| **OWNER** | `owner` | `Owner2026!` | Unlimited |
| **ADMIN** | `admin` | `Admin2026!` | Unlimited |
| **REGULAR** | `dr_kareem` | `Kareem2026!` | 1 Device |
| **REGULAR** | `dr_anwar` | `Anwar2026!` | 2 Devices |
| **REGULAR** | `resident_ali` | `Resident2026!` | 1 Device |
| *Pending* | `dr_sarah` | `Sarah2026!` | 1 Device (Awaiting approval) |
