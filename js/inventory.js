/**
 * NeuroWare Surgical Inventory & Operative Log Engine
 * Dynamic Item Schema Builder, Dynamic Dropdown Customization,
 * Stock Tracking & Low-Stock Alarm Automation
 */

class InventoryManager {
  constructor(getDb, saveDb, authManager) {
    this.getDb = getDb;
    this.saveDb = saveDb;
    this.auth = authManager;
  }

  // Retrieve all items with computed stock health flags
  getItems(filterCategory = "All Items", searchQuery = "") {
    const db = this.getDb();
    if (!db || !db.items) return [];

    let items = [...db.items];

    if (filterCategory && filterCategory !== "All Items") {
      items = items.filter(it => it.category === filterCategory);
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(it => 
        it.name.toLowerCase().includes(q) ||
        (it.sku && it.sku.toLowerCase().includes(q)) ||
        (it.location && it.location.toLowerCase().includes(q)) ||
        (it.category && it.category.toLowerCase().includes(q)) ||
        (it.attributes && it.attributes.some(a => 
          a.name.toLowerCase().includes(q) || 
          (a.options && a.options.some(o => o.toLowerCase().includes(q)))
        ))
      );
    }

    return items.map(item => {
      const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold;
      const isOutOfStock = item.quantity <= 0;
      const isLowStock = !isOutOfStock && item.quantity <= threshold;
      return {
        ...item,
        threshold,
        isOutOfStock,
        isLowStock,
        stockStatus: isOutOfStock ? "out_of_stock" : (isLowStock ? "low_stock" : "healthy")
      };
    });
  }

  getItemById(id) {
    const db = this.getDb();
    if (!db || !db.items) return null;
    const item = db.items.find(it => it.id === id);
    if (!item) return null;
    const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold;
    return {
      ...item,
      threshold,
      isOutOfStock: item.quantity <= 0,
      isLowStock: item.quantity > 0 && item.quantity <= threshold,
      stockStatus: item.quantity <= 0 ? "out_of_stock" : (item.quantity <= threshold ? "low_stock" : "healthy")
    };
  }

  // --- Admin/Owner: Add new item to storage ---
  async addItem(itemData) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers (Owner/Admin) can add inventory items.");
    const db = this.getDb();
    if (!db.items) db.items = [];

    const newItem = {
      id: "item-" + Date.now().toString(36),
      name: itemData.name.trim(),
      category: itemData.category || "Consumables & PPE",
      quantity: Math.max(0, parseInt(itemData.quantity, 10) || 0),
      lowStockThreshold: itemData.lowStockThreshold !== undefined ? parseInt(itemData.lowStockThreshold, 10) : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold,
      unit: itemData.unit ? itemData.unit.trim() : "Units",
      location: itemData.location ? itemData.location.trim() : "Storage Shelf",
      sku: itemData.sku ? itemData.sku.trim() : "",
      notes: itemData.notes ? itemData.notes.trim() : "",
      attributes: Array.isArray(itemData.attributes) ? itemData.attributes : [],
      lastRefilled: {
        date: new Date().toISOString(),
        by: this.auth.getCurrentUser().username,
        amount: parseInt(itemData.quantity, 10) || 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.items.push(newItem);

    // Broadcast notification that new item was added
    this.createNotification({
      type: "refill",
      priority: "normal",
      title: "New Item Added: " + newItem.name,
      message: `${this.auth.getCurrentUser().fullName} added new item "${newItem.name}" (${newItem.quantity} ${newItem.unit}) to ${newItem.location}.`,
      metadata: { itemId: newItem.id, quantity: newItem.quantity }
    });

    await this.saveDb(db, `Added new inventory item: ${newItem.name}`);
    return newItem;
  }

  // --- Admin/Owner: Edit item general details ---
  async updateItem(itemId, updates) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can update items.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item) throw new Error("Item not found.");

    if (updates.name !== undefined) item.name = updates.name.trim();
    if (updates.category !== undefined) item.category = updates.category;
    if (updates.location !== undefined) item.location = updates.location.trim();
    if (updates.sku !== undefined) item.sku = updates.sku.trim();
    if (updates.unit !== undefined) item.unit = updates.unit.trim();
    if (updates.notes !== undefined) item.notes = updates.notes.trim();
    if (updates.lowStockThreshold !== undefined) {
      item.lowStockThreshold = Math.max(1, parseInt(updates.lowStockThreshold, 10) || 2);
    }
    if (updates.quantity !== undefined) {
      item.quantity = Math.max(0, parseInt(updates.quantity, 10) || 0);
    }
    item.updatedAt = new Date().toISOString();

