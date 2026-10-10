/**
 * NeuroWare Main Application Orchestrator
 * High-Fidelity iOS UI Controller, Multi-Variant Stock Management,
 * Dynamic Schema Specification Selectors & Clean Production Authentication
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Core Engines
  const storage = new StorageEngine();
  let dbData = await storage.loadDatabase();

  const getDb = () => dbData;
  const saveDb = async (newData, message) => {
    dbData = newData;
    await storage.commitToGitHub(dbData, message);
  };

  const auth = new AuthManager(storage, getDb, saveDb);
  const inventory = new InventoryManager(getDb, saveDb, auth);
  const notifications = new NotificationManager(getDb, saveDb, auth);

  window.NW = { storage, auth, inventory, notifications, getDb, saveDb };

  // 2. Global UI State
  let currentTab = "surgery";
  let surgicalCart = [];
  let activeEditingItemId = null;

  // 3. Theme & Status Bar Clock
  function initTheme() {
    const savedTheme = localStorage.getItem("neuroware_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    const themeSelect = document.getElementById("settingsThemeSelect");
    if (themeSelect) themeSelect.value = savedTheme;
  }

  function toggleTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("neuroware_theme", theme);
  }

  function updateClock() {
    const timeEl = document.getElementById("iosStatusBarTime");
    if (!timeEl) return;
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    hours = hours % 12 || 12;
    timeEl.textContent = `${hours}:${minutes}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 4. Cloud Sync Status Indicators
  storage.onSyncStatusChange((status, detail, lastTime) => {
    const dots = document.querySelectorAll(".sync-dot");
    const texts = document.querySelectorAll(".sync-status-text");
    dots.forEach(dot => dot.className = `sync-dot ${status}`);
    texts.forEach(txt => txt.textContent = detail || status);

    const settingsSyncTime = document.getElementById("settingsLastSync");
    if (settingsSyncTime && lastTime) {
      settingsSyncTime.textContent = new Date(lastTime).toLocaleTimeString();
    }
  });

  window.addEventListener("neuroware:data_synced", (e) => {
    dbData = e.detail;
    renderCurrentView();
    notifications.updateBadges();
  });

  // 5. Authentication UI Controller
  function checkAuthAndRender() {
    const user = auth.getCurrentUser();
    const authScreen = document.getElementById("authModalScreen");
    const appHeader = document.querySelector(".ios-nav-header");
    const appTabBar = document.querySelector(".ios-tab-bar");

    if (!user) {
      if (authScreen) authScreen.style.display = "flex";
      if (appHeader) appHeader.style.display = "none";
      if (appTabBar) appTabBar.style.display = "none";
      renderAuthForms();
    } else {
      if (authScreen) authScreen.style.display = "none";
      if (appHeader) appHeader.style.display = "flex";
      if (appTabBar) appTabBar.style.display = "flex";

      const userBadge = document.getElementById("navUserRoleBadge");
      if (userBadge) {
        userBadge.textContent = user.role;
        userBadge.className = `role-badge ${user.role.toLowerCase()}`;
      }

      setupTabBarForRole(user.role);
      renderCurrentView();
      notifications.updateBadges();
    }
  }

  function setupTabBarForRole(role) {
    const tabContainer = document.querySelector(".ios-tab-bar");
    if (!tabContainer) return;

    if (role === window.NEURO_CONFIG.ROLES.REGULAR) {
      tabContainer.innerHTML = `
        <button class="tab-item ${currentTab === 'surgery' ? 'active' : ''}" data-tab="surgery">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span class="tab-label">Surgery</span>
        </button>
        <button class="tab-item ${currentTab === 'catalog' ? 'active' : ''}" data-tab="catalog">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          <span class="tab-label">Storage</span>
        </button>
        <button class="tab-item ${currentTab === 'logbook' ? 'active' : ''}" data-tab="logbook">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span class="tab-label">History</span>
        </button>
        <button class="tab-item ${currentTab === 'alerts' ? 'active' : ''}" data-tab="alerts">
          <div style="position:relative">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span class="notif-badge" style="display:none">0</span>
          </div>
          <span class="tab-label">Alerts</span>
        </button>
        <button class="tab-item ${currentTab === 'settings' ? 'active' : ''}" data-tab="settings">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
          <span class="tab-label">Settings</span>
        </button>
      `;
    } else {
      tabContainer.innerHTML = `
        <button class="tab-item ${currentTab === 'surgery' ? 'active' : ''}" data-tab="surgery">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span class="tab-label">Surgery</span>
        </button>
        <button class="tab-item ${currentTab === 'inventory-editor' ? 'active' : ''}" data-tab="inventory-editor">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <span class="tab-label">Editor</span>
        </button>
        <button class="tab-item ${currentTab === 'logbook' ? 'active' : ''}" data-tab="logbook">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span class="tab-label">Logbook</span>
        </button>
        <button class="tab-item ${currentTab === 'users' ? 'active' : ''}" data-tab="users">
          <div style="position:relative">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <span class="pending-users-badge" style="display:none">0</span>
          </div>
          <span class="tab-label">Users</span>
        </button>
        <button class="tab-item ${currentTab === 'alerts' ? 'active' : ''}" data-tab="alerts">
          <div style="position:relative">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span class="notif-badge" style="display:none">0</span>
          </div>
          <span class="tab-label">Alerts</span>
        </button>
        <button class="tab-item ${currentTab === 'settings' ? 'active' : ''}" data-tab="settings">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
          <span class="tab-label">Settings</span>
        </button>
      `;
    }

    tabContainer.querySelectorAll(".tab-item").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll(".tab-item").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    const headerTitle = document.getElementById("navHeaderTitle");
    const titleMap = {
      surgery: "Surgical Consumption",
      catalog: "Neurosurgical Storage",
      "inventory-editor": "Storage Inventory Editor",
      logbook: "Operative Logbook",
      users: "User Directory & Devices",
      alerts: "Alerts & Notifications",
      settings: "Preferences & Cloud"
    };
    if (headerTitle) headerTitle.textContent = titleMap[tabName] || "NeuroWare";

    renderCurrentView();
  }

  function renderCurrentView() {
    const mainContainer = document.getElementById("appScreenContent");
    if (!mainContainer) return;

    if (currentTab === "surgery") {
      renderSurgeryPortal(mainContainer);
    } else if (currentTab === "catalog") {
      renderCatalogPortal(mainContainer);
    } else if (currentTab === "inventory-editor") {
      renderInventoryEditor(mainContainer);
    } else if (currentTab === "logbook") {
      renderLogbookView(mainContainer);
    } else if (currentTab === "users") {
      renderUserManagementView(mainContainer);
    } else if (currentTab === "alerts") {
      renderAlertsView(mainContainer);
    } else if (currentTab === "settings") {
      renderSettingsView(mainContainer);
    }
  }

  // ==========================================================================
  // TAB 1: SURGERY PORTAL WITH SPEC-LEVEL STOCK AVAILABILITY
  // ==========================================================================
  function renderSurgeryPortal(container) {
    const db = getDb();
    const specialists = db?.specialists || [];
    const todayStr = new Date().toISOString().split("T")[0];
    const items = inventory.getItems();

    container.innerHTML = `
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">1. Patient & Operation Details</span>
          <span style="font-size:11.5px;color:var(--ios-blue);font-weight:600;">Shift Log</span>
        </div>

        <div class="ios-input-group" style="position:relative;">
          <label class="ios-label">Patient Full Name *</label>
          <div style="position:relative;display:flex;align-items:center;">
            <input type="hidden" id="surgPatientId" value="">
            <input type="text" id="surgPatientName" class="ios-input" placeholder="e.g. Haider Qasim (حيدر قاسم)" required style="padding-right:110px;">
            <button type="button" id="btnPatientLockInfo" class="patient-lock-badge-btn" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:3;" title="Patient profile linked and locked. Tap for details.">
              🔒 <span id="lockedPidLabel">PID-000000</span>
            </button>
          </div>
          <div id="patientLockedBanner" style="display:none;font-size:11.5px;color:var(--ios-blue);margin-top:4px;font-weight:600;"></div>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Age</label>
            <input type="number" id="surgPatientAge" class="ios-input" placeholder="e.g. 52">
            <div id="surgAgeConstraintNotice" style="font-size:11px;color:var(--ios-text-secondary);margin-top:4px;line-height:1.3;"></div>
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Gender</label>
            <select id="surgPatientGender" class="ios-select">
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Under Specialist Care (On His Beds) *</label>
          <select id="surgSpecialist" class="ios-select" required>
            <option value="">-- Select Attending Neurosurgeon --</option>
            ${specialists.map(s => `<option value="${s.name}">${s.name} (${s.title || 'Neurosurgeon'})</option>`).join("")}
          </select>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Bed / Ward / Room</label>
            <input type="text" id="surgBedNumber" class="ios-input" placeholder="e.g. Ward 3 - Bed 14 / ICU">
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Operation Date *</label>
            <input type="date" id="surgOpDate" class="ios-input" value="${todayStr}">
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Procedure / Operation</label>
          <input type="text" id="surgProcedure" class="ios-input" placeholder="e.g. Right Frontal VP Shunt Placement" list="procedureSuggestions">
          <datalist id="procedureSuggestions">
            <option value="VP Shunt Placement (Medium Pressure)">
            <option value="External Ventricular Drain (EVD) Insertion">
            <option value="Emergency Craniotomy for ASDH">
            <option value="Emergency Craniotomy for EDH">
            <option value="Pterional Craniotomy for Aneurysm Clipping">
            <option value="Lumbar Microdiscectomy L4-L5">
            <option value="Posterior Lumbar Interbody Fusion (PLIF)">
            <option value="Decompressive Craniectomy">
            <option value="Cranioplasty with Bone Cement / Mesh">
            <option value="Posterior Fossa Craniectomy (Tumor Resection)">
          </datalist>
        </div>
      </div>

      <!-- Item Selection Card with Dynamic Attributes and Live Spec-Level Stock Check -->
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">2. Select Used Surgical Items</span>
          <span style="font-size:11.5px;color:var(--ios-text-secondary);">Spec Stock</span>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Select Item from Storage *</label>
          <select id="surgItemSelect" class="ios-select">
            <option value="">-- Choose Item --</option>
            ${items.map(it => {
              const stockTxt = it.quantity <= 0 ? `[OUT OF STOCK - 0]` : `[Total: ${it.quantity} ${it.unit}]`;
              const warnTag = it.quantity <= it.threshold ? `⚠️ ` : ``;
              return `<option value="${it.id}" ${it.quantity <= 0 ? 'disabled' : ''}>${warnTag}${it.name} ${stockTxt}</option>`;
            }).join("")}
          </select>
        </div>

        <!-- Dynamic Item Attributes Box (e.g. Shunt Type, Pressure, Manufacturer) -->
        <div id="dynamicAttributesSection" style="display:none;background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;text-transform:uppercase;">
            Select Device Specifications (Each parameter combinations leads to a different storage value)
          </div>
          <div id="dynamicAttributesFormFields"></div>
          
          <!-- Live Stock Feedback for the Selected Combination -->
          <div id="variantLiveStockFeedback" style="margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:600;display:none;"></div>
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;">
          <div class="ios-input-group" style="flex:1;margin-bottom:0;">
            <label class="ios-label">Quantity</label>
            <input type="number" id="surgItemQty" class="ios-input" value="1" min="1" max="50">
          </div>
          <div class="ios-input-group" style="flex:1.5;margin-bottom:0;">
            <label class="ios-label">Batch / Lot # (Optional)</label>
            <input type="text" id="surgItemLot" class="ios-input" placeholder="e.g. LOT-2026-90">
          </div>
          <button type="button" id="btnAddToTray" class="ios-btn ios-btn-secondary ios-btn-sm" style="height:42px;flex:1.2;">
            + Add to Tray
          </button>
        </div>
      </div>

      <!-- Surgical Tray Summary -->
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">3. Surgical Tray Summary</span>
          <span id="trayCountBadge" class="stock-badge healthy">${surgicalCart.length} Items</span>
        </div>

        <div id="surgicalTrayContainer" class="surgical-tray-box">
          ${renderSurgicalTrayRows()}
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Intra-Operative Notes / Observations</label>
          <textarea id="surgNotes" class="ios-textarea" placeholder="Intraoperative notes or opening pressures measured"></textarea>
        </div>

        <button type="button" id="btnSubmitOperation" class="ios-btn ios-btn-primary" style="margin-top:8px;">
          <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Record Surgical Usage & Update Storage
        </button>
      </div>
    `;

    // Patient Profile Linking, Lock & Chronological Age Management
    const nameInput = document.getElementById("surgPatientName");
    const pidInput = document.getElementById("surgPatientId");
    const ageInput = document.getElementById("surgPatientAge");
    const genderSelect = document.getElementById("surgPatientGender");
    const dateInput = document.getElementById("surgOpDate");
    const lockBtn = document.getElementById("btnPatientLockInfo");
    const lockedBanner = document.getElementById("patientLockedBanner");
    const ageNotice = document.getElementById("surgAgeConstraintNotice");

    const declinedNames = new Set();
    let nameDebounceTimer = null;

    function linkAndLockPatient(patient) {
      if (!patient) return;
      pidInput.value = patient.id;
      nameInput.value = patient.name;
      nameInput.readOnly = true;
      genderSelect.value = patient.gender || "Male";
      genderSelect.disabled = true;

      const specSelect = document.getElementById("surgSpecialist");
      if (specSelect && !specSelect.value && patient.lastSpecialist) {
        specSelect.value = patient.lastSpecialist;
      }

      const bedInput = document.getElementById("surgBedNumber");
      if (bedInput && !bedInput.value && patient.lastBed) {
        bedInput.value = patient.lastBed;
      }

      if (!ageInput.value && patient.lastAge) {
        ageInput.value = patient.lastAge;
      }

      lockBtn.style.display = "inline-flex";
      document.getElementById("lockedPidLabel").textContent = patient.id;

      lockedBanner.style.display = "block";
      lockedBanner.innerHTML = `🔒 Linked to Clinical Record: <strong>${patient.id}</strong> (${patient.operationsCount || 0} historical surgeries)`;

      updateAgeConstraints();
    }

    // Expose globally so external calls (like from the Patient Explorer) can pre-link a patient
    window.linkAndLockPatient = linkAndLockPatient;

    function unlockAndClearPatient() {
      pidInput.value = "";
      nameInput.value = "";
      nameInput.readOnly = false;
      genderSelect.disabled = false;
      ageInput.value = "";
      ageInput.removeAttribute("min");
      ageInput.removeAttribute("max");
      ageInput.style.borderColor = "";
      ageNotice.innerHTML = "";
      lockBtn.style.display = "none";
      lockedBanner.style.display = "none";
      nameInput.focus();
    }

    function updateAgeConstraints() {
      const patientId = pidInput.value;
      const opDate = dateInput.value || new Date().toISOString().split("T")[0];

      if (!patientId) {
        ageInput.removeAttribute("min");
        ageInput.removeAttribute("max");
        ageInput.style.borderColor = "";
        ageNotice.innerHTML = "";
        return;
      }

      const bounds = inventory.getAgeBoundsForDate(patientId, opDate);
      if (!bounds.hasRestrictions) {
        ageInput.removeAttribute("min");
        ageInput.removeAttribute("max");
        ageInput.style.borderColor = "";
        ageNotice.innerHTML = `<span style="color:var(--ios-green);">✓ First surgery for this profile. Any valid clinical age accepted.</span>`;
        return;
      }

      let noticeText = "";
      if (bounds.minReferenceOp && bounds.maxReferenceOp) {
        ageInput.min = bounds.minAge;
        ageInput.max = bounds.maxAge;
        noticeText = `🔒 Age constraint: Must be between <strong>${bounds.minAge}</strong> and <strong>${bounds.maxAge}</strong> (Op on ${bounds.minReferenceOp.date}: ${bounds.minAge}y; Op on ${bounds.maxReferenceOp.date}: ${bounds.maxAge}y).`;
      } else if (bounds.minReferenceOp) {
        ageInput.min = bounds.minAge;
        ageInput.removeAttribute("max");
        noticeText = `🔒 Age constraint: Must be at least <strong>${bounds.minAge}</strong> (Recorded on ${bounds.minReferenceOp.date} as ${bounds.minAge}y).`;
      } else if (bounds.maxReferenceOp) {
        ageInput.removeAttribute("min");
        ageInput.max = bounds.maxAge;
        noticeText = `🔒 Age constraint: Cannot exceed <strong>${bounds.maxAge}</strong> (Recorded on ${bounds.maxReferenceOp.date} as ${bounds.maxAge}y).`;
      }

      const currentAge = parseInt(ageInput.value, 10);
      if (!isNaN(currentAge)) {
        if ((bounds.minReferenceOp && currentAge < bounds.minAge) || (bounds.maxReferenceOp && currentAge > bounds.maxAge)) {
          ageInput.style.borderColor = "var(--ios-red)";
          ageNotice.innerHTML = `<span style="color:var(--ios-red);font-weight:700;">⚠️ ${noticeText} Current entry (${currentAge}y) violates historical chronology!</span>`;
        } else {
          ageInput.style.borderColor = "var(--ios-green)";
          ageNotice.innerHTML = `<span style="color:var(--ios-text-secondary);">${noticeText}</span>`;
        }
      } else {
        ageInput.style.borderColor = "";
        ageNotice.innerHTML = `<span style="color:var(--ios-text-secondary);">${noticeText}</span>`;
      }
    }

    function checkPatientDuplicate(name) {
      if (!name || !name.trim()) return;
      if (pidInput.value) return; // Already locked
      const clean = name.trim().toLowerCase();
      if (declinedNames.has(clean)) return;

      const match = inventory.findPatientByName(name);
      if (match) {
        showPatientMatchDialog(match);
      }
    }

    function showPatientMatchDialog(matchedPatient) {
      const existing = document.getElementById("patientMatchDialogOverlay");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "patientMatchDialogOverlay";
      overlay.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;
        background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);
        z-index:2500;display:flex;align-items:center;justify-content:center;padding:20px;
      `;

      const opCount = matchedPatient.operationsCount || 0;
      const lastOpTxt = matchedPatient.lastDate ? `Last surgery on ${matchedPatient.lastDate}` : `Clinical file active`;

      overlay.innerHTML = `
        <div style="background:var(--ios-card);border-radius:18px;max-width:340px;width:100%;padding:22px 20px;text-align:center;box-shadow:0 20px 45px rgba(0,0,0,0.35);border:1px solid var(--ios-separator);">
          <div style="font-size:38px;margin-bottom:8px;">👤 🔍</div>
          <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:var(--ios-text-primary);">
            Existing Patient Record Found
          </h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:var(--ios-text-secondary);line-height:1.45;">
            A patient named <strong>"${matchedPatient.name}"</strong> already exists in the system with ID <strong style="font-family:var(--font-mono);color:var(--ios-blue);">${matchedPatient.id}</strong>.
          </p>

          <div style="background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:10px;padding:8px 12px;margin-bottom:16px;text-align:left;font-size:12px;color:var(--ios-text-secondary);">
            <div>• <strong>Gender:</strong> ${matchedPatient.gender || 'Not specified'}</div>
            <div>• <strong>Historical Operations:</strong> ${opCount} procedure${opCount === 1 ? '' : 's'}</div>
            <div>• <strong>Status:</strong> ${lastOpTxt}</div>
            ${matchedPatient.lastAge ? `<div>• <strong>Last Recorded Age:</strong> ${matchedPatient.lastAge} years old</div>` : ''}
          </div>

          <p style="margin:0 0 16px 0;font-size:13.5px;font-weight:600;color:var(--ios-text-primary);">
            Is this the <strong>same patient</strong>?
          </p>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <button type="button" id="btnMatchYes" class="ios-btn ios-btn-primary" style="font-weight:700;">
              Yes, Same Patient (Fetch & Lock Profile)
            </button>
            <button type="button" id="btnMatchNo" class="ios-btn ios-btn-secondary" style="font-size:13px;">
              No, Different Patient (Create New ID)
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById("btnMatchYes").addEventListener("click", () => {
        overlay.remove();
        linkAndLockPatient(matchedPatient);
      });

      document.getElementById("btnMatchNo").addEventListener("click", () => {
        overlay.remove();
        declinedNames.add(matchedPatient.name.trim().toLowerCase());
        pidInput.value = "";
        nameInput.readOnly = false;
        genderSelect.disabled = false;
        lockBtn.style.display = "none";
        lockedBanner.style.display = "none";
        updateAgeConstraints();
      });
    }

    nameInput.addEventListener("input", () => {
      clearTimeout(nameDebounceTimer);
      if (!nameInput.value.trim()) {
        declinedNames.clear();
      }
      if (nameInput.value.trim().length >= 3 && !pidInput.value) {
        nameDebounceTimer = setTimeout(() => {
          checkPatientDuplicate(nameInput.value);
        }, 650);
      }
    });

    nameInput.addEventListener("blur", () => {
      clearTimeout(nameDebounceTimer);
      if (nameInput.value.trim() && !pidInput.value) {
        checkPatientDuplicate(nameInput.value);
      }
    });

    dateInput.addEventListener("change", updateAgeConstraints);
    ageInput.addEventListener("input", updateAgeConstraints);

    lockBtn.addEventListener("click", () => {
      const patientId = pidInput.value;
      const patient = inventory.getPatientById(patientId);
      const title = document.getElementById("sheetModalTitle");
      const body = document.getElementById("sheetModalBody");
      title.textContent = `Patient Locked: ${patient?.id || patientId}`;
      body.innerHTML = `
        <div style="padding:10px 0 16px 0;">
          <div style="text-align:center;font-size:36px;margin-bottom:8px;">🔒</div>
          <h3 style="margin:0 0 6px 0;font-size:17px;font-weight:700;text-align:center;color:var(--ios-text-primary);">
            ${patient?.name || 'Patient Profile'} (${patient?.id || patientId})
          </h3>
          <p style="font-size:13px;color:var(--ios-text-secondary);line-height:1.45;margin:0 0 14px 0;text-align:center;">
            Patient demographics (Name & Gender) are locked because this surgery is linked to an existing clinical medical record. This preserves identity consistency across surgical shifts.
          </p>

          <div style="background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12.5px;color:var(--ios-text-secondary);">
            <div>• <strong>Unique Patient ID:</strong> <span style="font-family:var(--font-mono);font-weight:700;color:var(--ios-blue);">${patient?.id}</span></div>
            <div>• <strong>Gender:</strong> ${patient?.gender || 'Male'} (Locked)</div>
            <div>• <strong>Historical Operations:</strong> ${patient?.operationsCount || 0} surgeries recorded</div>
            ${patient?.lastDate ? `<div>• <strong>Most Recent Surgery:</strong> ${patient.lastDate} (${patient.lastProcedure || 'Neurosurgery'})</div>` : ''}
            ${patient?.lastAge ? `<div>• <strong>Recorded Age on Last Op:</strong> ${patient.lastAge} years old</div>` : ''}
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;">
            <button type="button" class="ios-btn ios-btn-primary" onclick="closeModal()">
              Keep Locked & Continue Operation
            </button>
            <button type="button" id="btnUnlockAndClearFields" class="ios-btn ios-btn-danger ios-btn-sm">
              Clear All Fields & Unlock for Different Patient
            </button>
          </div>
        </div>
      `;

      document.getElementById("btnUnlockAndClearFields").addEventListener("click", () => {
        closeModal();
        unlockAndClearPatient();
      });

      openModal();
    });

    const itemSelect = document.getElementById("surgItemSelect");
    const dynamicSection = document.getElementById("dynamicAttributesSection");
    const dynamicFields = document.getElementById("dynamicAttributesFormFields");
    const liveStockFeedback = document.getElementById("variantLiveStockFeedback");
    const addBtn = document.getElementById("btnAddToTray");

    function checkLiveVariantStock() {
      const selectedId = itemSelect.value;
      if (!selectedId) return;
      const item = inventory.getItemById(selectedId);
      if (!item) return;

      const dynamicInputs = document.querySelectorAll(".dynamic-attr-input");
      const selectedAttrs = {};
      let allSelected = true;

      dynamicInputs.forEach(inp => {
        const val = inp.value.trim();
        if (!val) allSelected = false;
        selectedAttrs[inp.dataset.attrName] = val;
      });

      if (!allSelected) {
        liveStockFeedback.style.display = "block";
        liveStockFeedback.style.background = "var(--ios-bg-tertiary)";
        liveStockFeedback.style.color = "var(--ios-text-secondary)";
        liveStockFeedback.textContent = "Please select all specifications to verify available storage quantity.";
        return;
      }

      const variant = inventory.findVariant(item, selectedAttrs);
      liveStockFeedback.style.display = "block";

      if (variant && variant.quantity > 0) {
        liveStockFeedback.style.background = "rgba(52, 199, 89, 0.15)";
        liveStockFeedback.style.color = "var(--ios-green)";
        liveStockFeedback.innerHTML = `🟢 In Storage: <strong>${variant.quantity} ${item.unit}</strong> available for this exact combination.`;
        document.getElementById("surgItemQty").max = variant.quantity;
      } else {
        liveStockFeedback.style.background = "rgba(255, 59, 48, 0.15)";
        liveStockFeedback.style.color = "var(--ios-red)";
        liveStockFeedback.innerHTML = `🔴 OUT OF STOCK: <strong>0 ${item.unit}</strong> available for this specification in storage!`;
        document.getElementById("surgItemQty").max = 0;
      }
    }

    itemSelect.addEventListener("change", () => {
      const selectedId = itemSelect.value;
      if (!selectedId) {
        dynamicSection.style.display = "none";
        return;
      }

      const item = inventory.getItemById(selectedId);
      if (!item || !item.attributes || item.attributes.length === 0) {
        dynamicSection.style.display = "none";
        return;
      }

      dynamicSection.style.display = "block";
      dynamicFields.innerHTML = item.attributes.map(attr => {
        return `
          <div class="ios-input-group">
            <label class="ios-label">${attr.name} *</label>
            <select class="ios-select dynamic-attr-input" data-attr-name="${attr.name}" required>
              <option value="">-- Choose ${attr.name} --</option>
              ${(attr.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("")}
            </select>
          </div>
        `;
      }).join("");

      document.querySelectorAll(".dynamic-attr-input").forEach(sel => {
        sel.addEventListener("change", checkLiveVariantStock);
      });

      checkLiveVariantStock();
    });

    // Add to tray handler
    addBtn.addEventListener("click", () => {
      const selectedId = itemSelect.value;
      if (!selectedId) {
        alert("Please select an item from storage.");
        return;
      }

      const item = inventory.getItemById(selectedId);
      const qty = parseInt(document.getElementById("surgItemQty").value, 10) || 1;
      const lot = document.getElementById("surgItemLot").value.trim();

      if (qty <= 0) {
        alert("Quantity must be at least 1.");
        return;
      }

      const dynamicInputs = document.querySelectorAll(".dynamic-attr-input");
      const selectedAttributes = {};
      let missingField = false;

      dynamicInputs.forEach(inp => {
        const val = inp.value.trim();
        if (!val) missingField = true;
        selectedAttributes[inp.dataset.attrName] = val;
      });

      if (dynamicInputs.length > 0 && missingField) {
        alert("Please select all device parameters (e.g. Type, Pressure level, Manufacturer) to identify the specific item.");
        return;
      }

      // Check variant stock
      if (item.attributes && item.attributes.length > 0) {
        const variant = inventory.findVariant(item, selectedAttributes);
        const specSummary = Object.entries(selectedAttributes).map(([k, v]) => `${k}: ${v}`).join(", ");
        if (!variant || variant.quantity <= 0) {
          alert(`This specific device (${specSummary}) is out of stock in storage!`);
          return;
        }

        const alreadyInTray = surgicalCart
          .filter(x => x.itemId === selectedId && InventoryManager.getVariantKey(x.selectedAttributes) === InventoryManager.getVariantKey(selectedAttributes))
          .reduce((sum, x) => sum + x.quantity, 0);

        if (variant.quantity < (alreadyInTray + qty)) {
          alert(`Insufficient stock! Only ${variant.quantity} available for this specification.`);
          return;
        }
      }

      surgicalCart.push({
        itemId: item.id,
        itemName: item.name,
        quantity: qty,
        unit: item.unit,
        selectedAttributes,
        lotNumber: lot
      });

      itemSelect.value = "";
      dynamicSection.style.display = "none";
      document.getElementById("surgItemQty").value = "1";
      document.getElementById("surgItemLot").value = "";

      const trayBox = document.getElementById("surgicalTrayContainer");
      if (trayBox) trayBox.innerHTML = renderSurgicalTrayRows();
      const badge = document.getElementById("trayCountBadge");
      if (badge) badge.textContent = `${surgicalCart.length} Items`;
    });

    // Submit Operation
    document.getElementById("btnSubmitOperation").addEventListener("click", async () => {
      const patientId = document.getElementById("surgPatientId").value.trim();
      const patientName = document.getElementById("surgPatientName").value.trim();
      const specialistCare = document.getElementById("surgSpecialist").value;
      const patientAge = document.getElementById("surgPatientAge").value;
      const patientGender = document.getElementById("surgPatientGender").value;
      const bedNumber = document.getElementById("surgBedNumber").value.trim();
      const opDate = document.getElementById("surgOpDate").value;
      const procedureName = document.getElementById("surgProcedure").value.trim();
      const notes = document.getElementById("surgNotes").value.trim();

      if (!patientName) {
        alert("Please provide the Patient's Name.");
        return;
      }
      if (!specialistCare) {
        alert("Please select the attending Specialist Care.");
        return;
      }
      if (surgicalCart.length === 0) {
        alert("Please add at least one consumed surgical item to the tray.");
        return;
      }

      // Chronological age validation check against historical ops
      if (patientId && patientAge) {
        try {
          inventory.validatePatientAge(patientId, opDate, patientAge);
        } catch (ageErr) {
          alert("Chronological Age Validation Error: " + ageErr.message);
          return;
        }
      }

      const reportPayload = {
        patientId: patientId || undefined,
        patientName,
        specialistCare,
        patientAge,
        patientGender,
        bedNumber,
        operationDate: opDate,
        procedureName,
        notes,
        items: surgicalCart
      };

      try {
        const btn = document.getElementById("btnSubmitOperation");
        btn.disabled = true;
        btn.textContent = "Updating Storage Counts...";

        await inventory.submitSurgicalConsumption(reportPayload);
        surgicalCart = [];
        alert("Surgical consumption successfully recorded! Storage counts updated and linked to patient profile.");
        switchTab("logbook");
      } catch (err) {
        alert("Error logging surgical consumption: " + err.message);
        const btn = document.getElementById("btnSubmitOperation");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Record Surgical Usage & Update Storage";
        }
      }
    });
  }

  function renderSurgicalTrayRows() {
    if (surgicalCart.length === 0) {
      return `<div class="tray-empty-notice">No items in surgical tray yet. Select items and parameters above.</div>`;
    }

    return surgicalCart.map((it, idx) => {
      const attrBadges = Object.entries(it.selectedAttributes || {}).map(([k, v]) => {
        return `<span class="attr-pill-preview"><strong>${k}:</strong> ${v}</span>`;
      }).join(" ");

      return `
        <div class="tray-item-row">
          <div class="tray-item-info">
            <div class="tray-item-name">${it.quantity}x ${it.itemName}</div>
            <div class="tray-item-params">
              ${attrBadges || '<span style="color:var(--ios-text-tertiary)">Standard</span>'}
              ${it.lotNumber ? `<span style="margin-left:6px;font-family:var(--font-mono);font-size:11px;">[Lot: ${it.lotNumber}]</span>` : ''}
            </div>
          </div>
          <button type="button" class="btn-tag-remove" onclick="window.removeTrayItem(${idx})" title="Remove item">&times;</button>
        </div>
      `;
    }).join("");
  }

  window.removeTrayItem = (index) => {
    surgicalCart.splice(index, 1);
    const trayBox = document.getElementById("surgicalTrayContainer");
    if (trayBox) trayBox.innerHTML = renderSurgicalTrayRows();
    const badge = document.getElementById("trayCountBadge");
    if (badge) badge.textContent = `${surgicalCart.length} Items`;
  };

  // ==========================================================================
  // TAB 2 (REGULAR): READ-ONLY STORAGE CATALOG VIEW
  // ==========================================================================
  function renderCatalogPortal(container) {
    const categories = window.NEURO_CONFIG.NEUROSURGERY_CATEGORIES;
    let selectedCat = "All Items";
    let searchQ = "";

    function renderList() {
      const items = inventory.getItems(selectedCat, searchQ);
      const listContainer = document.getElementById("catalogItemList");
      if (!listContainer) return;

      if (items.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;padding:30px 10px;color:var(--ios-text-secondary);">No items match this search.</div>`;
        return;
      }

      listContainer.innerHTML = items.map(item => {
        const isLow = item.isLowStock;
        const isOut = item.isOutOfStock;
        let cardAlertClass = isOut ? "out-of-stock-alert" : (isLow ? "low-stock-alert" : "");

        const variantsHtml = (item.variants || []).map(v => {
          const specTitle = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: <strong>${val}</strong>`).join(" • ");
          const vLow = v.isLowStock;
          const vOut = v.isOutOfStock;
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:0.5px solid var(--ios-separator);font-size:12px;">
              <div>${specTitle}</div>
              <div style="font-weight:700;color:${vOut ? 'var(--ios-red)' : (vLow ? 'var(--ios-orange)' : 'var(--ios-text-primary)')};">
                ${v.quantity} ${item.unit} ${vOut ? '(OUT)' : (vLow ? '(LOW)' : '')}
              </div>
            </div>
          `;
        }).join("");

        return `
          <div class="neuro-item-card ${cardAlertClass}">
            <div class="item-top-row">
              <div class="item-title-wrap">
                <div class="item-title">${item.name}</div>
                <span class="item-category-tag">${item.category}</span>
              </div>
              <div class="item-stock-visual">
                <div class="stock-count-huge ${isOut ? 'out' : (isLow ? 'low' : '')}">
                  ${item.quantity} <span style="font-size:12px;font-weight:600;color:var(--ios-text-secondary);">${item.unit}</span>
                </div>
                ${isOut ? '<span class="stock-badge out_of_stock">OUT OF STOCK</span>' : (isLow ? '<span class="stock-badge low_stock">⚠️ LOW STOCK</span>' : '<span class="stock-badge healthy">Available</span>')}
              </div>
            </div>

            <!-- Expandable Feature Breakdown -->
            ${item.variants && item.variants.length > 0 ? `
              <details style="margin-top:10px;background:var(--ios-card-inner);border-radius:var(--radius-md);padding:6px 10px;border:1px solid var(--ios-separator);">
                <summary style="font-size:12px;font-weight:600;color:var(--ios-blue);cursor:pointer;">
                  📦 View Specifications Breakdown (${item.variants.length} Types)
                </summary>
                <div style="margin-top:8px;">
                  ${variantsHtml}
                </div>
              </details>
            ` : ''}

            <div class="item-meta-row">
              <div class="item-meta-item">
                <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
                <span>${item.location || 'Storage'}</span>
              </div>
              <div class="item-meta-item">
                <span>Alarm Threshold: &le; ${item.threshold}</span>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    container.innerHTML = `
      <div style="margin-bottom:12px;">
        <input type="text" id="catalogSearchInput" class="ios-input" placeholder="🔍 Search surgical tools, shunts, clips, burrs...">
      </div>

      <div class="ios-segmented-control" id="catalogCategorySegments">
        ${categories.slice(0, 5).map((cat, i) => `
          <button class="segment-btn ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>
        `).join("")}
      </div>

      <div id="catalogItemList"></div>
    `;

    document.getElementById("catalogSearchInput").addEventListener("input", (e) => {
      searchQ = e.target.value;
      renderList();
    });

    document.querySelectorAll("#catalogCategorySegments .segment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#catalogCategorySegments .segment-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCat = btn.dataset.cat;
        renderList();
      });
    });

    renderList();
  }

  // ==========================================================================
  // TAB 2 (ADMIN / OWNER): INVENTORY EDITOR & REFILL COMBINATION BUILDER
  // ==========================================================================
  function renderInventoryEditor(container) {
    const categories = window.NEURO_CONFIG.NEUROSURGERY_CATEGORIES;
    let selectedCat = "All Items";
    let searchQ = "";

    function renderEditorList() {
      const items = inventory.getItems(selectedCat, searchQ);
      const listEl = document.getElementById("editorItemList");
      if (!listEl) return;

      listEl.innerHTML = items.map(item => {
        const isLow = item.isLowStock;
        const isOut = item.isOutOfStock;
        let cardAlertClass = isOut ? "out-of-stock-alert" : (isLow ? "low-stock-alert" : "");

        const variantsHtml = (item.variants || []).map(v => {
          const specTitle = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: <strong>${val}</strong>`).join(" • ");
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:0.5px solid var(--ios-separator);font-size:12px;">
              <div>${specTitle}</div>
              <div style="font-weight:700;color:${v.isOutOfStock ? 'var(--ios-red)' : (v.isLowStock ? 'var(--ios-orange)' : 'var(--ios-text-primary)')};">
                ${v.quantity} ${item.unit}
              </div>
            </div>
          `;
        }).join("");

        return `
          <div class="neuro-item-card ${cardAlertClass}">
            <div class="item-top-row">
              <div class="item-title-wrap">
                <div class="item-title">${item.name}</div>
                <span class="item-category-tag">${item.category}</span>
                <span style="font-size:11px;color:var(--ios-text-secondary);margin-left:8px;">Loc: ${item.location}</span>
              </div>
              <div class="item-stock-visual">
                <div class="stock-count-huge ${isOut ? 'out' : (isLow ? 'low' : '')}">
                  ${item.quantity} <span style="font-size:12px;font-weight:600;color:var(--ios-text-secondary);">${item.unit}</span>
                </div>
                <div style="font-size:11px;color:var(--ios-text-tertiary);margin-top:2px;">Threshold: &le; ${item.threshold}</div>
              </div>
            </div>

            <!-- Dynamic Variants List in Editor -->
            ${item.variants && item.variants.length > 0 ? `
              <div style="margin-top:10px;background:var(--ios-card-inner);border-radius:var(--radius-md);padding:8px 12px;border:1px solid var(--ios-separator);">
                <div style="font-size:11.5px;font-weight:700;color:var(--ios-blue);text-transform:uppercase;margin-bottom:6px;">
                  Active Specifications & Stock
                </div>
                ${variantsHtml}
              </div>
            ` : ''}

            <!-- Manager Action Controls -->
            <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:0.5px solid var(--ios-separator);flex-wrap:wrap;">
              <button class="ios-btn ios-btn-success ios-btn-sm" onclick="window.openRefillModal('${item.id}')">
                + Refill Specific Spec
              </button>
              <button class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openEditItemModal('${item.id}')">
                ✏️ Edit Details
              </button>
              <button class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openSchemaModal('${item.id}')" style="background:rgba(0,122,255,0.12);color:var(--ios-blue);">
                ⚙️ Dynamic Parameters (${(item.attributes || []).length})
              </button>
              <button class="ios-btn ios-btn-danger ios-btn-sm" onclick="window.deleteItemAction('${item.id}')" style="margin-left:auto;">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join("");
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="ios-section-title">Neurosurgical Storage Management</span>
        <button id="btnOpenAddItemModal" class="ios-btn ios-btn-primary ios-btn-sm" style="width:auto;">
          + Add New Tool / Item
        </button>
      </div>

      <div style="margin-bottom:12px;">
        <input type="text" id="editorSearchInput" class="ios-input" placeholder="🔍 Search inventory items...">
      </div>

      <div id="editorItemList"></div>
    `;

    document.getElementById("editorSearchInput").addEventListener("input", (e) => {
      searchQ = e.target.value;
      renderEditorList();
    });

    document.getElementById("btnOpenAddItemModal").addEventListener("click", () => {
      openAddItemModal();
    });

    renderEditorList();
  }

  // --- Refill Modal (Specifies Exact Feature Combination to Refill) ---
  window.openRefillModal = (itemId) => {
    const item = inventory.getItemById(itemId);
    if (!item) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Refill Stock: ${item.name}`;

    const hasAttrs = item.attributes && item.attributes.length > 0;
    const existingVariants = item.variants || [];

    body.innerHTML = `
      <form id="refillForm">
        <div style="background:var(--ios-card-inner);padding:12px;border-radius:var(--radius-md);margin-bottom:14px;border:1px solid var(--ios-separator);">
          <div style="font-size:12px;color:var(--ios-text-secondary);">Total in Storage across all specs:</div>
          <div style="font-size:20px;font-weight:800;color:var(--ios-text-primary);">
            ${item.quantity} ${item.unit}
          </div>
        </div>

        ${hasAttrs ? `
          <!-- Combination Selector -->
          <div class="ios-card" style="padding:12px;margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--ios-blue);text-transform:uppercase;margin-bottom:8px;">
              Specify Device Combination to Refill
            </div>

            ${existingVariants.length > 0 ? `
              <div class="ios-input-group">
                <label class="ios-label">Choose Existing Specification</label>
                <select id="refillExistingVariantSelect" class="ios-select">
                  <option value="">-- Or choose from custom dropdowns below --</option>
                  ${existingVariants.map((v, idx) => {
                    const desc = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(" • ");
                    return `<option value="${idx}">${desc} [Current: ${v.quantity} ${item.unit}]</option>`;
                  }).join("")}
                </select>
              </div>
            ` : ''}

            <!-- Custom Parameter Pickers -->
            <div id="refillCustomAttrFields">
              ${item.attributes.map(attr => `
                <div class="ios-input-group">
                  <label class="ios-label">${attr.name} *</label>
                  <select class="ios-select refill-attr-input" data-attr-name="${attr.name}" required>
                    <option value="">-- Select ${attr.name} --</option>
                    ${(attr.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("")}
                  </select>
                </div>
              `).join("")}
            </div>

            <!-- Prominent Specific Combination Stock Display -->
            <div id="refillSpecStockBanner" style="margin-top:10px;"></div>
          </div>
        ` : `
          <!-- Non-variant item stock display -->
          <div id="refillSpecStockBanner" style="margin-bottom:12px;"></div>
        `}

        <div class="ios-input-group">
          <label class="ios-label">Amount to Add (+ Quantity) *</label>
          <input type="number" id="refillAmountInput" class="ios-input" value="5" min="1" required>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:14px;">
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 1; window.updateRefillSpecBanner && window.updateRefillSpecBanner();">+1</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 3; window.updateRefillSpecBanner && window.updateRefillSpecBanner();">+3</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 5; window.updateRefillSpecBanner && window.updateRefillSpecBanner();">+5</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 10; window.updateRefillSpecBanner && window.updateRefillSpecBanner();">+10</button>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Refill Note (Broadcast to Neurosurgeons)</label>
          <input type="text" id="refillNoteInput" class="ios-input" placeholder="e.g. Received new shipment from Central Pharmacy">
        </div>

        <button type="submit" class="ios-btn ios-btn-success" style="margin-top:8px;">
          Confirm Refill & Broadcast
        </button>
      </form>
    `;

    function updateRefillSpecBanner() {
      const banner = document.getElementById("refillSpecStockBanner");
      if (!banner) return;

      const refillAmount = parseInt(document.getElementById("refillAmountInput")?.value, 10) || 0;

      if (!hasAttrs) {
        const cur = item.quantity;
        const proj = cur + refillAmount;
        banner.innerHTML = `
          <div style="padding:12px 14px;border-radius:12px;background:rgba(0,122,255,0.06);border:1.5px solid var(--ios-blue);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:11px;font-weight:800;color:var(--ios-blue);text-transform:uppercase;">📦 Current Storage Stock</span>
              <span class="stock-badge ${cur <= 0 ? 'out' : (cur <= item.threshold ? 'low' : 'healthy')}">${cur <= 0 ? 'Out of Stock' : (cur <= item.threshold ? 'Low Stock' : 'In Stock')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:13px;color:var(--ios-text-secondary);font-weight:600;">Remaining in Storage:</span>
              <span style="font-size:22px;font-weight:800;color:var(--ios-text-primary);">${cur} <small style="font-size:12px;font-weight:600;color:var(--ios-text-secondary);">${item.unit}</small></span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-top:6px;border-top:1px solid var(--ios-separator);padding-top:6px;">
              <span style="color:var(--ios-text-secondary);">Projected Total after +${refillAmount}:</span>
              <span style="font-weight:800;color:var(--ios-green);font-size:15px;">${proj} ${item.unit}</span>
            </div>
          </div>
        `;
        return;
      }

      // Collect selected attributes
      const selectedAttrs = {};
      let allSelected = true;
      document.querySelectorAll(".refill-attr-input").forEach(inp => {
        const val = inp.value.trim();
        if (!val) allSelected = false;
        selectedAttrs[inp.dataset.attrName] = val;
      });

      if (!allSelected) {
        banner.innerHTML = `
          <div style="padding:10px 12px;border-radius:10px;background:var(--ios-card-inner);border:1px dashed var(--ios-separator);font-size:12px;color:var(--ios-text-secondary);text-align:center;">
            ℹ️ Select all parameters above to view remaining stock for that exact combination.
          </div>
        `;
        return;
      }

      const stock = inventory.getVariantStock(item.id, selectedAttrs);
      const curQty = stock.quantity;
      const projQty = curQty + refillAmount;
      const isOut = curQty <= 0;
      const isLow = !isOut && curQty <= stock.threshold;
      const badgeClass = isOut ? "out" : (isLow ? "low" : "healthy");
      const badgeText = isOut ? "Out of Stock" : (isLow ? "Low Stock" : "In Stock");

      const specSummary = Object.entries(selectedAttrs).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(" • ");

      banner.innerHTML = `
        <div style="padding:12px 14px;border-radius:12px;background:rgba(0,122,255,0.06);border:1.5px solid var(--ios-blue);box-shadow:0 2px 8px rgba(0,122,255,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:800;color:var(--ios-blue);text-transform:uppercase;letter-spacing:0.5px;">
              📦 Remaining Stock for this Specification
            </span>
            <span class="stock-badge ${badgeClass}">${badgeText}</span>
          </div>

          <div style="font-size:11.5px;color:var(--ios-text-secondary);margin-bottom:8px;line-height:1.4;">
            ${specSummary}
          </div>

          <div style="display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid var(--ios-separator);border-bottom:1px solid var(--ios-separator);padding:8px 0;margin-bottom:8px;">
            <span style="font-size:13px;color:var(--ios-text-secondary);font-weight:600;">Remaining in Storage:</span>
            <span style="font-size:24px;font-weight:800;color:${isOut ? 'var(--ios-red)' : (isLow ? 'var(--ios-orange)' : 'var(--ios-green)')};">
              ${curQty} <small style="font-size:13px;font-weight:600;color:var(--ios-text-secondary);">${item.unit}</small>
            </span>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px;">
            <span style="color:var(--ios-text-secondary);">Projected Total after Refill (+${refillAmount}):</span>
            <span style="font-weight:800;color:var(--ios-green);font-size:16px;">
              ${projQty} ${item.unit}
            </span>
          </div>
        </div>
      `;
    }

    window.updateRefillSpecBanner = updateRefillSpecBanner;

    // Hook existing variant select to auto-populate the inputs
    const existSelect = document.getElementById("refillExistingVariantSelect");
    if (existSelect) {
      existSelect.addEventListener("change", () => {
        const val = existSelect.value;
        if (val !== "") {
          const chosenVar = existingVariants[parseInt(val, 10)];
          if (chosenVar && chosenVar.attributes) {
            document.querySelectorAll(".refill-attr-input").forEach(inp => {
              const name = inp.dataset.attrName;
              if (chosenVar.attributes[name]) {
                inp.value = chosenVar.attributes[name];
              }
            });
            updateRefillSpecBanner();
          }
        }
      });
    }

    document.querySelectorAll(".refill-attr-input").forEach(sel => {
      sel.addEventListener("change", () => {
        if (existSelect) existSelect.value = "";
        updateRefillSpecBanner();
      });
    });

    document.getElementById("refillAmountInput").addEventListener("input", updateRefillSpecBanner);

    // Initial banner render
    updateRefillSpecBanner();

    document.getElementById("refillForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parseInt(document.getElementById("refillAmountInput").value, 10);
      const note = document.getElementById("refillNoteInput").value.trim();

      const selectedAttributes = {};
      if (hasAttrs) {
        let missing = false;
        document.querySelectorAll(".refill-attr-input").forEach(inp => {
          const val = inp.value.trim();
          if (!val) missing = true;
          selectedAttributes[inp.dataset.attrName] = val;
        });

        if (missing) {
          alert("Please select all device parameters to specify which combination you are refilling.");
          return;
        }
      }

      try {
        await inventory.refillItem(itemId, amount, selectedAttributes, note);
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Refill failed: " + err.message);
      }
    });

    openModal();
  };

  // --- Add New Item Modal ---
  function openAddItemModal() {
    const modal = document.getElementById("universalBottomSheet");
    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");

    title.textContent = "Add New Surgical Item";
    body.innerHTML = `
      <form id="addItemForm">
        <div class="ios-input-group">
          <label class="ios-label">Item / Tool Name *</label>
          <input type="text" id="newItemName" class="ios-input" placeholder="e.g. VP Shunt System (Adult)" required>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Category</label>
            <select id="newItemCategory" class="ios-select">
              ${window.NEURO_CONFIG.NEUROSURGERY_CATEGORIES.filter(c => c !== "All Items").map(c => `<option value="${c}">${c}</option>`).join("")}
            </select>
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Packaging Unit</label>
            <input type="text" id="newItemUnit" class="ios-input" value="Kits" placeholder="Kits, Boxes, Screws">
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Initial Quantity</label>
            <input type="number" id="newItemQty" class="ios-input" value="0" min="0">
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Low Stock Alarm Threshold</label>
            <input type="number" id="newItemThreshold" class="ios-input" value="2" min="1">
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Storage Location (Cabinet / Shelf / Fridge)</label>
          <input type="text" id="newItemLocation" class="ios-input" placeholder="e.g. Cabinet A - Shelf 2">
        </div>

        <div class="ios-input-group">
          <label class="ios-label">SKU / Catalog Code (Optional)</label>
          <input type="text" id="newItemSku" class="ios-input" placeholder="e.g. VPS-COD-01">
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Clinical Notes</label>
          <textarea id="newItemNotes" class="ios-textarea" placeholder="Intraoperative notes or storage warnings"></textarea>
        </div>

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:10px;">Create Item in Storage</button>
      </form>
    `;

    document.getElementById("addItemForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await inventory.addItem({
          name: document.getElementById("newItemName").value.trim(),
          category: document.getElementById("newItemCategory").value,
          unit: document.getElementById("newItemUnit").value.trim(),
          quantity: parseInt(document.getElementById("newItemQty").value, 10),
          lowStockThreshold: parseInt(document.getElementById("newItemThreshold").value, 10),
          location: document.getElementById("newItemLocation").value.trim(),
          sku: document.getElementById("newItemSku").value.trim(),
          notes: document.getElementById("newItemNotes").value.trim()
        });
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Failed to add item: " + err.message);
      }
    });

    openModal();
  }

  // --- Edit General Item Details ---
  window.openEditItemModal = (itemId) => {
    const item = inventory.getItemById(itemId);
    if (!item) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Edit Details: ${item.name}`;

    body.innerHTML = `
      <form id="editItemForm">
        <div class="ios-input-group">
          <label class="ios-label">Item Name</label>
          <input type="text" id="editItemName" class="ios-input" value="${item.name}" required>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Category</label>
            <select id="editItemCategory" class="ios-select">
              ${window.NEURO_CONFIG.NEUROSURGERY_CATEGORIES.filter(c => c !== "All Items").map(c => `
                <option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>
              `).join("")}
            </select>
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Packaging Unit</label>
            <input type="text" id="editItemUnit" class="ios-input" value="${item.unit}">
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Alarm Threshold</label>
            <input type="number" id="editItemThreshold" class="ios-input" value="${item.threshold}" min="1">
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Storage Location</label>
            <input type="text" id="editItemLocation" class="ios-input" value="${item.location || ''}">
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">SKU</label>
          <input type="text" id="editItemSku" class="ios-input" value="${item.sku || ''}">
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Notes</label>
          <textarea id="editItemNotes" class="ios-textarea">${item.notes || ''}</textarea>
        </div>

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:10px;">Save Updates</button>
      </form>
    `;

    document.getElementById("editItemForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await inventory.updateItem(itemId, {
          name: document.getElementById("editItemName").value,
          category: document.getElementById("editItemCategory").value,
          unit: document.getElementById("editItemUnit").value,
          lowStockThreshold: parseInt(document.getElementById("editItemThreshold").value, 10),
          location: document.getElementById("editItemLocation").value,
          sku: document.getElementById("editItemSku").value,
          notes: document.getElementById("editItemNotes").value
        });
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Update failed: " + err.message);
      }
    });

    openModal();
  };

  // --- Dynamic Schema Builder Modal ---
  window.openSchemaModal = (itemId) => {
    activeEditingItemId = itemId;
    const item = inventory.getItemById(itemId);
    if (!item) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Configure Parameters: ${item.name}`;

    function renderSchemaModalContent() {
      const freshItem = inventory.getItemById(activeEditingItemId);
      const attrs = freshItem?.attributes || [];

      body.innerHTML = `
        <div style="margin-bottom:14px;">
          <div style="font-size:13px;color:var(--ios-text-secondary);margin-bottom:6px;">
            Add or edit the parameters (dropdowns) for this item. Each combination of these parameters represents a distinct surgical item with its own stock count.
          </div>
        </div>

        <div class="attr-builder-card" style="border:1.5px dashed var(--ios-blue);">
          <div style="font-size:12.5px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;">+ Add New Parameter / Dropdown</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" id="newAttrNameInput" class="ios-input" placeholder="e.g. Shunt Pressure Gauge Level" style="flex:2;">
            <select id="newAttrTypeInput" class="ios-select" style="flex:1;">
              <option value="dropdown">Dropdown List</option>
              <option value="text">Free Text</option>
              <option value="number">Number</option>
            </select>
          </div>
          <div class="ios-input-group" style="margin-bottom:8px;">
            <input type="text" id="newAttrInitialOptions" class="ios-input" placeholder="Comma-separated options: Low, Medium, High">
          </div>
          <button type="button" id="btnCreateAttr" class="ios-btn ios-btn-primary ios-btn-sm">Create Parameter</button>
        </div>

        <div style="margin-top:16px;">
          <div class="ios-section-title" style="margin-bottom:10px;">Configured Parameters (${attrs.length})</div>
          ${attrs.length === 0 ? `<div style="text-align:center;color:var(--ios-text-secondary);padding:14px;">No parameters added yet.</div>` : ''}

          ${attrs.map((attr) => `
            <div class="attr-builder-card">
              <div class="attr-builder-header">
                <div>
                  <strong style="font-size:14px;">${attr.name}</strong>
                  <span style="font-size:11px;color:var(--ios-blue);margin-left:6px;text-transform:uppercase;">[${attr.type}]</span>
                </div>
                <button type="button" class="btn-tag-remove" onclick="window.deleteAttributeAction('${activeEditingItemId}', '${attr.id}')" title="Delete parameter">&times;</button>
              </div>

              ${attr.type === 'dropdown' ? `
                <div style="font-size:11.5px;font-weight:600;color:var(--ios-text-secondary);margin-top:6px;">Options / Parameters:</div>
                <div class="options-tag-cloud">
                  ${(attr.options || []).map((opt, oIdx) => `
                    <span class="option-removable-tag">
                      ${opt}
                      <button type="button" class="btn-tag-remove" onclick="window.removeOptionAction('${activeEditingItemId}', '${attr.id}', ${oIdx})">&times;</button>
                    </span>
                  `).join("")}
                </div>

                <div style="display:flex;gap:6px;margin-top:8px;">
                  <input type="text" id="addOptInput_${attr.id}" class="ios-input" placeholder="New option" style="padding:6px 10px;font-size:12px;">
                  <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.addOptionAction('${activeEditingItemId}', '${attr.id}')">Add</button>
                </div>
              ` : ''}
            </div>
          `).join("")}
        </div>
      `;

      const btnCreate = document.getElementById("btnCreateAttr");
      if (btnCreate) {
        btnCreate.addEventListener("click", async () => {
          const name = document.getElementById("newAttrNameInput").value.trim();
          const type = document.getElementById("newAttrTypeInput").value;
          const optsRaw = document.getElementById("newAttrInitialOptions").value.trim();

          if (!name) {
            alert("Parameter name is required.");
            return;
          }

          const options = optsRaw ? optsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

          try {
            await inventory.addAttributeToItem(activeEditingItemId, {
              name,
              type,
              required: true,
              options
            });
            renderSchemaModalContent();
            renderCurrentView();
          } catch (err) {
            alert("Error: " + err.message);
          }
        });
      }
    }

    renderSchemaModalContent();
    openModal();
  };

  window.deleteAttributeAction = async (itemId, attrId) => {
    if (!confirm("Remove this parameter from the item?")) return;
    try {
      await inventory.removeAttributeFromItem(itemId, attrId);
      window.openSchemaModal(itemId);
      renderCurrentView();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  window.removeOptionAction = async (itemId, attrId, oIdx) => {
    try {
      await inventory.removeOptionFromAttribute(itemId, attrId, oIdx);
      window.openSchemaModal(itemId);
      renderCurrentView();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  window.addOptionAction = async (itemId, attrId) => {
    const input = document.getElementById(`addOptInput_${attrId}`);
    if (!input || !input.value.trim()) return;
    try {
      await inventory.addOptionToAttribute(itemId, attrId, input.value.trim());
      window.openSchemaModal(itemId);
      renderCurrentView();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  window.deleteItemAction = async (itemId) => {
    const item = inventory.getItemById(itemId);
    if (!item) return;
    if (!confirm(`Are you sure you want to delete "${item.name}" from inventory?`)) return;
    try {
      await inventory.deleteItem(itemId);
      renderCurrentView();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  // ==========================================================================
  // TAB 3: USAGE HISTORY & OPERATIVE LOGBOOK (ALL USERS)
  // ==========================================================================
  function renderLogbookView(container) {
    const db = getDb();
    const specialists = db?.specialists || [];
    let currentSubView = "logs"; // "logs" or "patients"
    let selectedDate = "";
    let selectedSpecialist = "all";
    let searchQ = "";
    let patientSearchQ = "";

    function renderView() {
      container.innerHTML = `
        <div class="ios-segmented-control" style="margin-bottom:14px;">
          <button type="button" class="segment-btn ${currentSubView === 'logs' ? 'active' : ''}" id="btnSubViewLogs">
            📋 Operative Shift Log
          </button>
          <button type="button" class="segment-btn ${currentSubView === 'patients' ? 'active' : ''}" id="btnSubViewPatients">
            👤 Patient Clinical Profiles
          </button>
        </div>

        <div id="subViewMainContent"></div>
      `;

      document.getElementById("btnSubViewLogs").addEventListener("click", () => {
        if (currentSubView !== "logs") {
          currentSubView = "logs";
          renderView();
        }
      });

      document.getElementById("btnSubViewPatients").addEventListener("click", () => {
        if (currentSubView !== "patients") {
          currentSubView = "patients";
          renderView();
        }
      });

      const mainContent = document.getElementById("subViewMainContent");
      if (currentSubView === "logs") {
        renderOperativeLogsSubView(mainContent);
      } else {
        renderPatientProfilesSubView(mainContent);
      }
    }

    function renderOperativeLogsSubView(subContainer) {
      subContainer.innerHTML = `
        <div class="ios-card" style="padding:12px 14px;margin-bottom:12px;">
          <div class="ios-section-header" style="margin-bottom:8px;">
            <span class="ios-section-title">Logbook Filter & Day Selector</span>
            <span id="logStatsSummary" class="stock-badge healthy">Loading...</span>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <div style="flex:1;">
              <label class="ios-label">Filter Day</label>
              <input type="date" id="logDateFilter" class="ios-input" value="${selectedDate}">
            </div>
            <div style="display:flex;align-items:flex-end;">
              <button type="button" id="btnClearDateFilter" class="btn-ctrl" style="height:42px;padding:0 12px;">All Days</button>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <div style="flex:1;">
              <label class="ios-label">Attending Specialist Care</label>
              <select id="logSpecialistFilter" class="ios-select">
                <option value="all">All Specialists</option>
                ${specialists.map(s => `<option value="${s.name}" ${selectedSpecialist === s.name ? 'selected' : ''}>${s.name}</option>`).join("")}
              </select>
            </div>
          </div>

          <div>
            <input type="text" id="logSearchFilter" class="ios-input" placeholder="🔍 Search patient name, ID, procedure, or item..." value="${searchQ}">
          </div>

          <div style="display:flex;gap:8px;margin-top:10px;">
            <button type="button" id="btnExportCsv" class="ios-btn ios-btn-secondary ios-btn-sm" style="flex:1;">
              📥 Export CSV
            </button>
            <button type="button" id="btnPrintLog" class="ios-btn ios-btn-secondary ios-btn-sm" style="flex:1;">
              🖨️ Print Summary
            </button>
          </div>
        </div>

        <div id="logbookEntriesList"></div>
      `;

      function renderEntries() {
        const logs = inventory.getUsageLogs({
          date: selectedDate,
          specialist: selectedSpecialist,
          search: searchQ
        });

        const listContainer = document.getElementById("logbookEntriesList");
        const statsBadge = document.getElementById("logStatsSummary");

        if (statsBadge) {
          statsBadge.textContent = `${logs.length} Surgeries Logged`;
        }

        if (!listContainer) return;

        if (logs.length === 0) {
          listContainer.innerHTML = `
            <div style="text-align:center;padding:40px 10px;color:var(--ios-text-secondary);" class="ios-card">
              <svg style="width:36px;height:36px;margin:0 auto 8px auto;opacity:0.4;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <div>No operative logs found matching the filter criteria.</div>
            </div>
          `;
          return;
        }

        listContainer.innerHTML = logs.map(log => {
          const timeFormatted = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const itemsRendered = (log.items || []).map(it => {
            const paramsList = Object.entries(it.selectedAttributes || {}).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(" • ");
            return `
              <div class="log-item-bullet">
                🔹 <strong>${it.quantity}x ${it.itemName}</strong>
                ${paramsList ? `<div style="color:var(--ios-text-secondary);font-size:11.5px;padding-left:16px;">${paramsList}</div>` : ''}
                ${it.lotNumber ? `<div style="color:var(--ios-text-tertiary);font-size:10.5px;padding-left:16px;">Batch/Lot: ${it.lotNumber}</div>` : ''}
              </div>
            `;
          }).join("");

          return `
            <div class="surgical-log-entry">
              <div class="log-date-header">
                <span class="log-date-badge">📅 ${log.date} at ${timeFormatted}</span>
                <span style="font-size:11.5px;color:var(--ios-text-secondary);font-weight:600;">Dr. ${log.loggedBy?.fullName || log.loggedBy?.username}</span>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <div class="patient-highlight" style="margin-bottom:0;">👤 ${log.patientName} ${log.patientAge ? `(${log.patientAge}y)` : ''}</div>
                ${log.patientId ? `<span style="background:rgba(0,122,255,0.12);color:var(--ios-blue);border-radius:10px;padding:2px 7px;font-size:10.5px;font-weight:700;font-family:var(--font-mono);">${log.patientId}</span>` : ''}
              </div>

              <div class="procedure-title">🏥 ${log.procedureName || 'Neurosurgery Operation'}</div>

              <div style="display:flex;gap:12px;font-size:12px;color:var(--ios-text-secondary);margin-bottom:8px;">
                <span><strong>Specialist:</strong> ${log.specialistCare}</span>
                <span><strong>Location:</strong> ${log.bedNumber || 'OT'}</span>
              </div>

              <div class="log-items-list">
                <div style="font-size:11.5px;font-weight:700;color:var(--ios-blue);margin-bottom:4px;text-transform:uppercase;">Consumed Storage Items</div>
                ${itemsRendered}
              </div>

              ${log.notes ? `
                <div style="margin-top:8px;font-size:12px;color:var(--ios-text-secondary);font-style:italic;background:var(--ios-card);padding:6px 8px;border-radius:6px;border-left:2px solid var(--ios-blue);">
                  "${log.notes}"
                </div>
              ` : ''}
            </div>
          `;
        }).join("");
      }

      document.getElementById("logDateFilter").addEventListener("change", (e) => {
        selectedDate = e.target.value;
        renderEntries();
      });

      document.getElementById("btnClearDateFilter").addEventListener("click", () => {
        document.getElementById("logDateFilter").value = "";
        selectedDate = "";
        renderEntries();
      });

      document.getElementById("logSpecialistFilter").addEventListener("change", (e) => {
        selectedSpecialist = e.target.value;
        renderEntries();
      });

      document.getElementById("logSearchFilter").addEventListener("input", (e) => {
        searchQ = e.target.value;
        renderEntries();
      });

      document.getElementById("btnExportCsv").addEventListener("click", () => {
        const logs = inventory.getUsageLogs({ date: selectedDate, specialist: selectedSpecialist, search: searchQ });
        exportLogsToCsv(logs);
      });

      document.getElementById("btnPrintLog").addEventListener("click", () => window.print());

      renderEntries();
    }

    function renderPatientProfilesSubView(subContainer) {
      const patients = inventory.getAllPatients(patientSearchQ);

      subContainer.innerHTML = `
        <div class="ios-card" style="padding:12px 14px;margin-bottom:12px;">
          <div class="ios-section-header" style="margin-bottom:8px;">
            <span class="ios-section-title">Patient Records Directory</span>
            <span class="stock-badge healthy" id="patientEnrolledCount">${patients.length} Enrolled</span>
          </div>

          <div>
            <input type="text" id="patientSearchFilter" class="ios-input" placeholder="🔍 Search patient by Name, ID (PID-xxxx), or procedure..." value="${patientSearchQ}">
          </div>
        </div>

        <div id="patientProfilesList">
          ${renderPatientCards(patients)}
        </div>
      `;

      document.getElementById("patientSearchFilter").addEventListener("input", (e) => {
        patientSearchQ = e.target.value;
        const filtered = inventory.getAllPatients(patientSearchQ);
        const countBadge = document.getElementById("patientEnrolledCount");
        if (countBadge) countBadge.textContent = `${filtered.length} Enrolled`;
        document.getElementById("patientProfilesList").innerHTML = renderPatientCards(filtered);
        attachPatientAccordionListeners();
      });

      attachPatientAccordionListeners();
    }

    function renderPatientCards(patients) {
      if (patients.length === 0) {
        return `
          <div style="text-align:center;padding:40px 10px;color:var(--ios-text-secondary);" class="ios-card">
            <svg style="width:36px;height:36px;margin:0 auto 8px auto;opacity:0.4;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            <div style="font-weight:600;margin-bottom:4px;">No patient records found</div>
            <div style="font-size:12px;">When surgeries are logged, patients are enrolled with unique clinical IDs.</div>
          </div>
        `;
      }

      return patients.map(patient => {
        const ops = patient.operations || [];
        const opCount = ops.length;

        return `
          <div class="ios-card patient-record-card" style="margin-bottom:12px;padding:14px;" id="patientCard_${patient.id}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <h4 style="margin:0;font-size:16px;font-weight:700;color:var(--ios-text-primary);">${patient.name}</h4>
                  <span style="background:rgba(0,122,255,0.12);color:var(--ios-blue);border-radius:12px;padding:2px 8px;font-size:11px;font-weight:700;font-family:var(--font-mono);letter-spacing:0.5px;">
                    ${patient.id}
                  </span>
                </div>
                <div style="font-size:12px;color:var(--ios-text-secondary);margin-top:4px;">
                  <span>👤 ${patient.gender || 'Not specified'}</span>
                  ${patient.lastAge ? ` • <span>Age: <strong>${patient.lastAge}y</strong></span>` : ''}
                  ${patient.lastDate ? ` • <span>Latest Surgery: <strong>${patient.lastDate}</strong></span>` : ''}
                </div>
              </div>
              <span class="stock-badge ${opCount > 0 ? 'healthy' : 'secondary'}">
                ${opCount} Surgery${opCount === 1 ? '' : 'ies'}
              </span>
            </div>

            <!-- Quick Clinical Tags -->
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;font-size:11.5px;">
              ${patient.lastSpecialist ? `<span style="background:var(--ios-bg-tertiary);padding:3px 8px;border-radius:6px;color:var(--ios-text-secondary);">👨‍⚕️ ${patient.lastSpecialist}</span>` : ''}
              ${patient.lastProcedure ? `<span style="background:var(--ios-bg-tertiary);padding:3px 8px;border-radius:6px;color:var(--ios-text-secondary);">🏥 ${patient.lastProcedure}</span>` : ''}
              ${patient.lastBed ? `<span style="background:var(--ios-bg-tertiary);padding:3px 8px;border-radius:6px;color:var(--ios-text-secondary);">🛏️ ${patient.lastBed}</span>` : ''}
            </div>

            <!-- Collapsible Accordion Button (NOT EXPANDED BY DEFAULT!) -->
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm btn-toggle-patient-ops" data-patient-id="${patient.id}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:600;">
                <span class="accordion-arrow">▶</span> <span class="accordion-label">View Operations History (${opCount})</span>
              </button>
              <button type="button" class="ios-btn ios-btn-primary ios-btn-sm" onclick="window.startSurgeryForPatient('${patient.id}')" style="padding:0 12px;font-size:12px;" title="Record new surgery for this patient">
                + Add Op
              </button>
            </div>

            <!-- Collapsed Timeline Container (Hidden by default!) -->
            <div id="patientOpsTimeline_${patient.id}" style="display:none;margin-top:12px;border-top:1px solid var(--ios-separator);padding-top:12px;">
              ${renderPatientOpsTimeline(ops)}
            </div>
          </div>
        `;
      }).join("");
    }

    function renderPatientOpsTimeline(ops) {
      if (!ops || ops.length === 0) {
        return `<div style="font-size:12px;color:var(--ios-text-secondary);font-style:italic;text-align:center;padding:10px;">No surgery logs registered yet for this patient profile.</div>`;
      }

      return ops.map((op, idx) => {
        const itemsRendered = (op.items || []).map(it => {
          const paramsList = Object.entries(it.selectedAttributes || {}).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(" • ");
          return `
            <div style="font-size:11.5px;margin-top:3px;padding-left:8px;border-left:2px solid var(--ios-blue);">
              🔹 <strong>${it.quantity}x ${it.itemName}</strong>
              ${paramsList ? `<div style="color:var(--ios-text-secondary);font-size:11px;">${paramsList}</div>` : ''}
              ${it.lotNumber ? `<div style="color:var(--ios-text-tertiary);font-size:10px;font-family:var(--font-mono);">Lot: ${it.lotNumber}</div>` : ''}
            </div>
          `;
        }).join("");

        return `
          <div style="background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:10px;padding:10px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:12px;font-weight:700;color:var(--ios-blue);">📅 Op #${idx + 1}: ${op.date}</span>
              <span style="font-size:11px;color:var(--ios-text-secondary);font-weight:600;">Age: <strong>${op.patientAge || 'N/A'}y</strong></span>
            </div>

            <div style="font-size:13px;font-weight:700;color:var(--ios-text-primary);margin-bottom:4px;">
              🏥 ${op.procedureName || 'Neurosurgery Operation'}
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--ios-text-secondary);margin-bottom:6px;">
              <span>👨‍⚕️ ${op.specialistCare}</span>
              ${op.bedNumber ? ` • <span>🛏️ ${op.bedNumber}</span>` : ''}
              • <span>By: ${op.loggedBy?.fullName || op.loggedBy?.username}</span>
            </div>

            <div style="margin-top:6px;">
              <div style="font-size:11px;font-weight:700;color:var(--ios-text-secondary);text-transform:uppercase;margin-bottom:2px;">Consumed Storage Items:</div>
              ${itemsRendered}
            </div>

            ${op.notes ? `
              <div style="margin-top:6px;font-size:11.5px;color:var(--ios-text-secondary);font-style:italic;background:var(--ios-card);padding:4px 8px;border-radius:6px;">
                "${op.notes}"
              </div>
            ` : ''}
          </div>
        `;
      }).join("");
    }

    function attachPatientAccordionListeners() {
      document.querySelectorAll(".btn-toggle-patient-ops").forEach(btn => {
        btn.addEventListener("click", () => {
          const patientId = btn.dataset.patientId;
          const timeline = document.getElementById(`patientOpsTimeline_${patientId}`);
          const arrow = btn.querySelector(".accordion-arrow");
          const label = btn.querySelector(".accordion-label");
          if (!timeline) return;

          const isCurrentlyHidden = timeline.style.display === "none";
          if (isCurrentlyHidden) {
            timeline.style.display = "block";
            if (arrow) arrow.textContent = "▼";
            if (label) label.textContent = "Hide Operations History";
            btn.classList.add("ios-btn-active");
          } else {
            timeline.style.display = "none";
            if (arrow) arrow.textContent = "▶";
            const patient = inventory.getPatientById(patientId);
            const count = patient?.operationsCount || 0;
            if (label) label.textContent = `View Operations History (${count})`;
            btn.classList.remove("ios-btn-active");
          }
        });
      });
    }

    renderView();
  }

  window.startSurgeryForPatient = (patientId) => {
    const patient = inventory.getPatientById(patientId);
    if (!patient) return;
    switchTab("surgery");
    setTimeout(() => {
      if (window.linkAndLockPatient) {
        window.linkAndLockPatient(patient);
      }
    }, 120);
  };

  function exportLogsToCsv(logs) {
    if (!logs || logs.length === 0) {
      alert("No logs to export.");
      return;
    }

    const headers = ["Log ID", "Date", "Timestamp", "Patient Name", "Age", "Specialist", "Bed", "Procedure", "Logged By", "Consumed Items", "Notes"];
    const rows = logs.map(l => {
      const itemsStr = (l.items || []).map(i => `${i.quantity}x ${i.itemName}`).join("; ");
      return [
        l.id,
        l.date,
        l.timestamp,
        `"${(l.patientName || '').replace(/"/g, '""')}"`,
        l.patientAge || '',
        `"${(l.specialistCare || '').replace(/"/g, '""')}"`,
        `"${(l.bedNumber || '').replace(/"/g, '""')}"`,
        `"${(l.procedureName || '').replace(/"/g, '""')}"`,
        `"${(l.loggedBy?.fullName || '').replace(/"/g, '""')}"`,
        `"${itemsStr.replace(/"/g, '""')}"`,
        `"${(l.notes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `NeuroWare_Surgical_Logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ==========================================================================
  // TAB 4: USER MANAGEMENT, APPROVALS & OWNER EDIT PERMISSIONS
  // ==========================================================================
  function renderUserManagementView(container) {
    const db = getDb();
    const users = db?.users || [];
    const pendingUsers = users.filter(u => u.status === "pending");
    const activeUsers = users.filter(u => u.status !== "pending");

    container.innerHTML = `
      <div class="ios-card" style="border:1.5px solid ${pendingUsers.length > 0 ? 'var(--ios-orange)' : 'var(--ios-card-border)'};">
        <div class="ios-section-header">
          <span class="ios-section-title">Sign-Up Requests (${pendingUsers.length})</span>
          ${pendingUsers.length > 0 ? `<span class="stock-badge low_stock">Pending Approval</span>` : `<span class="stock-badge healthy">All Reviewed</span>`}
        </div>

        ${pendingUsers.length === 0 ? `
          <div style="color:var(--ios-text-secondary);font-size:12.5px;padding:8px 0;">No pending registrations.</div>
        ` : `
          ${pendingUsers.map(u => `
            <div style="background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;">
              <div>
                <strong style="font-size:14.5px;">${u.fullName}</strong>
                <div style="font-size:12px;color:var(--ios-blue);">@${u.username} • Phone: ${u.phone || 'N/A'}</div>
                <div style="font-size:11px;color:var(--ios-text-tertiary);margin-top:2px;">Requested on: ${new Date(u.createdAt).toLocaleDateString()}</div>
              </div>

              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <button type="button" class="ios-btn ios-btn-success ios-btn-sm" onclick="window.openApproveUserModal('${u.id}')">
                  ✓ Approve Access & Set Device Lock
                </button>
                <button type="button" class="ios-btn ios-btn-danger ios-btn-sm" onclick="window.rejectUserAction('${u.id}')">
                  ✕ Reject
                </button>
              </div>
            </div>
          `).join("")}
        `}
      </div>

      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">Active User Directory & Device Locks</span>
          <span style="font-size:11.5px;color:var(--ios-text-secondary);">${activeUsers.length} Users</span>
        </div>

        ${activeUsers.map(u => {
          const registeredDevs = u.registeredDevices || [];
          const devLimitTxt = u.deviceLimit === 'unlimited' ? 'Unlimited' : `${registeredDevs.length} / ${u.deviceLimit} Devices`;

          return `
            <div class="user-entry-card">
              <div class="user-header-line">
                <div>
                  <strong style="font-size:14px;">${u.fullName}</strong>
                  <span class="role-badge ${u.role.toLowerCase()}" style="margin-left:6px;">${u.role}</span>
                </div>
                <span class="device-lock-badge">🔒 ${devLimitTxt}</span>
              </div>

              <div style="font-size:12px;color:var(--ios-text-secondary);margin-bottom:6px;">
                @${u.username} • Phone: ${u.phone || 'N/A'}
              </div>

              <div class="device-list-box">
                <div style="font-weight:600;margin-bottom:3px;color:var(--ios-text-primary);">Bound Devices:</div>
                ${registeredDevs.length === 0 ? `
                  <span style="color:var(--ios-text-tertiary);">No device bound yet (Binds on next login).</span>
                ` : `
                  ${registeredDevs.map(d => `
                    <div style="margin-bottom:2px;">• <strong>${d.name}</strong> <span style="color:var(--ios-text-tertiary);font-size:10.5px;">(Active: ${new Date(d.lastActive || d.registeredAt).toLocaleDateString()})</span></div>
                  `).join("")}
                `}
              </div>

              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openEditUserModal('${u.id}')">
                  ✏️ Edit Profile & Limits
                </button>
                <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.resetUserDevicesAction('${u.id}')">
                  Reset Device Lock
                </button>
                ${u.role !== 'OWNER' ? `
                  <button type="button" class="ios-btn ios-btn-danger ios-btn-sm" onclick="window.deleteUserAction('${u.id}')" style="margin-left:auto;">
                    Delete
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // User Edit Modal (Owner can also edit username and full name)
  window.openEditUserModal = (userId) => {
    const db = getDb();
    const user = db?.users?.find(u => u.id === userId);
    if (!user) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Edit User: ${user.fullName}`;

    body.innerHTML = `
      <form id="editUserForm">
        <!-- Editable Full Name & Username for Owner & Admins -->
        <div class="ios-input-group">
          <label class="ios-label">Doctor / Staff Full Name *</label>
          <input type="text" id="editUserFullName" class="ios-input" value="${user.fullName}" required>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">User Name (@username) *</label>
          <input type="text" id="editUserUsername" class="ios-input" value="${user.username}" required>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Phone Number</label>
          <input type="text" id="editUserPhone" class="ios-input" value="${user.phone || ''}">
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Account Role</label>
          <select id="editUserRole" class="ios-select">
            <option value="REGULAR" ${user.role === 'REGULAR' ? 'selected' : ''}>REGULAR (Doctor / Nurse - Usage reporting only)</option>
            <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>ADMIN (Storage Manager & Editor)</option>
            ${auth.isOwner() ? `<option value="OWNER" ${user.role === 'OWNER' ? 'selected' : ''}>OWNER (Chief Super-Administrator)</option>` : ''}
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Hardware Device Lock Limit</label>
          <select id="editUserDeviceLimit" class="ios-select">
            <option value="1" ${user.deviceLimit == 1 ? 'selected' : ''}>1 Device (Single Device Lock)</option>
            <option value="2" ${user.deviceLimit == 2 ? 'selected' : ''}>2 Devices (e.g. Phone + OT Tablet)</option>
            <option value="3" ${user.deviceLimit == 3 ? 'selected' : ''}>3 Devices</option>
            <option value="unlimited" ${user.deviceLimit === 'unlimited' ? 'selected' : ''}>Unlimited Devices</option>
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Reset Password (Optional)</label>
          <input type="text" id="editUserNewPassword" class="ios-input" placeholder="Leave blank to keep unchanged">
        </div>

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:12px;">Save User Profile</button>
      </form>
    `;

    document.getElementById("editUserForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const newFullName = document.getElementById("editUserFullName").value.trim();
      const newUsername = document.getElementById("editUserUsername").value.trim();
      const newPhone = document.getElementById("editUserPhone").value.trim();
      const newRole = document.getElementById("editUserRole").value;
      const newLimit = document.getElementById("editUserDeviceLimit").value;
      const newPass = document.getElementById("editUserNewPassword").value.trim();

      const updates = {
        fullName: newFullName,
        username: newUsername,
        phone: newPhone,
        role: newRole,
        deviceLimit: newLimit
      };
      if (newPass) updates.passwordPlain = newPass;

      try {
        await auth.updateUserAccess(userId, updates);
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Failed to update user: " + err.message);
      }
    });

    openModal();
  };

  window.openApproveUserModal = (userId) => {
    const db = getDb();
    const user = db?.users?.find(u => u.id === userId);
    if (!user) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Approve Access: ${user.fullName}`;

    body.innerHTML = `
      <form id="approveUserForm">
        <div class="ios-input-group">
          <label class="ios-label">Assigned Role</label>
          <select id="approveRoleSelect" class="ios-select">
            <option value="REGULAR" selected>REGULAR (Usage reporting only)</option>
            <option value="ADMIN">ADMIN (Inventory Manager & Editor)</option>
            ${auth.isOwner() ? '<option value="OWNER">OWNER</option>' : ''}
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Device Lock Policy</label>
          <select id="approveDeviceSelect" class="ios-select">
            <option value="1" selected>Single Device (Locked to 1 device)</option>
            <option value="2">2 Devices</option>
            <option value="3">3 Devices</option>
            <option value="unlimited">Unlimited Devices</option>
          </select>
        </div>

        <button type="submit" class="ios-btn ios-btn-success" style="margin-top:12px;">Confirm & Activate User</button>
      </form>
    `;

    document.getElementById("approveUserForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await auth.approveUser(userId, document.getElementById("approveRoleSelect").value, document.getElementById("approveDeviceSelect").value);
        closeModal();
        renderCurrentView();
        notifications.updateBadges();
      } catch (err) {
        alert("Approval failed: " + err.message);
      }
    });

    openModal();
  };

  window.rejectUserAction = async (userId) => {
    if (!confirm("Reject this registration request?")) return;
    try {
      await auth.rejectUser(userId);
      renderCurrentView();
      notifications.updateBadges();
    } catch (err) {
      alert("Rejection failed: " + err.message);
    }
  };

  window.resetUserDevicesAction = async (userId) => {
    if (!confirm("Reset all registered device bindings for this user? They can bind a new device on next login.")) return;
    try {
      await auth.resetUserDevices(userId);
      alert("Device locks reset successfully.");
      renderCurrentView();
    } catch (err) {
      alert("Reset failed: " + err.message);
    }
  };

  window.deleteUserAction = async (userId) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await auth.deleteUser(userId);
      renderCurrentView();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  // ==========================================================================
  // TAB 5: NOTIFICATIONS & ALERTS VIEW
  // ==========================================================================
  function renderAlertsView(container) {
    let activeFilter = "all";

    function renderNotifItems() {
      const notifs = notifications.getNotifications(activeFilter);
      const listEl = document.getElementById("alertsFeedList");
      if (!listEl) return;

      if (notifs.length === 0) {
        listEl.innerHTML = `<div style="text-align:center;padding:40px 10px;color:var(--ios-text-secondary);">No alerts in this category.</div>`;
        return;
      }

      listEl.innerHTML = notifs.map(n => {
        let iconHtml = '📢';
        if (n.type === 'refill') iconHtml = '📦';
        else if (n.type === 'low_stock') iconHtml = '⚠️';
        else if (n.type === 'out_of_stock') iconHtml = '🚨';
        else if (n.type === 'signup_request') iconHtml = '👤';

        return `
          <div class="notif-item ${n.type} ${n.isRead ? '' : 'unread'}" onclick="window.markNotifRead('${n.id}')">
            <div class="notif-icon-circle">${iconHtml}</div>
            <div class="notif-content">
              <div class="notif-title">${n.title}</div>
              <div class="notif-desc">${n.message}</div>
              <div class="notif-time">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
          </div>
        `;
      }).join("");
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="ios-section-title">Notification Center</span>
        <button id="btnMarkAllRead" class="btn-ctrl">Mark All as Read</button>
      </div>

      <div class="ios-segmented-control" id="notifCategorySegments">
        <button class="segment-btn active" data-filter="all">All</button>
        <button class="segment-btn" data-filter="stock">Stock Alarms</button>
        <button class="segment-btn" data-filter="refill">Refill Feeds</button>
        ${auth.isAdmin() ? `<button class="segment-btn" data-filter="requests">Requests</button>` : ''}
      </div>

      <div id="alertsFeedList"></div>
    `;

    document.querySelectorAll("#notifCategorySegments .segment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#notifCategorySegments .segment-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        renderNotifItems();
      });
    });

    document.getElementById("btnMarkAllRead").addEventListener("click", async () => {
      await notifications.markAllAsRead();
      renderNotifItems();
    });

    renderNotifItems();
  }

  window.markNotifRead = async (id) => {
    await notifications.markAsRead(id);
    const item = document.querySelector(`.notif-item[onclick*="${id}"]`);
    if (item) item.classList.remove("unread");
  };

  // ==========================================================================
  // TAB 6: SETTINGS, CLOUD SYNC & DAY/NIGHT PREFERENCES
  // ==========================================================================
  function renderSettingsView(container) {
    const user = auth.getCurrentUser();
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const currentDevice = storage.initDeviceFingerprint();

    container.innerHTML = `
      <div class="ios-card" style="display:flex;align-items:center;gap:14px;">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--ios-blue),var(--ios-purple));display:flex;align-items:center;justify-content:center;color:#FFF;font-size:22px;font-weight:700;">
          ${(user?.fullName || 'U').charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;">${user?.fullName}</div>
          <div style="font-size:12.5px;color:var(--ios-text-secondary);">@${user?.username} • ${user?.phone || 'No phone'}</div>
          <span class="role-badge ${user?.role.toLowerCase()}" style="margin-top:4px;display:inline-block;">${user?.role}</span>
        </div>
      </div>

      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">App Preferences</span>
        </div>

        <div class="ios-switch-container">
          <div>
            <div style="font-weight:600;">Day / Night Theme</div>
            <div style="font-size:12px;color:var(--ios-text-secondary);">Toggle iOS Light and Dark mode</div>
          </div>
          <select id="settingsThemeSelect" class="ios-select" style="width:130px;padding:6px 10px;">
            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Dark (OLED)</option>
            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Light (iOS)</option>
          </select>
        </div>

        <div class="ios-switch-container" style="border-top:0.5px solid var(--ios-separator);">
          <div>
            <div style="font-weight:600;">Audio Chimes</div>
            <div style="font-size:12px;color:var(--ios-text-secondary);">Play subtle Apple-style audio on alerts</div>
          </div>
          <label class="ios-switch">
            <input type="checkbox" id="settingsSoundToggle" ${notifications.soundEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="ios-switch-container" style="border-top:0.5px solid var(--ios-separator);">
          <div>
            <div style="font-weight:600;">Desktop Phone Frame</div>
            <div style="font-size:12px;color:var(--ios-text-secondary);">Toggle realistic iPhone chassis on desktop</div>
          </div>
          <button type="button" class="btn-ctrl" onclick="window.toggleDesktopFullscreen()">Toggle View</button>
        </div>
      </div>

      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">This Device Status</span>
          <span class="device-lock-badge">Active</span>
        </div>
        <div style="font-size:12.5px;color:var(--ios-text-secondary);">
          <div><strong>Hardware:</strong> ${currentDevice.name}</div>
          <div><strong>Screen:</strong> ${currentDevice.screen} (${currentDevice.platform})</div>
          <div><strong>Fingerprint ID:</strong> <span style="font-family:var(--font-mono);font-size:11px;">${currentDevice.id}</span></div>
          <div><strong>Device Lock Limit:</strong> ${user?.deviceLimit === 'unlimited' ? 'Unlimited' : user?.deviceLimit + ' Device(s)'}</div>
        </div>
      </div>

      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">GitHub Cloud Synchronization</span>
          <span class="sync-status-indicator">
            <span class="sync-dot ${storage.syncStatus}"></span>
            <span class="sync-status-text">${storage.syncStatus}</span>
          </span>
        </div>

        <div style="font-size:12.5px;color:var(--ios-text-secondary);margin-bottom:12px;">
          <div><strong>Repository:</strong> ${storage.config.user}/${storage.config.repo}</div>
          <div><strong>Database Path:</strong> ${storage.config.path}</div>
          <div><strong>Last Cloud Sync:</strong> <span id="settingsLastSync">${storage.lastSyncTime ? new Date(storage.lastSyncTime).toLocaleTimeString() : 'Recently'}</span></div>
        </div>

        <button type="button" id="btnForceSyncCloud" class="ios-btn ios-btn-secondary ios-btn-sm" style="width:100%;">
          🔄 Force Cloud Sync Now
        </button>
      </div>

      <!-- Push Notifications Card -->
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">Push Notifications</span>
          <span class="stock-badge ${notifications.hasPermission() ? 'healthy' : 'low'}" id="settingsPushStatusBadge">
            ${notifications.hasPermission() ? '🟢 Active (OS Push)' : '⚠️ Needs Permission'}
          </span>
        </div>

        <div style="font-size:12.5px;color:var(--ios-text-secondary);margin-bottom:12px;line-height:1.45;">
          Get native OS push notifications for shifts, stock refills, and low-stock alarms even when NeuroWare is closed or running in the background.
        </div>

        <div style="display:flex;gap:8px;">
          <button type="button" id="btnEnablePushPerm" class="ios-btn ios-btn-primary ios-btn-sm" style="flex:1.2;">
            🔔 Enable Push
          </button>
          <button type="button" id="btnTestPushAlert" class="ios-btn ios-btn-secondary ios-btn-sm" style="flex:1;">
            🧪 Test Notification
          </button>
        </div>
      </div>

      <!-- PWA Installation & Mode Card -->
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">PWA & Display Mode</span>
          <span class="stock-badge ${(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? 'healthy' : 'secondary'}">
            ${(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? '📲 Installed App' : '🌐 Web Browser'}
          </span>
        </div>

        <div style="font-size:12.5px;color:var(--ios-text-secondary);margin-bottom:12px;line-height:1.4;">
          ${(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) 
            ? 'NeuroWare is currently running as an independent installed Progressive Web App (PWA).' 
            : 'NeuroWare is currently running in your web browser. You can install it on your home screen or continue using the browser.'}
        </div>

        <div style="display:flex;gap:8px;">
          <button type="button" id="btnSettingsInstallPwa" class="ios-btn ios-btn-primary ios-btn-sm" style="flex:1;">
            📲 Install PWA
          </button>
          <button type="button" id="btnSettingsToggleBanner" class="ios-btn ios-btn-secondary ios-btn-sm" style="flex:1;">
            Toggle Install Banner
          </button>
        </div>
      </div>

      <!-- About NeuroWare & Copyrights Card -->
      <div class="ios-card about-neuroware-card">
        <div class="ios-section-header">
          <span class="ios-section-title">About NeuroWare</span>
          <span class="stock-badge healthy" id="aboutUpdateBadge">v2.2.0</span>
        </div>

        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <img src="assets/icon.svg" style="width:52px;height:52px;border-radius:14px;box-shadow:0 6px 16px rgba(0,0,0,0.25);" alt="NW Icon">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--ios-text-primary);">NeuroWare™ Operating Room Suite</div>
            <div style="font-size:12px;color:var(--ios-text-secondary);">Neurosurgical Inventory, Implants & Shift Logs</div>
            <div style="font-size:11px;color:var(--ios-blue);font-weight:700;margin-top:2px;">Official Progressive Web App</div>
          </div>
        </div>

        <div class="about-info-list" style="font-size:12.5px;color:var(--ios-text-secondary);background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:12px;padding:12px;margin-bottom:14px;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;">
            <span><strong>Application Version:</strong></span>
            <span style="font-family:var(--font-mono);font-weight:700;color:var(--ios-text-primary);">v2.2.0</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span><strong>Update Released:</strong></span>
            <span style="color:var(--ios-text-primary);">October 11, 2026</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span><strong>Update Status:</strong></span>
            <span id="aboutUpdateStatusLabel" style="color:var(--ios-green);font-weight:700;">✓ Up to Date</span>
          </div>
        </div>

        <button type="button" id="btnCheckForUpdates" class="ios-btn ios-btn-secondary ios-btn-sm" style="width:100%;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span id="checkUpdateIcon">🔄</span> <span id="checkUpdateLabel">Check for Updates</span>
        </button>

        <!-- Copyright Acknowledgment for Dr. Mohammed Riyadh -->
        <div style="border-top:1px solid var(--ios-separator);padding-top:14px;text-align:center;">
          <div style="font-size:12px;color:var(--ios-text-secondary);margin-bottom:3px;">
            Programmed & Architected by
          </div>
          <div style="font-size:16px;font-weight:800;color:var(--ios-blue);letter-spacing:0.3px;">
            Dr. Mohammed Riyadh
          </div>
          <div style="font-size:11.5px;color:var(--ios-text-secondary);margin-top:2px;">
            Neurosurgeon & Medical Systems Programmer
          </div>
          <div style="font-size:11px;color:var(--ios-text-tertiary);margin-top:8px;">
            Copyright © 2026 Dr. Mohammed Riyadh. All Rights Reserved.
          </div>
        </div>
      </div>

      <div class="ios-card">
        <button type="button" id="btnLogoutApp" class="ios-btn ios-btn-danger">
          Sign Out of NeuroWare
        </button>
      </div>
    `;

    document.getElementById("settingsThemeSelect").addEventListener("change", (e) => toggleTheme(e.target.value));
    document.getElementById("settingsSoundToggle").addEventListener("change", (e) => notifications.soundEnabled = e.target.checked);

    document.getElementById("btnForceSyncCloud").addEventListener("click", async () => {
      const btn = document.getElementById("btnForceSyncCloud");
      btn.textContent = "Syncing...";
      btn.disabled = true;
      await storage.forceSync();
      btn.textContent = "✓ Synced!";
      setTimeout(() => {
        btn.textContent = "🔄 Force Cloud Sync Now";
        btn.disabled = false;
      }, 1500);
    });

    document.getElementById("btnEnablePushPerm")?.addEventListener("click", async () => {
      const granted = await notifications.requestPermission();
      renderSettingsView(container);
    });

    document.getElementById("btnTestPushAlert")?.addEventListener("click", async () => {
      await notifications.testPushNotification();
    });

    document.getElementById("btnSettingsInstallPwa")?.addEventListener("click", () => {
      triggerPwaInstallation();
    });

    document.getElementById("btnSettingsToggleBanner")?.addEventListener("click", () => {
      const isDismissed = localStorage.getItem("neuroware_pwa_dismissed") === "true";
      if (isDismissed) {
        localStorage.removeItem("neuroware_pwa_dismissed");
        showPwaBannerIfApplicable();
        alert("PWA installation banner restored!");
      } else {
        localStorage.setItem("neuroware_pwa_dismissed", "true");
        hidePwaBanner();
        alert("PWA installation banner hidden. Continuing with web browser option.");
      }
    });

    document.getElementById("btnCheckForUpdates")?.addEventListener("click", async () => {
      const btn = document.getElementById("btnCheckForUpdates");
      const icon = document.getElementById("checkUpdateIcon");
      const label = document.getElementById("checkUpdateLabel");
      const statusLabel = document.getElementById("aboutUpdateStatusLabel");

      btn.disabled = true;
      if (icon) icon.textContent = "⏳";
      if (label) label.textContent = "Checking for Updates...";

      try {
        let updateFound = false;

        // 1. Service Worker update check
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting || reg.installing) {
              updateFound = true;
            }
          }
        }

        // 2. Remote GitHub main commit check
        try {
          const res = await fetch(`https://api.github.com/repos/${storage.config.user}/${storage.config.repo}/commits/main`, {
            cache: "no-store"
          });
          if (res.ok) {
            const commitData = await res.json();
            const latestSha = commitData.sha ? commitData.sha.substring(0, 7) : "";
            const lastKnownSha = localStorage.getItem("neuroware_last_sha");
            if (lastKnownSha && latestSha && lastKnownSha !== latestSha) {
              updateFound = true;
            }
            if (latestSha) localStorage.setItem("neuroware_last_sha", latestSha);
          }
        } catch (e) {
          // Network check fallback
        }

        if (updateFound) {
          if (statusLabel) statusLabel.innerHTML = `<span style="color:var(--ios-orange);">🔄 Update Available!</span>`;
          if (icon) icon.textContent = "🚀";
          if (label) label.textContent = "Reload to Apply Update";
          btn.disabled = false;
          btn.onclick = () => window.location.reload();
          alert("A newer update of NeuroWare is available! Reloading page to apply...");
          window.location.reload();
        } else {
          if (statusLabel) statusLabel.innerHTML = `<span style="color:var(--ios-green);">✓ Up to Date (v2.2.0)</span>`;
          if (icon) icon.textContent = "✓";
          if (label) label.textContent = "Latest Version Installed";
          setTimeout(() => {
            btn.disabled = false;
            if (icon) icon.textContent = "🔄";
            if (label) label.textContent = "Check for Updates";
          }, 2500);
        }
      } catch (err) {
        btn.disabled = false;
        if (icon) icon.textContent = "🔄";
        if (label) label.textContent = "Check for Updates";
        alert("Could not complete update check: " + err.message);
      }
    });

    document.getElementById("btnLogoutApp").addEventListener("click", () => {
      auth.logout();
      checkAuthAndRender();
    });
  }

  // ==========================================================================
  // AUTHENTICATION MODAL SCREEN (CLEAN, NO DEMO PILLS)
  // ==========================================================================
  function renderAuthForms() {
    const authContainer = document.getElementById("authModalScreen");
    if (!authContainer) return;

    let isSignupMode = false;

    function renderForm() {
      authContainer.innerHTML = `
        <div class="ios-card" style="width:100%;max-width:380px;padding:26px;border-radius:28px;box-shadow:var(--ios-shadow-lg);">
          <div style="text-align:center;margin-bottom:22px;">
            <div style="width:62px;height:62px;margin:0 auto 12px auto;border-radius:18px;background:linear-gradient(135deg,var(--ios-blue),var(--ios-indigo));display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,122,255,0.45);">
              <img src="assets/icon.svg" style="width:46px;height:46px;border-radius:12px;" alt="NW Logo">
            </div>
            <h1 style="font-size:21px;font-weight:800;letter-spacing:-0.4px;">NeuroWare</h1>
            <p style="font-size:12.5px;color:var(--ios-text-secondary);margin-top:2px;">Neurosurgical Storage & Operative Inventory</p>
          </div>

          ${!isSignupMode ? `
            <form id="loginForm">
              <div class="ios-input-group">
                <label class="ios-label">Username</label>
                <input type="text" id="loginUsername" class="ios-input" placeholder="Enter username" required autocomplete="username">
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Password</label>
                <input type="password" id="loginPassword" class="ios-input" placeholder="••••••••" required autocomplete="current-password">
              </div>

              <button type="submit" id="btnLoginSubmit" class="ios-btn ios-btn-primary" style="margin-top:8px;">
                Sign In
              </button>

              <div style="text-align:center;margin-top:16px;">
                <button type="button" id="btnToggleAuthMode" style="background:none;border:none;color:var(--ios-blue);font-size:13px;font-weight:600;cursor:pointer;">
                  Don't have an account? Request Sign-Up
                </button>
              </div>
            </form>
          ` : `
            <form id="signupForm">
              <div class="ios-input-group">
                <label class="ios-label">Doctor / Staff Full Name *</label>
                <input type="text" id="signupFullName" class="ios-input" placeholder="e.g. Dr. Haidar" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Choose Username *</label>
                <input type="text" id="signupUsername" class="ios-input" placeholder="e.g. dr_haidar" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Password *</label>
                <input type="password" id="signupPassword" class="ios-input" placeholder="Create password" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Phone Number</label>
                <input type="text" id="signupPhone" class="ios-input" placeholder="+964...">
              </div>

              <div style="font-size:11.5px;color:var(--ios-text-secondary);margin-bottom:12px;background:var(--ios-card-inner);padding:8px;border-radius:8px;">
                ℹ️ Your request will be sent to the Owner and Admins. Once approved and device-locked, you will have access.
              </div>

              <button type="submit" id="btnSignupSubmit" class="ios-btn ios-btn-success">
                Submit Registration Request
              </button>

              <div style="text-align:center;margin-top:16px;">
                <button type="button" id="btnToggleAuthMode" style="background:none;border:none;color:var(--ios-blue);font-size:13px;font-weight:600;cursor:pointer;">
                  Already registered? Back to Sign In
                </button>
              </div>
          `}

          <!-- Dr. Mohammed Riyadh Copyright Acknowledgment -->
          <div class="auth-copyright-footer">
            <div style="font-weight:700;color:var(--ios-text-primary);">NeuroWare™ Operating Room Suite</div>
            <div style="margin-top:2px;">Developed & Programmed by <strong>Dr. Mohammed Riyadh</strong></div>
            <div style="font-size:10.5px;color:var(--ios-text-tertiary);margin-top:2px;">© 2026 Dr. Mohammed Riyadh. All Rights Reserved.</div>
          </div>
        </div>
      `;

      const toggleBtn = document.getElementById("btnToggleAuthMode");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          isSignupMode = !isSignupMode;
          renderForm();
        });
      }

      const loginForm = document.getElementById("loginForm");
      if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const u = document.getElementById("loginUsername").value;
          const p = document.getElementById("loginPassword").value;
          const btn = document.getElementById("btnLoginSubmit");
          btn.disabled = true;
          btn.textContent = "Authenticating...";

          try {
            await auth.login(u, p);
            checkAuthAndRender();
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = "Sign In";
          }
        });
      }

      const signupForm = document.getElementById("signupForm");
      if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = document.getElementById("btnSignupSubmit");
          btn.disabled = true;
          btn.textContent = "Submitting Request...";

          try {
            await auth.signup({
              fullName: document.getElementById("signupFullName").value,
              username: document.getElementById("signupUsername").value,
              password: document.getElementById("signupPassword").value,
              phone: document.getElementById("signupPhone").value
            });
            alert("Registration Submitted!\nYour account is pending review by the Storage Director (Admin/Owner).");
            isSignupMode = false;
            renderForm();
          } catch (err) {
            alert("Sign-up failed: " + err.message);
            btn.disabled = false;
            btn.textContent = "Submit Registration Request";
          }
        });
      }
    }

    renderForm();
  }

  // ==========================================================================
  // MODAL CONTROLS (IOS BOTTOM SHEET)
  // ==========================================================================
  function openModal() {
    const overlay = document.getElementById("universalModalOverlay");
    if (overlay) overlay.classList.add("active");
  }

  function closeModal() {
    const overlay = document.getElementById("universalModalOverlay");
    if (overlay) overlay.classList.remove("active");
  }

  document.getElementById("sheetModalCloseBtn")?.addEventListener("click", closeModal);
  document.getElementById("universalModalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "universalModalOverlay") closeModal();
  });

  document.getElementById("btnHeaderAlerts")?.addEventListener("click", () => switchTab("alerts"));
  document.getElementById("btnHeaderProfile")?.addEventListener("click", () => switchTab("settings"));

  window.toggleDesktopFullscreen = () => {
    const frame = document.getElementById("mainIphoneFrame");
    const bar = document.querySelector(".desktop-controls-bar");
    if (frame) frame.classList.toggle("fullscreen-mode");
    if (bar) bar.classList.toggle("expanded");
  };

  const desktopViewToggle = document.getElementById("btnToggleDesktopView");
  if (desktopViewToggle) {
    desktopViewToggle.addEventListener("click", window.toggleDesktopFullscreen);
  }

  // ==========================================================================
  // PWA INSTALLATION PROMPT & BANNER ENGINE
  // ==========================================================================
  window.deferredPwaPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.deferredPwaPrompt = e;
    showPwaBannerIfApplicable();
  });

  function showPwaBannerIfApplicable() {
    const banner = document.getElementById("pwaInstallBanner");
    if (!banner) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const isDismissed = localStorage.getItem("neuroware_pwa_dismissed") === "true";

    if (isStandalone || isDismissed) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "flex";
  }

  function hidePwaBanner() {
    const banner = document.getElementById("pwaInstallBanner");
    if (banner) banner.style.display = "none";
  }

  function triggerPwaInstallation() {
    if (window.deferredPwaPrompt) {
      window.deferredPwaPrompt.prompt();
      window.deferredPwaPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          hidePwaBanner();
        }
        window.deferredPwaPrompt = null;
      });
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const title = document.getElementById("sheetModalTitle");
      const body = document.getElementById("sheetModalBody");
      title.textContent = "Install NeuroWare";
      body.innerHTML = `
        <div style="text-align:center;padding:12px 6px 20px 6px;">
          <img src="assets/icon.svg" style="width:58px;height:58px;border-radius:14px;margin-bottom:12px;box-shadow:0 8px 20px rgba(0,0,0,0.25);" alt="NW Icon">
          <h3 style="margin:0 0 8px 0;font-size:17px;font-weight:800;color:var(--ios-text-primary);">Install as Progressive Web App</h3>
          <p style="font-size:13px;color:var(--ios-text-secondary);line-height:1.5;margin:0 0 16px 0;">
            ${isIOS 
              ? "To install NeuroWare on iOS:<br>1. Tap the Share button ⎋ in Safari.<br>2. Select 'Add to Home Screen' ⊞.<br>3. Tap 'Add' to launch as a standalone app!"
              : "To install NeuroWare on your device:<br>Open your browser menu (⋮ or ...) and select 'Install app' or 'Add to Home screen' for fast offline-ready neurosurgery shifts access."}
          </p>

          <button type="button" class="ios-btn ios-btn-primary" onclick="closeModal()">
            Understood
          </button>
        </div>
      `;
      openModal();
    }
  }

  window.triggerPwaInstallation = triggerPwaInstallation;
  window.showPwaBannerIfApplicable = showPwaBannerIfApplicable;
  window.hidePwaBanner = hidePwaBanner;

  document.getElementById("btnPwaInstallAction")?.addEventListener("click", triggerPwaInstallation);
  document.getElementById("btnPwaDismissAction")?.addEventListener("click", () => {
    localStorage.setItem("neuroware_pwa_dismissed", "true");
    hidePwaBanner();
  });

  // 6. Launch Application
  initTheme();
  checkAuthAndRender();
  showPwaBannerIfApplicable();
});

