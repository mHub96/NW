/**
 * NeuroWare Surgical Inventory & Operative Log Engine
 * Multi-Variant / Specification-Level Stock Tracking
 * Dynamic Item Schema, Combination-Based Storage Values, Refills & Alarms
 */

class InventoryManager {
  constructor(getDb, saveDb, authManager) {
    this.getDb = getDb;
    this.saveDb = saveDb;
    this.auth = authManager;
  }

  // Canonical key generator for an attribute map
  static getVariantKey(attrMap) {
    if (!attrMap || typeof attrMap !== "object") return "";
    return Object.keys(attrMap)
      .sort()
      .map(k => `${k}=${attrMap[k]}`)
      .join("|");
  }

  // Find a matching variant inside an item by attribute map
  findVariant(item, attrMap) {
    if (!item || !item.variants || !Array.isArray(item.variants)) return null;
    const targetKey = InventoryManager.getVariantKey(attrMap);
    return item.variants.find(v => InventoryManager.getVariantKey(v.attributes) === targetKey) || null;
  }

  // Compute total item quantity across all distinct feature combinations
  computeItemTotalQuantity(item) {
    if (!item) return 0;
    if (item.variants && Array.isArray(item.variants) && item.variants.length > 0) {
      return item.variants.reduce((sum, v) => sum + (parseInt(v.quantity, 10) || 0), 0);
    }
    return parseInt(item.quantity, 10) || 0;
  }