    await this.saveDb(db, `Updated item details: ${item.name}`);
    return item;
  }

  // --- Admin/Owner: Refill Stock Quantity ---
  async refillItem(itemId, refillAmount, note = "") {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can refill inventory stock.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item) throw new Error("Item not found.");

    const added = parseInt(refillAmount, 10);
    if (isNaN(added) || added <= 0) throw new Error("Refill amount must be a positive number.");

    item.quantity += added;
    item.lastRefilled = {
      date: new Date().toISOString(),
      by: this.auth.getCurrentUser().username,
      byName: this.auth.getCurrentUser().fullName,
      amount: added,
      note: note.trim()
    };
    item.updatedAt = new Date().toISOString();

    // Broadcast refill notification to all users as required
    this.createNotification({
      type: "refill",
      priority: "normal",
      title: `Stock Refilled: ${item.name}`,
      message: `${this.auth.getCurrentUser().fullName} has refilled ${item.name} by +${added} ${item.unit}. New total stock is ${item.quantity} ${item.unit}.${note ? ` (Note: ${note})` : ''}`,
      metadata: {
        itemId: item.id,
        itemName: item.name,
        amount: added,
        newTotal: item.quantity,
        refilledBy: this.auth.getCurrentUser().fullName
      }
    });

    await this.saveDb(db, `Refilled ${item.name} (+${added}) by @${this.auth.getCurrentUser().username}`);
    return item;
  }

  // --- Admin/Owner: Dynamic Attribute (Schema) Management ---
  // Add a new customizable detail/dropdown to an item (e.g. "Pressure Gauge Level")
  async addAttributeToItem(itemId, attrData) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can modify item schemas.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item) throw new Error("Item not found.");

    if (!item.attributes) item.attributes = [];

    const newAttr = {
      id: "attr-" + Date.now().toString(36),
      name: attrData.name.trim(),
      type: attrData.type || "dropdown",
      required: attrData.required !== false,
      options: Array.isArray(attrData.options) ? attrData.options.map(o => o.trim()).filter(Boolean) : []
    };

    item.attributes.push(newAttr);
    item.updatedAt = new Date().toISOString();

    await this.saveDb(db, `Added custom attribute "${newAttr.name}" to ${item.name}`);
    return item;
  }

  // Update an existing attribute (e.g. rename it)
  async updateAttribute(itemId, attrId, updates) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can edit attribute schemas.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item || !item.attributes) throw new Error("Item or attributes not found.");

    const attr = item.attributes.find(a => a.id === attrId);
    if (!attr) throw new Error("Attribute not found.");

    if (updates.name !== undefined) attr.name = updates.name.trim();
    if (updates.required !== undefined) attr.required = !!updates.required;
    if (Array.isArray(updates.options)) {
      attr.options = updates.options.map(o => o.trim()).filter(Boolean);
    }
    item.updatedAt = new Date().toISOString();

    await this.saveDb(db, `Updated attribute "${attr.name}" on ${item.name}`);
    return item;
  }

  // Add an option parameter to a dropdown attribute (e.g., add "Ultra-Low" to Pressure Level)
  async addOptionToAttribute(itemId, attrId, newOption) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can edit options.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item || !item.attributes) throw new Error("Item not found.");

    const attr = item.attributes.find(a => a.id === attrId);
    if (!attr) throw new Error("Attribute not found.");

    const trimmed = newOption.trim();
    if (!trimmed) throw new Error("Option cannot be empty.");
    if (!attr.options) attr.options = [];
    if (!attr.options.includes(trimmed)) {
      attr.options.push(trimmed);
      item.updatedAt = new Date().toISOString();
      await this.saveDb(db, `Added parameter "${trimmed}" to ${attr.name} (${item.name})`);
    }
    return item;
  }

  // Remove an option parameter from a dropdown attribute
  async removeOptionFromAttribute(itemId, attrId, optionIndex) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can remove options.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item || !item.attributes) throw new Error("Item not found.");

    const attr = item.attributes.find(a => a.id === attrId);
    if (!attr || !attr.options) throw new Error("Attribute not found.");

    if (optionIndex >= 0 && optionIndex < attr.options.length) {
      attr.options.splice(optionIndex, 1);
      item.updatedAt = new Date().toISOString();
      await this.saveDb(db, `Removed parameter option from ${attr.name} (${item.name})`);
    }
    return item;
  }

  // Remove an entire dynamic attribute from an item
  async removeAttributeFromItem(itemId, attrId) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can remove attributes.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item || !item.attributes) throw new Error("Item not found.");

    const idx = item.attributes.findIndex(a => a.id === attrId);
    if (idx !== -1) {
      const removed = item.attributes.splice(idx, 1);
      item.updatedAt = new Date().toISOString();
      await this.saveDb(db, `Removed attribute "${removed[0]?.name}" from ${item.name}`);
    }
    return item;
  }

  // Delete item from inventory
  async deleteItem(itemId) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can delete inventory items.");
    const db = this.getDb();
    const idx = db.items.findIndex(it => it.id === itemId);
    if (idx === -1) throw new Error("Item not found.");

    const [deleted] = db.items.splice(idx, 1);
    await this.saveDb(db, `Deleted item "${deleted.name}" from inventory`);
    return true;
  }

  // --- Surgical Usage Submission (For Regular Users & Admins) ---
  // Atomically logs operation, deducts inventory, and raises alarms if stock drops to or below threshold
  async submitSurgicalConsumption(report) {
    const user = this.auth.getCurrentUser();
    if (!user) throw new Error("Authentication required.");

    const db = this.getDb();
    if (!report.items || report.items.length === 0) {
      throw new Error("Please select at least one surgical item used in the operation.");
    }

    if (!report.patientName || !report.patientName.trim()) {
      throw new Error("Patient name is required.");
    }

    if (!report.specialistCare) {
      throw new Error("Attending specialist care selection is required.");
    }

    // Step 1: Pre-validate stock availability for all items in surgical tray
    for (const trayItem of report.items) {
      const dbItem = db.items.find(it => it.id === trayItem.itemId);
      if (!dbItem) {
        throw new Error(`Item "${trayItem.itemName || trayItem.itemId}" does not exist in inventory.`);
      }
      if (dbItem.quantity < trayItem.quantity) {
        throw new Error(
          `Insufficient stock for "${dbItem.name}". Requested: ${trayItem.quantity}, Available in storage: ${dbItem.quantity} ${dbItem.unit}.`
        );
      }
    }

    // Step 2: Deduct stock and check alarm thresholds
    const lowStockAlerts = [];
    const consumedSummary = [];

    for (const trayItem of report.items) {
      const dbItem = db.items.find(it => it.id === trayItem.itemId);
      dbItem.quantity -= trayItem.quantity;
      dbItem.updatedAt = new Date().toISOString();

      const threshold = dbItem.lowStockThreshold !== undefined ? dbItem.lowStockThreshold : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold;

      // Check if stock has reached or dropped below alarm threshold
      if (dbItem.quantity <= threshold) {
        lowStockAlerts.push({
          item: dbItem,
          isOut: dbItem.quantity <= 0,
          remaining: dbItem.quantity,
          threshold: threshold
        });
      }

      consumedSummary.push(`${trayItem.quantity}x ${dbItem.name}`);
    }

    // Step 3: Create immutable surgical log entry
    if (!db.usageLogs) db.usageLogs = [];

    const opDate = report.operationDate || new Date().toISOString().split("T")[0];
    const logEntry = {
      id: "log-" + Date.now().toString(36),
      date: opDate,
      timestamp: new Date().toISOString(),
      patientName: report.patientName.trim(),
      patientAge: report.patientAge ? parseInt(report.patientAge, 10) : null,
      patientGender: report.patientGender || "Not Specified",
      specialistCare: report.specialistCare.trim(),
      bedNumber: report.bedNumber ? report.bedNumber.trim() : "Neurosurgery Ward / OT",
      procedureName: report.procedureName ? report.procedureName.trim() : "Neurosurgical Intervention",
      loggedBy: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role
      },
      items: report.items.map(it => ({
        itemId: it.itemId,
        itemName: it.itemName,
        quantity: it.quantity,
        selectedAttributes: it.selectedAttributes || {},
        lotNumber: it.lotNumber ? it.lotNumber.trim() : ""
      })),
      notes: report.notes ? report.notes.trim() : ""
    };

    db.usageLogs.unshift(logEntry);

    // Step 4: Fire low-stock alarms/notifications if any items dropped below threshold
    for (const alert of lowStockAlerts) {
      if (alert.isOut) {
        this.createNotification({
          type: "out_of_stock",
          priority: "critical",
          title: `OUT OF STOCK: ${alert.item.name}`,
          message: `CRITICAL ALERT: ${alert.item.name} has run out of stock (0 remaining) after operation on ${report.patientName}. Urgent restock needed!`,
          metadata: { itemId: alert.item.id, currentQty: 0 }
        });
      } else {
        this.createNotification({
          type: "low_stock",
          priority: "warning",
          title: `Low Stock Alarm: ${alert.item.name}`,
          message: `Warning: ${alert.item.name} has only ${alert.remaining} ${alert.item.unit} remaining in storage (Alarm threshold: ${alert.threshold}). Refill advised.`,
          metadata: { itemId: alert.item.id, currentQty: alert.remaining, threshold: alert.threshold }
        });
      }
    }

    await this.saveDb(db, `Surgical consumption: ${report.patientName} (${consumedSummary.join(", ")})`);
    return logEntry;
  }

  // Helper to append a notification to the database
  createNotification(notifData) {
    const db = this.getDb();
    if (!db.notifications) db.notifications = [];
    const notif = {
      id: "notif-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6),
      type: notifData.type || "system",
      priority: notifData.priority || "normal",
      title: notifData.title,
      message: notifData.message,
      timestamp: new Date().toISOString(),
      readBy: [],
      metadata: notifData.metadata || {}
    };
    db.notifications.unshift(notif);
    window.dispatchEvent(new CustomEvent("neuroware:new_notification", { detail: notif }));
  }

  // --- Usage History & Filtering ---
  getUsageLogs(filters = {}) {
    const db = this.getDb();
    if (!db || !db.usageLogs) return [];

    let logs = [...db.usageLogs];

    // Filter by specific day (YYYY-MM-DD)
    if (filters.date) {
      logs = logs.filter(log => log.date === filters.date);
    }

    // Filter by month (YYYY-MM)
    if (filters.month) {
      logs = logs.filter(log => log.date.startsWith(filters.month));
    }

    // Filter by Specialist
    if (filters.specialist && filters.specialist !== "all") {
      logs = logs.filter(log => log.specialistCare === filters.specialist);
    }

    // Filter by Search Query (patient, procedure, surgeon, item)
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      logs = logs.filter(log => 
        log.patientName.toLowerCase().includes(q) ||
        (log.procedureName && log.procedureName.toLowerCase().includes(q)) ||
        (log.specialistCare && log.specialistCare.toLowerCase().includes(q)) ||
        (log.loggedBy && log.loggedBy.fullName.toLowerCase().includes(q)) ||
        (log.bedNumber && log.bedNumber.toLowerCase().includes(q)) ||
        (log.items && log.items.some(it => it.itemName.toLowerCase().includes(q)))
      );
    }

    return logs;
  }

  // Summary statistics for reports
  getUsageStatistics(period = "all") {
    const db = this.getDb();
    const logs = db.usageLogs || [];
    const items = db.items || [];

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentMonthStr = todayStr.substring(0, 7);

    let filtered = logs;
    if (period === "today") {
      filtered = logs.filter(l => l.date === todayStr);
    } else if (period === "month") {
      filtered = logs.filter(l => l.date.startsWith(currentMonthStr));
    }

    let totalItemsConsumed = 0;
    const itemCounts = {};
    const specialistCounts = {};

    filtered.forEach(log => {
      if (log.specialistCare) {
        specialistCounts[log.specialistCare] = (specialistCounts[log.specialistCare] || 0) + 1;
      }
      if (log.items) {
        log.items.forEach(it => {
          totalItemsConsumed += (it.quantity || 1);
          itemCounts[it.itemName] = (itemCounts[it.itemName] || 0) + (it.quantity || 1);
        });
      }
    });

    const topItems = Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const lowStockCount = items.filter(it => it.quantity <= (it.lowStockThreshold || 2)).length;
    const outOfStockCount = items.filter(it => it.quantity <= 0).length;

    return {
      totalSurgeries: filtered.length,
      totalItemsConsumed,
      topItems,
      specialistCounts,
      lowStockCount,
      outOfStockCount,
      totalCatalogItems: items.length
    };
  }
}

window.InventoryManager = InventoryManager;
