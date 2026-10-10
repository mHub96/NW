/**
 * NeuroWare Main Application Orchestrator
 * High-Fidelity iOS UI Controller, Tab Routing, Surgical Portals & Dynamic Schema Builders
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

  // Expose to window for inline onclick handlers if needed
  window.NW = { storage, auth, inventory, notifications, getDb, saveDb };

  // 2. Global UI State
  let currentTab = "surgery";
  let surgicalCart = []; // Temporary tray during surgical reporting
  let activeEditingItemId = null;
  let activeUserActionId = null;

  // 3. Theme & Clock Management
  function initTheme() {
    const savedTheme = localStorage.getItem("neuroware_theme") || "dark"; // Defaulting to sleek dark OLED iOS
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
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    timeEl.textContent = `${hours}:${minutes}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 4. Sync Status Handler
  storage.onSyncStatusChange((status, detail, lastTime) => {
    const dots = document.querySelectorAll(".sync-dot");
    const texts = document.querySelectorAll(".sync-status-text");
    dots.forEach(dot => {
      dot.className = `sync-dot ${status}`;
    });
    texts.forEach(txt => {
      txt.textContent = detail || status;
    });

    const settingsSyncTime = document.getElementById("settingsLastSync");
    if (settingsSyncTime && lastTime) {
      settingsSyncTime.textContent = new Date(lastTime).toLocaleTimeString();
    }
  });

  // Listen for cloud sync events
  window.addEventListener("neuroware:data_synced", (e) => {
    dbData = e.detail;
    renderCurrentView();
    notifications.updateBadges();
  });

  // 5. Authentication UI Handlers
  function checkAuthAndRender() {
    const user = auth.getCurrentUser();
    const authScreen = document.getElementById("authModalScreen");
    const appHeader = document.querySelector(".ios-nav-header");
    const appTabBar = document.querySelector(".ios-tab-bar");

    if (!user) {
      // Show Auth Screen
      if (authScreen) authScreen.style.display = "flex";
      if (appHeader) appHeader.style.display = "none";
      if (appTabBar) appTabBar.style.display = "none";
      renderAuthForms();
    } else {
      // Hide Auth Screen
      if (authScreen) authScreen.style.display = "none";
      if (appHeader) appHeader.style.display = "flex";
      if (appTabBar) appTabBar.style.display = "flex";

      // Update Nav User Badge
      const userBadge = document.getElementById("navUserRoleBadge");
      if (userBadge) {
        userBadge.textContent = user.role;
        userBadge.className = `role-badge ${user.role.toLowerCase()}`;
      }

      // Configure Tab Bar based on User Role
      setupTabBarForRole(user.role);
      renderCurrentView();
      notifications.updateBadges();
    }
  }

  function setupTabBarForRole(role) {
    const tabContainer = document.querySelector(".ios-tab-bar");
    if (!tabContainer) return;

    if (role === window.NEURO_CONFIG.ROLES.REGULAR) {
      // Regular user: ONLY Surgery (Report), Catalog (Stock view), Logbook (History), Alerts, Settings
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
      // Admin / Owner: Surgery (Report), Inventory (Editor & Schema), History (Logbook), Users (Approvals/Device Locks), Alerts, Settings
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

    // Attach click listeners to tabs
    tabContainer.querySelectorAll(".tab-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
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
  // TAB 1: SURGICAL REPORTING PORTAL (REGULAR USERS & MANAGERS)
  // ==========================================================================
  function renderSurgeryPortal(container) {
    const db = getDb();
    const specialists = db?.specialists || [];
    const todayStr = new Date().toISOString().split("T")[0];

    // Pre-calculate items with dynamic attributes
    const items = inventory.getItems();

    container.innerHTML = `
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">1. Patient & Operation Details</span>
          <span style="font-size:11.5px;color:var(--ios-blue);font-weight:600;">Shift Log</span>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Patient Full Name *</label>
          <input type="text" id="surgPatientName" class="ios-input" placeholder="e.g. Haider Qasim (حيدر قاسم)" required>
        </div>

        <div style="display:flex;gap:10px;">
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Age</label>
            <input type="number" id="surgPatientAge" class="ios-input" placeholder="e.g. 52">
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

      <!-- Item Selection Card with Dynamic Attributes -->
      <div class="ios-card">
        <div class="ios-section-header">
          <span class="ios-section-title">2. Select Used Surgical Items</span>
          <span style="font-size:11.5px;color:var(--ios-text-secondary);">Dynamic Config</span>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Select Item from Storage *</label>
          <select id="surgItemSelect" class="ios-select">
            <option value="">-- Choose Item --</option>
            ${items.map(it => {
              const stockTxt = it.quantity <= 0 ? `[OUT OF STOCK - 0]` : `[Stock: ${it.quantity} ${it.unit}]`;
              const warnTag = it.quantity <= it.threshold ? `⚠️ ` : ``;
              return `<option value="${it.id}" ${it.quantity <= 0 ? 'disabled' : ''}>${warnTag}${it.name} ${stockTxt}</option>`;
            }).join("")}
          </select>
        </div>

        <!-- Dynamic Item Attributes Box (e.g. Shunt Pressure, Manufacturer, Type) -->
        <div id="dynamicAttributesSection" style="display:none;background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;text-transform:uppercase;">
            Item Specifications (Selected Parameters)
          </div>
          <div id="dynamicAttributesFormFields"></div>
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;">
          <div class="ios-input-group" style="flex:1;margin-bottom:0;">
            <label class="ios-label">Quantity Used</label>
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

      <!-- Surgical Tray (Items to be consumed) -->
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
          <textarea id="surgNotes" class="ios-textarea" placeholder="e.g. Good CSF flow observed, opening pressure measured 14 cmH2O. Hemostasis secured with FloSeal."></textarea>
        </div>

        <button type="button" id="btnSubmitOperation" class="ios-btn ios-btn-primary" style="margin-top:8px;">
          <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Record Surgical Usage & Update Storage
        </button>
      </div>
    `;

    // Attach dynamic attributes listener when item dropdown changes
    const itemSelect = document.getElementById("surgItemSelect");
    const dynamicSection = document.getElementById("dynamicAttributesSection");
    const dynamicFields = document.getElementById("dynamicAttributesFormFields");

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

      // Render custom dynamic dropdowns configured by Owner/Admin!
      dynamicSection.style.display = "block";
      dynamicFields.innerHTML = item.attributes.map(attr => {
        return `
          <div class="ios-input-group">
            <label class="ios-label">${attr.name} ${attr.required ? '*' : ''}</label>
            ${attr.type === 'dropdown' ? `
              <select class="ios-select dynamic-attr-input" data-attr-name="${attr.name}" ${attr.required ? 'required' : ''}>
                <option value="">-- Choose ${attr.name} --</option>
                ${(attr.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("")}
              </select>
            ` : `
              <input type="${attr.type === 'number' ? 'number' : 'text'}" class="ios-input dynamic-attr-input" data-attr-name="${attr.name}" placeholder="Enter ${attr.name}">
            `}
          </div>
        `;
      }).join("");
    });

    // Add to tray handler
    document.getElementById("btnAddToTray").addEventListener("click", () => {
      const selectedId = itemSelect.value;
      if (!selectedId) {
        alert("Please select an item from the storage catalog.");
        return;
      }

      const item = inventory.getItemById(selectedId);
      const qty = parseInt(document.getElementById("surgItemQty").value, 10) || 1;
      const lot = document.getElementById("surgItemLot").value.trim();

      if (qty <= 0) {
        alert("Quantity must be at least 1.");
        return;
      }

      // Check current available stock vs what's already in tray
      const alreadyInTray = surgicalCart.filter(x => x.itemId === selectedId).reduce((sum, x) => sum + x.quantity, 0);
      if (item.quantity < (alreadyInTray + qty)) {
        alert(`Insufficient stock! Only ${item.quantity} ${item.unit} available in storage.`);
        return;
      }

      // Gather dynamic attribute selections
      const dynamicInputs = document.querySelectorAll(".dynamic-attr-input");
      const selectedAttributes = {};
      let missingRequired = false;

      dynamicInputs.forEach(inp => {
        const attrName = inp.dataset.attrName;
        const val = inp.value.trim();
        if (inp.hasAttribute("required") && !val) {
          missingRequired = true;
        }
        if (val) {
          selectedAttributes[attrName] = val;
        }
      });

      if (missingRequired) {
        alert("Please select all required item specifications (e.g. Shunt Pressure Gauge, Manufacturer, Type).");
        return;
      }

      surgicalCart.push({
        itemId: item.id,
        itemName: item.name,
        quantity: qty,
        unit: item.unit,
        selectedAttributes,
        lotNumber: lot
      });

      // Reset item inputs
      itemSelect.value = "";
      dynamicSection.style.display = "none";
      document.getElementById("surgItemQty").value = "1";
      document.getElementById("surgItemLot").value = "";

      // Re-render tray
      const trayBox = document.getElementById("surgicalTrayContainer");
      if (trayBox) trayBox.innerHTML = renderSurgicalTrayRows();
      const badge = document.getElementById("trayCountBadge");
      if (badge) badge.textContent = `${surgicalCart.length} Items`;
    });

    // Submit Operation handler
    document.getElementById("btnSubmitOperation").addEventListener("click", async () => {
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
        alert("Please select under which specialist care this patient is operated.");
        return;
      }

      if (surgicalCart.length === 0) {
        alert("Please add at least one consumed surgical item to the tray.");
        return;
      }

      const reportPayload = {
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
        btn.textContent = "Recording & Syncing Storage...";

        await inventory.submitSurgicalConsumption(reportPayload);

        // Reset cart and form
        surgicalCart = [];
        alert("Surgical consumption successfully recorded! Storage counts updated.");
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
        let cardAlertClass = "";
        let stockBadgeHtml = "";

        if (isOut) {
          cardAlertClass = "out-of-stock-alert";
          stockBadgeHtml = `<span class="stock-badge out_of_stock">OUT OF STOCK (0)</span>`;
        } else if (isLow) {
          cardAlertClass = "low-stock-alert";
          stockBadgeHtml = `<span class="stock-badge low_stock">⚠️ LOW STOCK (${item.quantity} left)</span>`;
        } else {
          stockBadgeHtml = `<span class="stock-badge healthy">Available (${item.quantity} ${item.unit})</span>`;
        }

        const attrPills = (item.attributes || []).map(a => {
          const optsCount = a.options ? a.options.length : 0;
          return `<span class="attr-pill-preview">⚙️ ${a.name} (${optsCount} options)</span>`;
        }).join(" ");

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
                ${stockBadgeHtml}
              </div>
            </div>

            ${attrPills ? `<div class="dynamic-attributes-container">${attrPills}</div>` : ''}

            <div class="item-meta-row">
              <div class="item-meta-item">
                <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span>${item.location || 'Storage'}</span>
              </div>
              <div class="item-meta-item">
                <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Alarm at: &le; ${item.threshold}</span>
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
  // TAB 2 (ADMIN / OWNER): INVENTORY EDITOR & DYNAMIC SCHEMA BUILDER
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

        const attrTags = (item.attributes || []).map(a => {
          return `<span class="attr-pill-preview">⚙️ ${a.name} (${(a.options || []).length} choices)</span>`;
        }).join(" ");

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

            ${attrTags ? `<div class="dynamic-attributes-container">${attrTags}</div>` : ''}

            <!-- Manager Action Controls -->
            <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:0.5px solid var(--ios-separator);flex-wrap:wrap;">
              <button class="ios-btn ios-btn-success ios-btn-sm" onclick="window.openRefillModal('${item.id}')">
                + Refill Stock
              </button>
              <button class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openEditItemModal('${item.id}')">
                ✏️ Edit Details
              </button>
              <button class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openSchemaModal('${item.id}')" style="background:rgba(0,122,255,0.12);color:var(--ios-blue);">
                ⚙️ Dynamic Schema (${(item.attributes || []).length})
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

  // --- Modal Helpers for Inventory Editor ---
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
            <input type="number" id="newItemQty" class="ios-input" value="5" min="0">
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
      const name = document.getElementById("newItemName").value.trim();
      const category = document.getElementById("newItemCategory").value;
      const unit = document.getElementById("newItemUnit").value.trim();
      const quantity = parseInt(document.getElementById("newItemQty").value, 10);
      const lowStockThreshold = parseInt(document.getElementById("newItemThreshold").value, 10);
      const location = document.getElementById("newItemLocation").value.trim();
      const sku = document.getElementById("newItemSku").value.trim();
      const notes = document.getElementById("newItemNotes").value.trim();

      try {
        await inventory.addItem({
          name, category, unit, quantity, lowStockThreshold, location, sku, notes
        });
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Failed to add item: " + err.message);
      }
    });

    openModal();
  }

  window.openRefillModal = (itemId) => {
    const item = inventory.getItemById(itemId);
    if (!item) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Refill Stock: ${item.name}`;

    body.innerHTML = `
      <form id="refillForm">
        <div style="background:var(--ios-card-inner);padding:12px;border-radius:var(--radius-md);margin-bottom:14px;border:1px solid var(--ios-separator);">
          <div style="font-size:13px;color:var(--ios-text-secondary);">Current Stock in Storage:</div>
          <div style="font-size:22px;font-weight:800;color:var(--ios-text-primary);margin-top:2px;">
            ${item.quantity} ${item.unit}
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Amount to Add (+ Quantity) *</label>
          <input type="number" id="refillAmountInput" class="ios-input" value="5" min="1" required autofocus>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:14px;">
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 1">+1</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 3">+3</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 5">+5</button>
          <button type="button" class="btn-ctrl" onclick="document.getElementById('refillAmountInput').value = 10">+10</button>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Refill Note (Broadcast to Users)</label>
          <input type="text" id="refillNoteInput" class="ios-input" placeholder="e.g. Received new shipment from Central Pharmacy">
        </div>

        <button type="submit" class="ios-btn ios-btn-success" style="margin-top:8px;">
          Confirm Refill & Notify Neurosurgeons
        </button>
      </form>
    `;

    document.getElementById("refillForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parseInt(document.getElementById("refillAmountInput").value, 10);
      const note = document.getElementById("refillNoteInput").value.trim();

      try {
        await inventory.refillItem(itemId, amount, note);
        closeModal();
        renderCurrentView();
      } catch (err) {
        alert("Refill failed: " + err.message);
      }
    });

    openModal();
  };

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
            <label class="ios-label">Adjust Quantity</label>
            <input type="number" id="editItemQty" class="ios-input" value="${item.quantity}" min="0">
          </div>
          <div class="ios-input-group" style="flex:1;">
            <label class="ios-label">Alarm Threshold</label>
            <input type="number" id="editItemThreshold" class="ios-input" value="${item.threshold}" min="1">
          </div>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Storage Location</label>
          <input type="text" id="editItemLocation" class="ios-input" value="${item.location || ''}">
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
          quantity: parseInt(document.getElementById("editItemQty").value, 10),
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

  // --- Dynamic Schema Builder Modal (VP Shunts, Screws, Custom Dropdowns) ---
  window.openSchemaModal = (itemId) => {
    activeEditingItemId = itemId;
    const item = inventory.getItemById(itemId);
    if (!item) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Configure Details: ${item.name}`;

    function renderSchemaModalContent() {
      const freshItem = inventory.getItemById(activeEditingItemId);
      const attrs = freshItem?.attributes || [];

      body.innerHTML = `
        <div style="margin-bottom:14px;">
          <div style="font-size:13px;color:var(--ios-text-secondary);margin-bottom:6px;">
            Customize the dynamic dropdowns and parameters that surgeons select when reporting this item (e.g. Pressure level, Manufacturer, Type).
          </div>
        </div>

        <!-- Add new dynamic attribute definition form -->
        <div class="attr-builder-card" style="border:1.5px dashed var(--ios-blue);">
          <div style="font-size:12.5px;font-weight:700;color:var(--ios-blue);margin-bottom:8px;">+ Add New Detail / Dropdown</div>
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

        <!-- Existing Attributes List -->
        <div style="margin-top:16px;">
          <div class="ios-section-title" style="margin-bottom:10px;">Configured Item Details (${attrs.length})</div>
          ${attrs.length === 0 ? `<div style="text-align:center;color:var(--ios-text-secondary);padding:14px;">No custom attributes added yet.</div>` : ''}

          ${attrs.map((attr, aIdx) => `
            <div class="attr-builder-card">
              <div class="attr-builder-header">
                <div>
                  <strong style="font-size:14px;">${attr.name}</strong>
                  <span style="font-size:11px;color:var(--ios-blue);margin-left:6px;text-transform:uppercase;">[${attr.type}]</span>
                </div>
                <button type="button" class="btn-tag-remove" onclick="window.deleteAttributeAction('${activeEditingItemId}', '${attr.id}')" title="Delete attribute">&times;</button>
              </div>

              <!-- Options List for Dropdowns -->
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

                <!-- Add new parameter option to this attribute -->
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <input type="text" id="addOptInput_${attr.id}" class="ios-input" placeholder="New option (e.g. Ultra-Low)" style="padding:6px 10px;font-size:12px;">
                  <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.addOptionAction('${activeEditingItemId}', '${attr.id}')">Add</button>
                </div>
              ` : ''}
            </div>
          `).join("")}
        </div>
      `;

      // Attach create attribute listener
      const btnCreate = document.getElementById("btnCreateAttr");
      if (btnCreate) {
        btnCreate.addEventListener("click", async () => {
          const name = document.getElementById("newAttrNameInput").value.trim();
          const type = document.getElementById("newAttrTypeInput").value;
          const optsRaw = document.getElementById("newAttrInitialOptions").value.trim();

          if (!name) {
            alert("Attribute name is required.");
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
    if (!confirm("Are you sure you want to remove this detail field from the item?")) return;
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

    if (!confirm(`Are you sure you want to delete "${item.name}" from the inventory? This cannot be undone.`)) {
      return;
    }

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
    let selectedDate = "";
    let selectedSpecialist = "all";
    let searchQ = "";

    function renderLogEntries() {
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
          <div style="text-align:center;padding:40px 10px;color:var(--ios-text-secondary);">
            <svg style="width:36px;height:36px;margin:0 auto 8px auto;opacity:0.4;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            <div>No operative logs found for the selected filter.</div>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = logs.map(log => {
        const timeFormatted = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const itemsRendered = (log.items || []).map(it => {
          const paramsList = Object.entries(it.selectedAttributes || {}).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(", ");
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

            <div class="patient-highlight">👤 ${log.patientName} ${log.patientAge ? `(${log.patientAge}y)` : ''}</div>
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

    container.innerHTML = `
      <!-- Filters and Date / Month Selector -->
      <div class="ios-card" style="padding:12px 14px;">
        <div class="ios-section-header" style="margin-bottom:8px;">
          <span class="ios-section-title">Logbook Filter & Day Selector</span>
          <span id="logStatsSummary" class="stock-badge healthy">Loading...</span>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="flex:1;">
            <label class="ios-label">Filter Day</label>
            <input type="date" id="logDateFilter" class="ios-input">
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
              ${specialists.map(s => `<option value="${s.name}">${s.name}</option>`).join("")}
            </select>
          </div>
        </div>

        <div>
          <input type="text" id="logSearchFilter" class="ios-input" placeholder="🔍 Search patient name, procedure, or item...">
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

      <!-- Log Entries Container -->
      <div id="logbookEntriesList"></div>
    `;

    document.getElementById("logDateFilter").addEventListener("change", (e) => {
      selectedDate = e.target.value;
      renderLogEntries();
    });

    document.getElementById("btnClearDateFilter").addEventListener("click", () => {
      document.getElementById("logDateFilter").value = "";
      selectedDate = "";
      renderLogEntries();
    });

    document.getElementById("logSpecialistFilter").addEventListener("change", (e) => {
      selectedSpecialist = e.target.value;
      renderLogEntries();
    });

    document.getElementById("logSearchFilter").addEventListener("input", (e) => {
      searchQ = e.target.value;
      renderLogEntries();
    });

    // CSV Export
    document.getElementById("btnExportCsv").addEventListener("click", () => {
      const logs = inventory.getUsageLogs({ date: selectedDate, specialist: selectedSpecialist, search: searchQ });
      exportLogsToCsv(logs);
    });

    // Print helper
    document.getElementById("btnPrintLog").addEventListener("click", () => {
      window.print();
    });

    renderLogEntries();
  }

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
  // TAB 4: USER MANAGEMENT, APPROVALS & HARDWARE DEVICE LOCKS (ADMIN/OWNER)
  // ==========================================================================
  function renderUserManagementView(container) {
    const db = getDb();
    const users = db?.users || [];
    const pendingUsers = users.filter(u => u.status === "pending");
    const activeUsers = users.filter(u => u.status !== "pending");

    container.innerHTML = `
      <!-- Section 1: Pending Sign-up Requests -->
      <div class="ios-card" style="border:1.5px solid ${pendingUsers.length > 0 ? 'var(--ios-orange)' : 'var(--ios-card-border)'};">
        <div class="ios-section-header">
          <span class="ios-section-title">Sign-Up Requests (${pendingUsers.length})</span>
          ${pendingUsers.length > 0 ? `<span class="stock-badge low_stock">Pending Approval</span>` : `<span class="stock-badge healthy">All Reviewed</span>`}
        </div>

        ${pendingUsers.length === 0 ? `
          <div style="color:var(--ios-text-secondary);font-size:12.5px;padding:8px 0;">No pending account registrations at this time.</div>
        ` : `
          ${pendingUsers.map(u => `
            <div style="background:var(--ios-card-inner);border:1px solid var(--ios-separator);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <strong style="font-size:14.5px;">${u.fullName}</strong>
                  <div style="font-size:12px;color:var(--ios-blue);">@${u.username} • Phone: ${u.phone || 'N/A'}</div>
                  <div style="font-size:11px;color:var(--ios-text-tertiary);margin-top:2px;">Requested on: ${new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              <!-- Quick Approval Actions with Device Lock Configuration -->
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

      <!-- Section 2: Active User Directory -->
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

              <!-- Registered Devices Inspection -->
              <div class="device-list-box">
                <div style="font-weight:600;margin-bottom:3px;color:var(--ios-text-primary);">Bound Devices:</div>
                ${registeredDevs.length === 0 ? `
                  <span style="color:var(--ios-text-tertiary);">No device bound yet (Will bind on next login).</span>
                ` : `
                  ${registeredDevs.map(d => `
                    <div style="margin-bottom:2px;">• <strong>${d.name}</strong> <span style="color:var(--ios-text-tertiary);font-size:10.5px;">(Active: ${new Date(d.lastActive || d.registeredAt).toLocaleDateString()})</span></div>
                  `).join("")}
                `}
              </div>

              <!-- User Actions -->
              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.openEditUserModal('${u.id}')">
                  Edit Role & Limits
                </button>
                <button type="button" class="ios-btn ios-btn-secondary ios-btn-sm" onclick="window.resetUserDevicesAction('${u.id}')" title="Clear registered device bindings so user can login with new phone">
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

  // User Approval Modal
  window.openApproveUserModal = (userId) => {
    const db = getDb();
    const user = db?.users?.find(u => u.id === userId);
    if (!user) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Approve Access: ${user.fullName}`;

    body.innerHTML = `
      <form id="approveUserForm">
        <div style="font-size:13px;color:var(--ios-text-secondary);margin-bottom:12px;">
          Configure the permission role and hardware device lock limit for @${user.username}.
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Assigned Role</label>
          <select id="approveRoleSelect" class="ios-select">
            <option value="REGULAR" selected>REGULAR (Neurosurgeon / Scrub Nurse - Usage reporting only)</option>
            <option value="ADMIN">ADMIN (Inventory Manager & Editor)</option>
            ${auth.isOwner() ? '<option value="OWNER">OWNER (Chief Super-Administrator)</option>' : ''}
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Device Lock Policy</label>
          <select id="approveDeviceSelect" class="ios-select">
            <option value="1" selected>Single Device (Locked to 1 user phone/tablet)</option>
            <option value="2">2 Devices (e.g. Personal Phone + Hospital Tablet)</option>
            <option value="3">3 Devices</option>
            <option value="unlimited">Unlimited Devices (No hardware lock)</option>
          </select>
        </div>

        <button type="submit" class="ios-btn ios-btn-success" style="margin-top:12px;">
          Confirm & Activate User
        </button>
      </form>
    `;

    document.getElementById("approveUserForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const role = document.getElementById("approveRoleSelect").value;
      const deviceLimit = document.getElementById("approveDeviceSelect").value;

      try {
        await auth.approveUser(userId, role, deviceLimit);
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
    if (!confirm("Are you sure you want to reject this registration request?")) return;
    try {
      await auth.rejectUser(userId);
      renderCurrentView();
      notifications.updateBadges();
    } catch (err) {
      alert("Rejection failed: " + err.message);
    }
  };

  window.openEditUserModal = (userId) => {
    const db = getDb();
    const user = db?.users?.find(u => u.id === userId);
    if (!user) return;

    const title = document.getElementById("sheetModalTitle");
    const body = document.getElementById("sheetModalBody");
    title.textContent = `Edit User: ${user.fullName}`;

    body.innerHTML = `
      <form id="editUserForm">
        <div class="ios-input-group">
          <label class="ios-label">Account Role</label>
          <select id="editUserRole" class="ios-select">
            <option value="REGULAR" ${user.role === 'REGULAR' ? 'selected' : ''}>REGULAR</option>
            <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
            ${auth.isOwner() ? `<option value="OWNER" ${user.role === 'OWNER' ? 'selected' : ''}>OWNER</option>` : ''}
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Device Lock Limit</label>
          <select id="editUserDeviceLimit" class="ios-select">
            <option value="1" ${user.deviceLimit == 1 ? 'selected' : ''}>1 Device (Single Device Lock)</option>
            <option value="2" ${user.deviceLimit == 2 ? 'selected' : ''}>2 Devices</option>
            <option value="3" ${user.deviceLimit == 3 ? 'selected' : ''}>3 Devices</option>
            <option value="unlimited" ${user.deviceLimit === 'unlimited' ? 'selected' : ''}>Unlimited Devices</option>
          </select>
        </div>

        <div class="ios-input-group">
          <label class="ios-label">Reset Password (Optional)</label>
          <input type="text" id="editUserNewPassword" class="ios-input" placeholder="Leave blank to keep unchanged">
        </div>

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:12px;">Save User Settings</button>
      </form>
    `;

    document.getElementById("editUserForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const newRole = document.getElementById("editUserRole").value;
      const newLimit = document.getElementById("editUserDeviceLimit").value;
      const newPass = document.getElementById("editUserNewPassword").value.trim();

      const updates = { role: newRole, deviceLimit: newLimit };
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

  window.resetUserDevicesAction = async (userId) => {
    if (!confirm("Reset all registered device bindings for this user? They will be able to bind their new device on their next login.")) return;
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
        listEl.innerHTML = `
          <div style="text-align:center;padding:40px 10px;color:var(--ios-text-secondary);">
            <svg style="width:36px;height:36px;margin:0 auto 8px auto;opacity:0.4;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <div>No alerts in this category.</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = notifs.map(n => {
        let iconHtml = '📢';
        if (n.type === 'refill') iconHtml = '📦';
        else if (n.type === 'low_stock') iconHtml = '⚠️';
        else if (n.type === 'out_of_stock') iconHtml = '🚨';
        else if (n.type === 'signup_request') iconHtml = '👤';

        const timeStr = new Date(n.timestamp).toLocaleString();

        return `
          <div class="notif-item ${n.type} ${n.isRead ? '' : 'unread'}" onclick="window.markNotifRead('${n.id}')">
            <div class="notif-icon-circle">${iconHtml}</div>
            <div class="notif-content">
              <div class="notif-title">${n.title}</div>
              <div class="notif-desc">${n.message}</div>
              <div class="notif-time">${timeStr}</div>
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
      <!-- User Profile Header -->
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

      <!-- Appearance & Sound Settings -->
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

      <!-- Device Information -->
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

      <!-- GitHub Cloud Sync Controls -->
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

      <!-- Account Actions -->
      <div class="ios-card">
        <button type="button" id="btnLogoutApp" class="ios-btn ios-btn-danger" style="margin-bottom:8px;">
          Sign Out of NeuroWare
        </button>
      </div>
    `;

    document.getElementById("settingsThemeSelect").addEventListener("change", (e) => {
      toggleTheme(e.target.value);
    });

    document.getElementById("settingsSoundToggle").addEventListener("change", (e) => {
      notifications.soundEnabled = e.target.checked;
    });

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

    document.getElementById("btnLogoutApp").addEventListener("click", () => {
      auth.logout();
      checkAuthAndRender();
    });
  }

  // ==========================================================================
  // AUTHENTICATION MODAL SCREEN (LOGIN & SIGN-UP)
  // ==========================================================================
  function renderAuthForms() {
    const authContainer = document.getElementById("authModalScreen");
    if (!authContainer) return;

    let isSignupMode = false;

    function renderForm() {
      authContainer.innerHTML = `
        <div class="ios-card" style="width:100%;max-width:380px;padding:24px;border-radius:28px;box-shadow:var(--ios-shadow-lg);">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="width:58px;height:58px;margin:0 auto 10px auto;border-radius:16px;background:linear-gradient(135deg,var(--ios-blue),var(--ios-indigo));display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,122,255,0.4);">
              <svg style="width:32px;height:32px;color:#FFF;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
            </div>
            <h1 style="font-size:20px;font-weight:800;letter-spacing:-0.4px;">NeuroWare</h1>
            <p style="font-size:12.5px;color:var(--ios-text-secondary);margin-top:2px;">Neurosurgical Storage & Operative Inventory</p>
          </div>

          ${!isSignupMode ? `
            <!-- Login Form -->
            <form id="loginForm">
              <div class="ios-input-group">
                <label class="ios-label">Username</label>
                <input type="text" id="loginUsername" class="ios-input" placeholder="e.g. owner or admin" required autocomplete="username">
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Password</label>
                <input type="password" id="loginPassword" class="ios-input" placeholder="••••••••" required autocomplete="current-password">
              </div>

              <button type="submit" id="btnLoginSubmit" class="ios-btn ios-btn-primary" style="margin-top:8px;">
                Sign In
              </button>

              <div style="text-align:center;margin-top:14px;">
                <button type="button" id="btnToggleAuthMode" style="background:none;border:none;color:var(--ios-blue);font-size:13px;font-weight:600;cursor:pointer;">
                  Don't have an account? Request Sign-up
                </button>
              </div>

              <!-- Quick Demo Login Pills for Quick Access -->
              <div style="margin-top:18px;padding-top:14px;border-top:0.5px solid var(--ios-separator);">
                <div style="font-size:11px;font-weight:700;color:var(--ios-text-secondary);text-transform:uppercase;margin-bottom:8px;text-align:center;">
                  ⚡ Quick Demo Accounts
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
                  <button type="button" class="btn-ctrl" onclick="window.quickDemoLogin('owner', 'Owner2026!')">👑 Owner</button>
                  <button type="button" class="btn-ctrl" onclick="window.quickDemoLogin('admin', 'Admin2026!')">🛡️ Admin</button>
                  <button type="button" class="btn-ctrl" onclick="window.quickDemoLogin('dr_kareem', 'Kareem2026!')">🩺 Surgeon</button>
                </div>
              </div>
            </form>
          ` : `
            <!-- Sign-Up Request Form -->
            <form id="signupForm">
              <div class="ios-input-group">
                <label class="ios-label">Doctor / Staff Full Name *</label>
                <input type="text" id="signupFullName" class="ios-input" placeholder="e.g. Dr. Zaid Al-Hilli" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Choose Username *</label>
                <input type="text" id="signupUsername" class="ios-input" placeholder="e.g. dr_zaid" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Password *</label>
                <input type="password" id="signupPassword" class="ios-input" placeholder="Choose a password" required>
              </div>

              <div class="ios-input-group">
                <label class="ios-label">Phone Number (Optional)</label>
                <input type="text" id="signupPhone" class="ios-input" placeholder="+964...">
              </div>

              <div style="font-size:11.5px;color:var(--ios-text-secondary);margin-bottom:12px;background:var(--ios-card-inner);padding:8px;border-radius:8px;">
                ℹ️ Your request will be sent to the Owner and Admins. Once approved and device-locked, you will have access.
              </div>

              <button type="submit" id="btnSignupSubmit" class="ios-btn ios-btn-success">
                Submit Registration Request
              </button>

              <div style="text-align:center;margin-top:14px;">
                <button type="button" id="btnToggleAuthMode" style="background:none;border:none;color:var(--ios-blue);font-size:13px;font-weight:600;cursor:pointer;">
                  Already registered? Back to Sign In
                </button>
              </div>
            </form>
          `}
        </div>
      `;

      // Toggle between Login and Sign-up
      const toggleBtn = document.getElementById("btnToggleAuthMode");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          isSignupMode = !isSignupMode;
          renderForm();
        });
      }

      // Handle Login Submit
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

      // Handle Signup Submit
      const signupForm = document.getElementById("signupForm");
      if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const fullName = document.getElementById("signupFullName").value;
          const username = document.getElementById("signupUsername").value;
          const password = document.getElementById("signupPassword").value;
          const phone = document.getElementById("signupPhone").value;
          const btn = document.getElementById("btnSignupSubmit");
          btn.disabled = true;
          btn.textContent = "Submitting Request...";

          try {
            await auth.signup({ fullName, username, password, phone });
            alert("Registration Submitted!\nYour account is now pending approval by the Storage Director (Admin/Owner). You will be notified once activated.");
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

    window.quickDemoLogin = (u, p) => {
      const uField = document.getElementById("loginUsername");
      const pField = document.getElementById("loginPassword");
      if (uField && pField) {
        uField.value = u;
        pField.value = p;
        document.getElementById("btnLoginSubmit").click();
      }
    };

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

  // Top header bell button opens Alerts tab
  document.getElementById("btnHeaderAlerts")?.addEventListener("click", () => {
    switchTab("alerts");
  });

  // Top header user button opens Settings tab
  document.getElementById("btnHeaderProfile")?.addEventListener("click", () => {
    switchTab("settings");
  });

  // Desktop toggle fullscreen / phone frame view
  window.toggleDesktopFullscreen = () => {
    const frame = document.getElementById("mainIphoneFrame");
    const bar = document.querySelector(".desktop-controls-bar");
    if (frame) {
      frame.classList.toggle("fullscreen-mode");
    }
    if (bar) {
      bar.classList.toggle("expanded");
    }
  };

  const desktopViewToggle = document.getElementById("btnToggleDesktopView");
  if (desktopViewToggle) {
    desktopViewToggle.addEventListener("click", window.toggleDesktopFullscreen);
  }

  // 6. Launch Application
  initTheme();
  checkAuthAndRender();
});