  // Retrieve all items with computed stock health flags and variant counts
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
        )) ||
        (it.variants && it.variants.some(v => 
          Object.values(v.attributes || {}).some(val => String(val).toLowerCase().includes(q))
        ))
      );
    }

    return items.map(item => {
      const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold;
      const totalQty = this.computeItemTotalQuantity(item);

      // Check if any specific variant has low stock or out of stock
      const variantsWithStatus = (item.variants || []).map(v => {
        const vThreshold = v.lowStockThreshold !== undefined ? v.lowStockThreshold : threshold;
        const vOut = v.quantity <= 0;
        const vLow = !vOut && v.quantity <= vThreshold;
        return {
          ...v,
          threshold: vThreshold,
          isOutOfStock: vOut,
          isLowStock: vLow,
          status: vOut ? "out_of_stock" : (vLow ? "low_stock" : "healthy")
        };
      });

      const hasLowStockVariant = variantsWithStatus.some(v => v.isLowStock);
      const hasOutOfStockVariant = variantsWithStatus.some(v => v.isOutOfStock);
      const isOutOfStock = totalQty <= 0;
      const isLowStock = !isOutOfStock && (totalQty <= threshold || hasLowStockVariant);

      return {
        ...item,
        quantity: totalQty,
        threshold,
        variants: variantsWithStatus,
        isOutOfStock,
        isLowStock,
        hasLowStockVariant,
        hasOutOfStockVariant,
        stockStatus: isOutOfStock ? "out_of_stock" : (isLowStock ? "low_stock" : "healthy")
      };
    });
  }

  getItemById(id) {
    const items = this.getItems();
    return items.find(it => it.id === id) || null;
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
      lowStockThreshold: itemData.lowStockThreshold !== undefined ? parseInt(itemData.lowStockThreshold, 10) : window.NEURO_CONFIG.CONFIG.defaultAlarmThreshold,
      unit: itemData.unit ? itemData.unit.trim() : "Units",
      location: itemData.location ? itemData.location.trim() : "Storage Shelf",
      sku: itemData.sku ? itemData.sku.trim() : "",
      notes: itemData.notes ? itemData.notes.trim() : "",
      attributes: Array.isArray(itemData.attributes) ? itemData.attributes : [],
      variants: Array.isArray(itemData.variants) ? itemData.variants : [],
      quantity: Math.max(0, parseInt(itemData.quantity, 10) || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.items.push(newItem);

    this.createNotification({
      type: "refill",
      priority: "normal",
      title: "New Item Added: " + newItem.name,
      message: `${this.auth.getCurrentUser().fullName} registered new item "${newItem.name}" (${newItem.quantity} ${newItem.unit}) in ${newItem.location}.`,
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
    if (updates.quantity !== undefined && (!item.variants || item.variants.length === 0)) {
      item.quantity = Math.max(0, parseInt(updates.quantity, 10) || 0);
    }
    item.updatedAt = new Date().toISOString();

    await this.saveDb(db, `Updated item details: ${item.name}`);
    return item;
  }

  // --- Admin/Owner: Refill Stock Quantity for a Specific Feature Combination ---
  async refillItem(itemId, refillAmount, selectedAttributes = null, note = "") {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can refill inventory stock.");
    const db = this.getDb();
    const item = db.items.find(it => it.id === itemId);
    if (!item) throw new Error("Item not found.");

    const added = parseInt(refillAmount, 10);
    if (isNaN(added) || added <= 0) throw new Error("Refill amount must be a positive number.");

    if (!item.variants) item.variants = [];

    let specDescription = "";
    let variantTotal = 0;

    if (selectedAttributes && Object.keys(selectedAttributes).length > 0) {
      // Find matching variant
      let variant = this.findVariant(item, selectedAttributes);
      if (!variant) {
        // Create new combination variant in storage
        variant = {
          id: "var-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6),
          attributes: { ...selectedAttributes },
          quantity: added,
          lowStockThreshold: item.lowStockThreshold || 2,
          sku: item.sku ? `${item.sku}-${item.variants.length + 1}` : "",
          lastRefilled: {
            date: new Date().toISOString(),
            by: this.auth.getCurrentUser().username,
            amount: added,
            note: note.trim()
          }
        };
        item.variants.push(variant);
        variantTotal = added;
      } else {
        variant.quantity = (parseInt(variant.quantity, 10) || 0) + added;
        variant.lastRefilled = {
          date: new Date().toISOString(),
          by: this.auth.getCurrentUser().username,
          amount: added,
          note: note.trim()
        };
        variantTotal = variant.quantity;
      }

      specDescription = Object.entries(selectedAttributes).map(([k, v]) => `${k}: ${v}`).join(", ");
    } else {
      // Item has no variants, refill simple item quantity
      item.quantity = (parseInt(item.quantity, 10) || 0) + added;
      variantTotal = item.quantity;
      item.lastRefilled = {
        date: new Date().toISOString(),
        by: this.auth.getCurrentUser().username,
        amount: added,
        note: note.trim()
      };
    }

    item.updatedAt = new Date().toISOString();

    const specText = specDescription ? ` [${specDescription}]` : "";
    this.createNotification({
      type: "refill",
      priority: "normal",
      title: `Stock Refilled: ${item.name}`,
      message: `${this.auth.getCurrentUser().fullName} refilled ${item.name}${specText} by +${added} ${item.unit}. Available for this specification: ${variantTotal} ${item.unit}.${note ? ` (Note: ${note})` : ''}`,
      metadata: {
        itemId: item.id,
        itemName: item.name,
        spec: specDescription,
        amount: added,
        newTotal: variantTotal,
        refilledBy: this.auth.getCurrentUser().fullName
      }
    });

    await this.saveDb(db, `Refilled ${item.name}${specText} (+${added}) by @${this.auth.getCurrentUser().username}`);
    return item;
  }

  // --- Dynamic Schema Management (Add/Remove Custom Dropdowns) ---
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

  async deleteItem(itemId) {
    if (!this.auth.isAdmin()) throw new Error("Only Managers can delete inventory items.");
    const db = this.getDb();
    const idx = db.items.findIndex(it => it.id === itemId);
    if (idx === -1) throw new Error("Item not found.");

    const [deleted] = db.items.splice(idx, 1);
    await this.saveDb(db, `Deleted item "${deleted.name}" from inventory`);
    return true;
  }

  // --- Surgical Usage Submission (Combines Feature Deductions Atomically) ---
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

    // Pre-validate stock for every specific item and its exact feature combination
    for (const trayItem of report.items) {
      const dbItem = db.items.find(it => it.id === trayItem.itemId);
      if (!dbItem) {
        throw new Error(`Item "${trayItem.itemName}" does not exist in inventory.`);
      }

      const hasAttributes = dbItem.attributes && dbItem.attributes.length > 0;
      if (hasAttributes) {
        const variant = this.findVariant(dbItem, trayItem.selectedAttributes);
        const specText = Object.entries(trayItem.selectedAttributes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        if (!variant) {
          throw new Error(
            `The requested combination (${specText || 'None'}) for "${dbItem.name}" is not available in storage (0 in stock).`
          );
        }
        if (variant.quantity < trayItem.quantity) {
          throw new Error(
            `Insufficient stock for "${dbItem.name}" [${specText}]. Requested: ${trayItem.quantity}, Available: ${variant.quantity} ${dbItem.unit}.`
          );
        }
      } else {
        const total = parseInt(dbItem.quantity, 10) || 0;
        if (total < trayItem.quantity) {
          throw new Error(
            `Insufficient stock for "${dbItem.name}". Requested: ${trayItem.quantity}, Available: ${total} ${dbItem.unit}.`
          );
        }
      }
    }

    // Deduct stock per variant and trigger low-stock alarms
    const lowStockAlerts = [];
    const consumedSummary = [];

    for (const trayItem of report.items) {
      const dbItem = db.items.find(it => it.id === trayItem.itemId);
      const hasAttributes = dbItem.attributes && dbItem.attributes.length > 0;
      let remainingStock = 0;
      let threshold = dbItem.lowStockThreshold || 2;
      let specText = "";

      if (hasAttributes) {
        const variant = this.findVariant(dbItem, trayItem.selectedAttributes);
        variant.quantity -= trayItem.quantity;
        remainingStock = variant.quantity;
        threshold = variant.lowStockThreshold || threshold;
        specText = Object.entries(trayItem.selectedAttributes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      } else {
        dbItem.quantity -= trayItem.quantity;
        remainingStock = dbItem.quantity;
      }

      dbItem.updatedAt = new Date().toISOString();

      if (remainingStock <= threshold) {
        lowStockAlerts.push({
          itemName: dbItem.name,
          specText,
          remaining: remainingStock,
          threshold,
          unit: dbItem.unit,
          isOut: remainingStock <= 0
        });
      }

      consumedSummary.push(`${trayItem.quantity}x ${dbItem.name}${specText ? ` (${specText})` : ''}`);
    }

    // Record immutable surgical log
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

    // Fire alarms for low/out-of-stock feature combinations
    for (const alert of lowStockAlerts) {
      const specLabel = alert.specText ? ` [${alert.specText}]` : "";
      if (alert.isOut) {
        this.createNotification({
          type: "out_of_stock",
          priority: "critical",
          title: `OUT OF STOCK: ${alert.itemName}`,
          message: `CRITICAL ALERT: ${alert.itemName}${specLabel} has run out of stock (0 remaining) after surgery on ${report.patientName}. Urgent restock needed!`,
          metadata: { itemName: alert.itemName, spec: alert.specText, currentQty: 0 }
        });
      } else {
        this.createNotification({
          type: "low_stock",
          priority: "warning",
          title: `Low Stock Alarm: ${alert.itemName}`,
          message: `Warning: ${alert.itemName}${specLabel} has only ${alert.remaining} ${alert.unit} remaining in storage (Threshold: ${alert.threshold}). Refill advised.`,
          metadata: { itemName: alert.itemName, spec: alert.specText, currentQty: alert.remaining, threshold: alert.threshold }
        });
      }
    }

    await this.saveDb(db, `Surgical consumption: ${report.patientName} (${consumedSummary.join(", ")})`);
    return logEntry;
  }

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

  getUsageLogs(filters = {}) {
    const db = this.getDb();
    if (!db || !db.usageLogs) return [];

    let logs = [...db.usageLogs];

    if (filters.date) {
      logs = logs.filter(log => log.date === filters.date);
    }
    if (filters.month) {
      logs = logs.filter(log => log.date.startsWith(filters.month));
    }
    if (filters.specialist && filters.specialist !== "all") {
      logs = logs.filter(log => log.specialistCare === filters.specialist);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      logs = logs.filter(log => 
        log.patientName.toLowerCase().includes(q) ||
        (log.procedureName && log.procedureName.toLowerCase().includes(q)) ||
        (log.specialistCare && log.specialistCare.toLowerCase().includes(q)) ||
        (log.loggedBy && log.loggedBy.fullName.toLowerCase().includes(q)) ||
        (log.bedNumber && log.bedNumber.toLowerCase().includes(q)) ||
        (log.items && log.items.some(it => 
          it.itemName.toLowerCase().includes(q) ||
          Object.values(it.selectedAttributes || {}).some(v => String(v).toLowerCase().includes(q))
        ))
      );
    }

    return logs;
  }
}

window.InventoryManager = InventoryManager;
