# NeuroWare (NW) 🧠🏥
### Official Neurosurgical Operating Storage Inventory & Operative Log System

**NeuroWare** is an iPhone-native styled progressive web application engineered specifically for neurosurgical operating rooms, on-call surgical shifts, and departmental implant storage.

---

## 🌟 Key Capabilities & Updated Architecture

### 1. Multi-Variant / Feature Combination Storage Values
- **Separate Storage Quantities per Specification**:
  - Surgical items with dynamic options (e.g., **VP Shunts**, **Pedicle Screws**, **Surgicel**, **FloSeal**) do not merely share a single flat count. Every combination of parameters (e.g., *Burr-Hole Design + High Pressure + Integra Codman* vs *Flat-Bottom Design + Low Pressure + B-Braun*) has its own distinct quantity in storage.
- **Specification-Targeted Refills**:
  - When the Owner or Admin refills an item, they specify which exact combination of parameters is being added (or define a new specification).
  - The refill broadcast specifically notifies all surgeons which specification was refilled and the updated count for that exact device.
- **Intraoperative Stock Verification**:
  - In the Surgery portal, as a surgeon selects each dynamic parameter, the system displays real-time stock feedback for that exact combination:
    - `🟢 In Storage: X available for this exact combination`
    - `🔴 OUT OF STOCK: 0 available for this specification in storage!`
  - Logging an operation atomically deducts the count for that exact specification and triggers low-stock alerts if that specific device reaches &le; 2 in storage.

### 2. Multi-Role Authentication & Access Control
- **OWNER (Storage Director / Chief Neurosurgeon)**:
  - Full administrative authority, approval/rejection of registration requests, assignment of device locks.
  - **Comprehensive User Editing**: The Owner can edit any user's **Full Name**, **Username (@username)**, **Phone**, **Role**, **Device Lock Policy**, and **Password**.
- **ADMIN (OR Inventory Managers)**: Storage editor, specification-level refills, dynamic parameter management, sign-up approvals, and operative reports.
- **REGULAR (Neurosurgeons, Residents, Scrub Nurses)**: Access is strictly limited to reporting intraoperative item consumption, checking current stock, and viewing surgical history.

### 3. Hardware Device Lock System
- Protects departmental inventory from unauthorized sharing.
- Managers can lock accounts to:
  - **Single Device (1 Device)**: Locks the doctor's account to their specific phone/tablet.
  - **Custom Limit (e.g., 2 or 3 Devices)**: Allows e.g. personal mobile + OR theatre tablet.
  - **Unlimited Devices**: For department directors and emergency accounts.
- **Device Reset Feature**: Managers can reset device bindings with 1 click if a surgeon gets a new phone.

### 4. Clean Operative Logbook & Usage History
- Clean slate operations log ready for live shift recording.
- Filter procedures performed on a specific day or across an entire month.
- Filter by attending neurosurgeon specialist (*on his beds*).
- 1-click CSV export and print summary.

### 5. Automated Notification & Low-Stock Alarm System
- **Refill Broadcasts**: Alerts all neurosurgeons with the refilled amount and updated stock for that specific combination.
- **Low-Stock Alarms**: Triggered when stock drops to or below the alarm threshold (default is **2**, customizable).
- **Distinct Visual Coding**: Items running low or out of stock glow with distinct animated amber/red warning borders and badges.
- **iOS Audio Chimes**: Synthesized Apple-style chimes sound on refill updates and low-stock alerts.

### 6. PWA Auto-Updating Engine & Luxury 3D Icon
- **Active Auto-Updating**: The Progressive Web App periodically checks for updates and immediately updates its cache and reload whenever a new version is pushed.
- **Luxury 3D "Brain as Treasure Chest" Icon**: An ornate 3D icon depicting the cerebral cortex sculpted as an antique treasure chest with gold gyri, brass rivets, mahogany base, glowing cyan neural interior, and ruby/sapphire escutcheon lock.

### 7. Patient Records Management & Automatic Inventory Stock Retrieval
- **Unique Medical IDs & Chronological Timeline**:
  - Every enrolled patient receives an automatically generated unique 6-digit clinical ID (e.g., `PID-556587`).
  - Historical surgeries can be inspected via an expandable operations timeline per patient.
- **Manager Editing Controls**:
  - Owner and OR Admins can edit patient demographic records (name and gender), automatically propagating updates across all historical surgical log entries.
  - Operation records can be edited with smart chronological age validation against all prior and subsequent surgeries.
- **Record Deletion with Automatic Stock Retrieval**:
  - Deleting an individual operation record or an entire patient profile **automatically retrieves all consumed surgical tools and implants directly back into inventory stock** at their exact specific parameter combinations.
  - Generates clear audit notifications and broadcasts inventory restock events across the system.

---

## ⚡ Default Accounts

| Role | Username | Password | Device Limit Policy |
|---|---|---|---|
| **OWNER** | `owner` | `Owner2026!` | Unlimited Devices |
| **ADMIN** | `admin` | `Admin2026!` | Unlimited Devices |
| **REGULAR** | `dr_kareem` | `Kareem2026!` | 1 Device (Single Device Lock) |
| **REGULAR** | `dr_anwar` | `Anwar2026!` | 2 Devices |
| **REGULAR** | `resident_ali` | `Resident2026!` | 1 Device |

---

## 👨‍⚕️ Developer & Intellectual Property
* **Lead Developer & Programmer**: Dr. Mohammed Riyadh
* **Clinical Specialization**: Neurosurgical Operating Theater Inventory & Supply Chain Engineering
* **Copyright**: © 2026 Dr. Mohammed Riyadh. All rights reserved.
