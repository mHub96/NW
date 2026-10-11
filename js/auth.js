/**
 * NeuroWare Authentication & Access Control System
 * Role-Based Access Control (OWNER, ADMIN, REGULAR)
 * Sign-Up Approval Workflow & Hardware Device Lock Engine
 */

class AuthManager {
  constructor(storageEngine, getDb, saveDb) {
    this.storage = storageEngine;
    this.getDb = getDb;
    this.saveDb = saveDb;
    this.sessionKey = "neuroware_active_user";
    this.currentUser = this.loadSession();
  }

  loadSession() {
    try {
      const raw = localStorage.getItem(this.sessionKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Session restore error", e);
    }
    return null;
  }

  saveSession(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(this.sessionKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.sessionKey);
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  isOwner() {
    return this.currentUser && this.currentUser.role === window.NEURO_CONFIG.ROLES.OWNER;
  }

  isAdmin() {
    return this.currentUser && (this.currentUser.role === window.NEURO_CONFIG.ROLES.ADMIN || this.currentUser.role === window.NEURO_CONFIG.ROLES.OWNER);
  }

  isRegular() {
    return this.currentUser && this.currentUser.role === window.NEURO_CONFIG.ROLES.REGULAR;
  }

  hashPassword(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return "h_" + Math.abs(hash).toString(16);
  }

  async login(username, password) {
    const db = this.getDb();
    if (!db || !db.users) {
      throw new Error("User database is not loaded yet.");
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = db.users.find(u => u.username.toLowerCase() === cleanUsername);

    if (!user) {
      throw new Error("Invalid username or password.");
    }

    const valid = (user.passwordPlain && user.passwordPlain === password) ||
                  (user.passwordHash && user.passwordHash === this.hashPassword(password));

    if (!valid) {
      throw new Error("Invalid username or password.");
    }

    if (user.status === "pending") {
      throw new Error("Account Pending Approval: The Storage Director (Admin/Owner) must review and approve your registration before you can log in.");
    }

    if (user.status === "rejected") {
      throw new Error("Account Access Denied: Your registration request was rejected by the inventory administration.");
    }

    // Device Lock Enforcement
    const currentDevice = this.storage.initDeviceFingerprint();
    const currentDeviceId = currentDevice.id;
    if (!user.registeredDevices) user.registeredDevices = [];

    const isDeviceKnown = user.registeredDevices.some(d => d.id === currentDeviceId);
    const limit = user.deviceLimit;

    if (isDeviceKnown) {
      const devObj = user.registeredDevices.find(d => d.id === currentDeviceId);
      if (devObj) {
        devObj.lastActive = new Date().toISOString();
        devObj.name = currentDevice.name;
      }
    } else {
      if (limit === "unlimited") {
        user.registeredDevices.push({
          id: currentDeviceId,
          name: currentDevice.name,
          platform: currentDevice.platform,
          registeredAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        });
      } else {
        const allowedCount = parseInt(limit, 10) || 1;
        if (user.registeredDevices.length < allowedCount) {
          user.registeredDevices.push({
            id: currentDeviceId,
            name: currentDevice.name,
            platform: currentDevice.platform,
            registeredAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
          });
        } else {
          const registeredList = user.registeredDevices.map(d => `• ${d.name} (Registered: ${new Date(d.registeredAt).toLocaleDateString()})`).join("\n");
          throw new Error(
            `Device Lock Active! This account is restricted to ${allowedCount} authorized device(s).\n\n` +
            `Currently registered device(s):\n${registeredList}\n\n` +
            `You are attempting to access from a new device: "${currentDevice.name}".\n` +
            `Please contact an Administrator or Owner to reset your authorized devices.`
          );
        }
      }
    }

    await this.saveDb(db, `User login and device check: @${user.username}`);

    const sessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      phone: user.phone,
      deviceLimit: user.deviceLimit,
      currentDeviceId: currentDeviceId
    };

    this.saveSession(sessionUser);
    return sessionUser;
  }

  async signup(data) {
    const db = this.getDb();
    if (!db.users) db.users = [];

    const cleanUsername = data.username.trim().toLowerCase();
    const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername);
    if (existing) {
      throw new Error(`Username "@${cleanUsername}" is already taken. Please choose another.`);
    }

    const currentDevice = this.storage.initDeviceFingerprint();

    const newUser = {
      id: "usr-" + Date.now().toString(36),
      username: cleanUsername,
      passwordPlain: data.password,
      passwordHash: this.hashPassword(data.password),
      fullName: data.fullName.trim(),
      role: window.NEURO_CONFIG.ROLES.REGULAR,
      status: "pending",
      deviceLimit: 1,
      registeredDevices: [
        {
          id: currentDevice.id,
          name: currentDevice.name,
          platform: currentDevice.platform,
          registeredAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        }
      ],
      phone: data.phone ? data.phone.trim() : "",
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);

    if (!db.notifications) db.notifications = [];
    const notif = {
      id: "notif-" + Date.now().toString(36),
      type: "signup_request",
      priority: "warning",
      title: "New Sign-up Request: " + newUser.fullName,
      message: `Staff ${newUser.fullName} (@${newUser.username}) requested registration. Needs approval and device limit review.`,
      timestamp: new Date().toISOString(),
      targetRoles: [window.NEURO_CONFIG.ROLES.OWNER, window.NEURO_CONFIG.ROLES.ADMIN],
      readBy: [],
      metadata: {
        userId: newUser.id,
        username: newUser.username
      }
    };
    db.notifications.unshift(notif);

    await this.saveDb(db, `New registration request: @${newUser.username}`);

    // Immediately dispatch local event and broadcast cloud push to admins/owner
    window.dispatchEvent(new CustomEvent("neuroware:new_notification", { detail: notif }));
    if (window.NW?.notifications) {
      window.NW.notifications.broadcastPushNotification(notif);
    }
    return newUser;
  }

  async approveUser(userId, role, deviceLimit) {
    if (!this.isAdmin()) throw new Error("Only Managers (Owner/Admin) can approve users.");
    const db = this.getDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found.");

    user.status = "approved";
    if (role) user.role = role;
    if (deviceLimit !== undefined) user.deviceLimit = deviceLimit;

    const notif = {
      id: "notif-" + Date.now().toString(36),
      type: "user_approved",
      priority: "normal",
      title: "User Approved: " + user.fullName,
      message: `${user.fullName} (@${user.username}) was approved as ${user.role} with ${user.deviceLimit === 'unlimited' ? 'unlimited devices' : user.deviceLimit + ' device limit'} by ${this.currentUser.fullName}.`,
      timestamp: new Date().toISOString(),
      targetUsers: [user.username],
      readBy: [this.currentUser.username],
      metadata: { userId: user.id }
    };
    db.notifications.unshift(notif);

    await this.saveDb(db, `Approved user: @${user.username} as ${user.role}`);

    window.dispatchEvent(new CustomEvent("neuroware:new_notification", { detail: notif }));
    if (window.NW?.notifications) {
      window.NW.notifications.broadcastPushNotification(notif);
    }
    return user;
  }

  async rejectUser(userId, reason = "Rejected by administration") {
    if (!this.isAdmin()) throw new Error("Only Managers (Owner/Admin) can reject users.");
    const db = this.getDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found.");

    user.status = "rejected";
    user.rejectReason = reason;

    await this.saveDb(db, `Rejected user: @${user.username}`);
    return user;
  }

  // Update user access: Owner and Admin can edit user parameters
  // When Owner edits, can also edit username, fullName, phone, role, device limit, password
  async updateUserAccess(userId, updates) {
    if (!this.isAdmin()) throw new Error("Unauthorized.");
    const db = this.getDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found.");

    if (updates.role && updates.role === window.NEURO_CONFIG.ROLES.OWNER && !this.isOwner()) {
      throw new Error("Only the Storage OWNER can assign the OWNER role.");
    }

    // Editable Full Name
    if (updates.fullName !== undefined && updates.fullName.trim()) {
      user.fullName = updates.fullName.trim();
    }

    // Editable Username (with uniqueness check)
    if (updates.username !== undefined && updates.username.trim()) {
      const cleanNewUser = updates.username.trim().toLowerCase();
      if (cleanNewUser !== user.username.toLowerCase()) {
        const conflict = db.users.find(u => u.id !== userId && u.username.toLowerCase() === cleanNewUser);
        if (conflict) {
          throw new Error(`Username "@${cleanNewUser}" is already taken by another user.`);
        }
        user.username = cleanNewUser;
      }
    }

    if (updates.phone !== undefined) {
      user.phone = updates.phone.trim();
    }

    if (updates.role) user.role = updates.role;
    if (updates.deviceLimit !== undefined) user.deviceLimit = updates.deviceLimit;
    if (updates.passwordPlain && updates.passwordPlain.trim()) {
      user.passwordPlain = updates.passwordPlain.trim();
      user.passwordHash = this.hashPassword(user.passwordPlain);
    }

    // If active session belongs to this user, update session details
    if (this.currentUser && this.currentUser.id === user.id) {
      this.currentUser.fullName = user.fullName;
      this.currentUser.username = user.username;
      this.currentUser.role = user.role;
      this.currentUser.deviceLimit = user.deviceLimit;
      this.saveSession(this.currentUser);
    }

    await this.saveDb(db, `Updated user profile and access: @${user.username}`);
    return user;
  }

  async resetUserDevices(userId) {
    if (!this.isAdmin()) throw new Error("Only Managers can reset registered devices.");
    const db = this.getDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found.");

    user.registeredDevices = [];
    await this.saveDb(db, `Reset registered devices for @${user.username}`);
    return user;
  }

  async deleteUser(userId) {
    if (!this.isAdmin()) throw new Error("Unauthorized.");
    const db = this.getDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found.");

    const targetUser = db.users[userIndex];
    if (targetUser.role === window.NEURO_CONFIG.ROLES.OWNER) {
      throw new Error("Cannot delete the Storage OWNER account.");
    }

    db.users.splice(userIndex, 1);
    await this.saveDb(db, `Deleted user @${targetUser.username}`);
    return true;
  }

  logout() {
    this.saveSession(null);
  }
}

window.AuthManager = AuthManager;
