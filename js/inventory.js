/**
 * NeuroWare Surgical Inventory & Operative Log Engine
 * Multi-Variant / Specification-Level Stock Tracking
 * Smart Patient Profiles, Unique Medical IDs, Chronological Age Validation & Combination Refills
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

  // Get stock details for a specific feature combination
  getVariantStock(itemId, attrMap) {
    const item = this.getItemById(itemId);
    if (!item) return { exists: false, quantity: 0, threshold: 2, unit: "Units" };

    if (!item.attributes || item.attributes.length === 0) {
      return {
        exists: true,
        quantity: item.quantity,
        threshold: item.threshold,
        unit: item.unit
      };
    }

    const variant = this.findVariant(item, attrMap);
    if (!variant) {
      return {
        exists: false,
        quantity: 0,
        threshold: item.threshold,
        unit: item.unit
      };
    }

    return {
      exists: true,
      quantity: parseInt(variant.quantity, 10) || 0,
      threshold: variant.lowStockThreshold || item.threshold,
      unit: item.unit,
      sku: variant.sku || ""
    };
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

  // --- Patient Profile & ID Management Engine ---
  generateUniquePatientId() {
    const db = this.getDb();
    const existingIds = new Set();
    (db.patients || []).forEach(p => existingIds.add(p.id));
    (db.usageLogs || []).forEach(l => { if (l.patientId) existingIds.add(l.patientId); });

    let newId;
    let attempts = 0;
    do {
      const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit clinical ID
      newId = `PID-${randomNum}`;
      attempts++;
    } while (existingIds.has(newId) && attempts < 1000);

    return newId;
  }

  // Find matching patient by name (case-insensitive & trimmed)
  findPatientByName(name) {
    if (!name || !name.trim()) return null;
    const clean = name.trim().toLowerCase();
    const db = this.getDb();

    // Check patients array first
    if (db.patients && Array.isArray(db.patients)) {
      const p = db.patients.find(x => x.name.trim().toLowerCase() === clean);
      if (p) return this.enrichPatient(p);
    }

    // Fallback: check historical usage logs
    if (db.usageLogs && Array.isArray(db.usageLogs)) {
      const log = db.usageLogs.find(l => l.patientName && l.patientName.trim().toLowerCase() === clean);
      if (log) {
        const generated = {
          id: log.patientId || this.generateUniquePatientId(),
          name: log.patientName.trim(),
          gender: log.patientGender || "Male"
        };
        return this.enrichPatient(generated);
      }
    }

    return null;
  }

  getPatientById(patientId) {
    if (!patientId) return null;
    const db = this.getDb();
    let found = (db.patients || []).find(p => p.id === patientId);
    if (!found) {
      const log = (db.usageLogs || []).find(l => l.patientId === patientId);
      if (log) {
        found = {
          id: patientId,
          name: log.patientName,
          gender: log.patientGender
        };
      }
    }
    return found ? this.enrichPatient(found) : null;
  }

  // Enriches patient record with operations history and latest metrics
  enrichPatient(patient) {
    const db = this.getDb();
    const logs = (db.usageLogs || [])
      .filter(l => (l.patientId && l.patientId === patient.id) || (!l.patientId && l.patientName && l.patientName.trim().toLowerCase() === patient.name.trim().toLowerCase()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

    return {
      ...patient,
      operations: logs,
      operationsCount: logs.length,
      lastAge: latestLog ? latestLog.patientAge : null,
      lastSpecialist: latestLog ? latestLog.specialistCare : null,
      lastBed: latestLog ? latestLog.bedNumber : null,
      lastProcedure: latestLog ? latestLog.procedureName : null,
      lastDate: latestLog ? latestLog.date : null
    };
  }

  // Get all registered patients for the Patient Profiles Explorer
  getAllPatients(searchQuery = "") {
    const db = this.getDb();
    const patientMap = new Map();

    // From patients table
    (db.patients || []).forEach(p => {
      patientMap.set(p.id, this.enrichPatient(p));
    });

    // From usage logs (for any logs that created a patient)
    (db.usageLogs || []).forEach(l => {
      const pId = l.patientId || `pat-${l.patientName.trim().toLowerCase()}`;
      if (!patientMap.has(pId)) {
        patientMap.set(pId, this.enrichPatient({
          id: l.patientId || this.generateUniquePatientId(),
          name: l.patientName,
          gender: l.patientGender
        }));
      }
    });

    let list = Array.from(patientMap.values());

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.lastSpecialist && p.lastSpecialist.toLowerCase().includes(q)) ||
        (p.lastProcedure && p.lastProcedure.toLowerCase().includes(q))
      );
    }

    // Sort by most recently operated first
    return list.sort((a, b) => {
      const dateA = a.lastDate ? new Date(a.lastDate).getTime() : 0;
      const dateB = b.lastDate ? new Date(b.lastDate).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Chronological Age Validation Engine
  // Checks age constraints against all historical operations for the patient
  getAgeBoundsForDate(patientId, targetDateStr) {
    const patient = this.getPatientById(patientId);
    if (!patient || !patient.operations || patient.operations.length === 0) {
      return { minAge: 0, maxAge: 150, minReferenceOp: null, maxReferenceOp: null, hasRestrictions: false };
    }

    const targetDate = new Date(targetDateStr).getTime();
    let minAge = 0;
    let maxAge = 150;
    let minReferenceOp = null;
    let maxReferenceOp = null;

    // Filter operations that have valid recorded ages
    const validOps = patient.operations
      .filter(op => op.patientAge !== null && !isNaN(parseInt(op.patientAge, 10)))
      .map(op => ({
        ...op,
        age: parseInt(op.patientAge, 10),
        time: new Date(op.date).getTime()
      }))
      .sort((a, b) => a.time - b.time);

    // 1. Minimum allowed age: Look at all operations before or on targetDate
    // The patient cannot be younger than at any previous operation!
    const priorOps = validOps.filter(op => op.time <= targetDate);
    if (priorOps.length > 0) {
      minAge = Math.max(...priorOps.map(o => o.age));
      minReferenceOp = priorOps.slice().reverse().find(o => o.age === minAge) || priorOps[priorOps.length - 1];
    }

    // 2. Maximum allowed age: Look at all operations after or on targetDate
    // The patient cannot be older than at any subsequent operation!
    const subsequentOps = validOps.filter(op => op.time >= targetDate);
    if (subsequentOps.length > 0) {
      maxAge = Math.min(...subsequentOps.map(o => o.age));
      maxReferenceOp = subsequentOps.find(o => o.age === maxAge) || subsequentOps[0];
    }

    return {
      minAge,
      maxAge,
      minReferenceOp,
      maxReferenceOp,
      hasRestrictions: minReferenceOp !== null || maxReferenceOp !== null
    };
  }

  // Validate patient age for a target operation date
  validatePatientAge(patientId, targetDateStr, inputAge) {
    if (!patientId || inputAge === null || inputAge === undefined || isNaN(inputAge)) return true;
    const age = parseInt(inputAge, 10);
    const bounds = this.getAgeBoundsForDate(patientId, targetDateStr);

    if (bounds.minReferenceOp && age < bounds.minAge) {
      throw new Error(
        `Chronological Age Violation: Patient was recorded as age ${bounds.minAge} on prior surgery (${bounds.minReferenceOp.date}). For operation on ${targetDateStr}, age cannot be less than ${bounds.minAge}.`
      );
    }

    if (bounds.maxReferenceOp && age > bounds.maxAge) {
      throw new Error(
        `Chronological Age Violation: Patient was recorded as age ${bounds.maxAge} on a later surgery (${bounds.maxReferenceOp.date}). For operation on ${targetDateStr}, age cannot be greater than ${bounds.maxAge}.`
      );
    }

    return true;
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
      let variant = this.findVariant(item, selectedAttributes);
      if (!variant) {
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
      message: `${this.auth.getCurrentUser().fullName} refilled ${item.name}${specText} by +${added} ${item.unit}. Available in storage for this specification: ${variantTotal} ${item.unit}.${note ? ` (Note: ${note})` : ''}`,
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

  // --- Surgical Consumption Submission with Smart Patient Linking & Chronological Age Check ---
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

    const opDate = report.operationDate || new Date().toISOString().split("T")[0];

    // Determine or generate unique Patient ID
    let patientId = report.patientId;
    if (!patientId) {
      // Check if existing patient matches name
      const existing = this.findPatientByName(report.patientName);
      if (existing) {
        patientId = existing.id;
      } else {
        patientId = this.generateUniquePatientId();
      }
    }

    // Chronological Age Validation against historical surgeries
    if (report.patientAge) {
      this.validatePatientAge(patientId, opDate, report.patientAge);
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

    // Update / Register Patient Profile in db.patients
    if (!db.patients) db.patients = [];
    let patientRecord = db.patients.find(p => p.id === patientId);
    if (!patientRecord) {
      patientRecord = {
        id: patientId,
        name: report.patientName.trim(),
        gender: report.patientGender || "Male",
        createdAt: new Date().toISOString()
      };
      db.patients.push(patientRecord);
    } else {
      patientRecord.name = report.patientName.trim();
      patientRecord.gender = report.patientGender || patientRecord.gender;
      patientRecord.updatedAt = new Date().toISOString();
    }

    // Record immutable surgical log
    if (!db.usageLogs) db.usageLogs = [];

    const logEntry = {
      id: "log-" + Date.now().toString(36),
      patientId: patientId,
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

    await this.saveDb(db, `Surgical consumption: ${report.patientName} (${patientId})`);
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

    if (filters.patientId) {
      logs = logs.filter(log => log.patientId === filters.patientId);
    }
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
        (log.patientName && log.patientName.toLowerCase().includes(q)) ||
        (log.patientId && log.patientId.toLowerCase().includes(q)) ||
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
