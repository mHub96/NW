/**
 * NeuroWare Notification System
 * In-app notification center, real-time toast alerts, badge management,
 * and synthesized iOS audio chime feedback
 */

class NotificationManager {
  constructor(getDb, saveDb, authManager) {
    this.getDb = getDb;
    this.saveDb = saveDb;
    this.auth = authManager;
    this.audioContext = null;
    this.soundEnabled = true;

    // Auto-prompt or check notification permissions
    this.checkPermissionStatus();
  }

  // Check if browser supports and has granted push notification permission
  hasPermission() {
    return ("Notification" in window) && Notification.permission === "granted";
  }

  checkPermissionStatus() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission; // 'granted', 'denied', 'default'
  }

  // Prompt user for push notification permission
  async requestPermission() {
    if (!("Notification" in window)) {
      alert("Push notifications are not supported by this browser.");
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await this.sendPushNotification({
          id: "push-perm-test",
          title: "🔔 Push Notifications Active",
          message: "NeuroWare will deliver shift alarms, refills, and low-stock alerts even when closed.",
          priority: "normal"
        });
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Permission request error:", err);
      return false;
    }
  }

  // Send system push notification via Service Worker (triggers even if tab closed/minimized)
  async sendPushNotification(notif) {
    if (!this.hasPermission()) return;

    const title = notif.title || "NeuroWare Alert";
    const body = notif.message || "Neurosurgical inventory update";
    const tag = notif.id || ("nw-alert-" + Date.now());

    // 1. Try Service Worker showNotification first (native OS Push)
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, {
            body: body,
            icon: "./assets/icon.svg",
            badge: "./assets/icon.svg",
            vibrate: [250, 100, 250],
            tag: tag,
            renotify: true,
            data: {
              url: "./",
              id: notif.id,
              timestamp: Date.now()
            }
          });
          return;
        }
      } catch (swErr) {
        console.warn("ServiceWorker showNotification note:", swErr);
      }
    }

    // 2. Fallback to desktop Notification API
    try {
      new Notification(title, {
        body: body,
        icon: "./assets/icon.svg",
        badge: "./assets/icon.svg",
        vibrate: [250, 100, 250],
        tag: tag
      });
    } catch (e) {
      console.warn("Desktop notification fallback note:", e);
    }
  }

  // User-facing test trigger for settings
  async testPushNotification() {
    if (!this.hasPermission()) {
      const granted = await this.requestPermission();
      if (!granted) {
        alert("Push notifications were not granted. Please allow notification permission in your browser settings.");
        return;
      }
    }

    await this.sendPushNotification({
      id: "test-push-" + Date.now(),
      title: "🧠 NeuroWare Push Test",
      message: "OS Push notification delivered successfully! You will receive live shift and inventory updates.",
      priority: "normal"
    });
  }

  handleIncomingNotification(notif) {
    this.playChime(notif.priority);
    this.showToast(notif);
    this.updateBadges();
    this.sendPushNotification(notif);
  }
  playChime(type = "normal") {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (!this.audioContext || this.audioContext.state === "suspended") {
        this.audioContext?.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "critical") {
        // Double alert tone for low/out of stock
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        // Pleasant Apple-like chime for refills and approvals
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (e) {
      // Audio might be blocked before first user gesture
    }
  }

  handleIncomingNotification(notif) {
    this.playChime(notif.priority);
    this.showToast(notif);
    this.updateBadges();
  }

  // Show floating iOS toast alert banner
  showToast(notif) {
    const container = document.getElementById("iosToastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `ios-toast-banner ${notif.priority || 'normal'}`;
    
    let iconSvg = '';
    if (notif.type === 'refill') {
      iconSvg = '<svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>';
    } else if (notif.type === 'low_stock' || notif.type === 'out_of_stock') {
      iconSvg = '<svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    } else {
      iconSvg = '<svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon-wrap">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${notif.title}</div>
        <div class="toast-msg">${notif.message}</div>
      </div>
      <button class="toast-close-btn" aria-label="Close">&times;</button>
    `;

    toast.querySelector(".toast-close-btn").addEventListener("click", () => {
      toast.classList.add("dismiss");
      setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    // Auto dismiss after 6 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("dismiss");
        setTimeout(() => toast.remove(), 250);
      }
    }, 6000);
  }

  // Get notifications filtered for current user and role
  getNotifications(category = "all") {
    const db = this.getDb();
    if (!db || !db.notifications) return [];
    const currentUser = this.auth.getCurrentUser();
    const isAdmin = this.auth.isAdmin();

    let list = db.notifications.filter(n => {
      // If notification is signup_request, only show to admins/owner
      if (n.type === "signup_request" && !isAdmin) return false;
      return true;
    });

    if (category === "stock") {
      list = list.filter(n => n.type === "low_stock" || n.type === "out_of_stock");
    } else if (category === "refill") {
      list = list.filter(n => n.type === "refill");
    } else if (category === "requests") {
      list = list.filter(n => n.type === "signup_request");
    }

    return list.map(n => {
      const isRead = currentUser && n.readBy && n.readBy.includes(currentUser.username);
      return {
        ...n,
        isRead
      };
    });
  }

  // Get unread count for current logged-in user
  getUnreadCount() {
    const list = this.getNotifications("all");
    return list.filter(n => !n.isRead).length;
  }

  // Mark a single notification as read
  async markAsRead(notifId) {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const db = this.getDb();
    const notif = db.notifications.find(n => n.id === notifId);
    if (!notif) return;

    if (!notif.readBy) notif.readBy = [];
    if (!notif.readBy.includes(user.username)) {
      notif.readBy.push(user.username);
      await this.saveDb(db, `Marked notification as read: ${notif.title}`);
      this.updateBadges();
    }
  }

  // Mark all notifications as read for current user
  async markAllAsRead() {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const db = this.getDb();
    if (!db.notifications) return;

    let modified = false;
    db.notifications.forEach(n => {
      if (!n.readBy) n.readBy = [];
      if (!n.readBy.includes(user.username)) {
        n.readBy.push(user.username);
        modified = true;
      }
    });

    if (modified) {
      await this.saveDb(db, `Marked all notifications as read by @${user.username}`);
      this.updateBadges();
    }
  }

  // Update badge UI across tab bar and top bar
  updateBadges() {
    const count = this.getUnreadCount();
    const badgeElements = document.querySelectorAll(".notif-badge");
    badgeElements.forEach(el => {
      if (count > 0) {
        el.textContent = count > 99 ? "99+" : count;
        el.style.display = "inline-flex";
      } else {
        el.style.display = "none";
      }
    });

    // Also update pending user badge for Admin/Owner
    const db = this.getDb();
    const pendingUsers = db?.users?.filter(u => u.status === "pending") || [];
    const pendingBadgeEls = document.querySelectorAll(".pending-users-badge");
    pendingBadgeEls.forEach(el => {
      if (this.auth.isAdmin() && pendingUsers.length > 0) {
        el.textContent = pendingUsers.length;
        el.style.display = "inline-flex";
      } else {
        el.style.display = "none";
      }
    });
  }
}

window.NotificationManager = NotificationManager;

