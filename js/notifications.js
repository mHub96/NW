/**
 * NeuroWare Notification System
 * Multi-layer Push Engine:
 * 1. OS-level native Web Push via Service Worker (Apple APNs on iOS 16.4+ and Google FCM)
 * 2. Instant zero-latency hospital push channel (ntfy.sh pub-sub & SSE)
 * 3. Continuous background cloud synchronization & visibility wake
 * 4. In-app synthesized iOS audio chime feedback & toast banners
 */

class NotificationManager {
  constructor(getDb, saveDb, authManager) {
    this.getDb = getDb;
    this.saveDb = saveDb;
    this.auth = authManager;
    this.audioContext = null;
    this.soundEnabled = true;

    // Load persistently seen notification IDs to prevent repeat ringing on reload
    this.seenNotifIds = new Set();
    try {
      const stored = localStorage.getItem("neuroware_seen_notif_ids");
      if (stored) {
        JSON.parse(stored).forEach(id => this.seenNotifIds.add(id));
      }
    } catch (e) {}

    // 1. Listen for new local notifications (created by inventory actions/refills/low-stock/auth)
    window.addEventListener("neuroware:new_notification", (e) => {
      if (e && e.detail) {
        this.markIdAsSeen(e.detail.id);
        this.handleIncomingNotification(e.detail);
      }
    });

    // 2. Listen for cloud database syncs (picked up by background polling & visibility checks)
    window.addEventListener("neuroware:data_synced", (e) => {
      const cloudData = e.detail;
      if (cloudData && Array.isArray(cloudData.notifications)) {
        this.handleCloudSyncedNotifications(cloudData.notifications);
      }
    });

    // 3. Connect to instant hospital pager SSE stream
    this.connectInstantChannel();

    // 4. Auto-check permission status & register Web Push if already granted
    this.checkPermissionStatus();
    if (this.hasPermission()) {
      this.subscribeToWebPush().catch(() => {});
    }
  }

  markIdAsSeen(id) {
    if (!id) return;
    this.seenNotifIds.add(id);
    try {
      const arr = Array.from(this.seenNotifIds).slice(-200); // Retain last 200 IDs
      localStorage.setItem("neuroware_seen_notif_ids", JSON.stringify(arr));
    } catch (e) {}
  }

  // Connect to instant push channel (SSE) for real-time multi-device sync
  connectInstantChannel() {
    if (typeof EventSource === "undefined") return;
    try {
      const server = window.NEURO_CONFIG?.PUSH_CHANNELS?.NTFY_SERVER || "https://ntfy.sh";
      const topic = window.NEURO_CONFIG?.PUSH_CHANNELS?.DEFAULT_TOPIC || "neuroware-alerts-mhub96";
      const sseUrl = `${server}/${topic}/sse`;

      const sse = new EventSource(sseUrl);
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === "message") {
            // Immediately force a cloud sync to pick up the new records
            if (window.NW?.storage) {
              window.NW.storage.forceSync();
            }
          }
        } catch (e) {}
      };
      this.instantChannelSse = sse;
    } catch (e) {
      console.warn("Could not connect to instant push channel SSE:", e);
    }
  }

  // Check pending unseen notifications for current user (e.g. right after login or app launch)
  checkPendingUnseenNotifications() {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const db = this.getDb();
    if (!db || !Array.isArray(db.notifications)) return;

    const isAdmin = this.auth.isAdmin();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    for (const notif of db.notifications) {
      if (this.seenNotifIds.has(notif.id)) continue;

      const notifTime = new Date(notif.timestamp).getTime();
      if (now - notifTime > twentyFourHours) {
        this.markIdAsSeen(notif.id);
        continue;
      }

      // Check role permissions
      if (notif.type === "signup_request" && !isAdmin) {
        continue;
      }
      if (notif.targetRoles && !notif.targetRoles.includes(user.role)) {
        continue;
      }
      if (notif.targetUsers && !notif.targetUsers.includes(user.username)) {
        continue;
      }

      const readBy = notif.readBy || [];
      if (!readBy.includes(user.username)) {
        this.markIdAsSeen(notif.id);
        this.handleIncomingNotification(notif);
      }
    }
    this.updateBadges();
  }

  handleCloudSyncedNotifications(notifications) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return;
    const isAdmin = this.auth.isAdmin();

    // Check newly synced notifications that arrived from other users / admins
    for (const notif of notifications) {
      if (!this.seenNotifIds.has(notif.id)) {
        this.markIdAsSeen(notif.id);

        if (notif.type === "signup_request" && !isAdmin) continue;
        if (notif.targetRoles && !notif.targetRoles.includes(currentUser.role)) continue;
        if (notif.targetUsers && !notif.targetUsers.includes(currentUser.username)) continue;

        const readBy = notif.readBy || [];
        if (!readBy.includes(currentUser.username)) {
          this.handleIncomingNotification(notif);
        }
      }
    }
    this.updateBadges();
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
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        alert("On iPhone, push notifications require adding NeuroWare to your Home Screen.\n\n1. Tap the Share icon (⬆️) in Safari\n2. Tap 'Add to Home Screen'\n3. Open NeuroWare from your Home Screen.");
      } else {
        alert("Push notifications are not supported in this browser.");
      }
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await this.subscribeToWebPush();
        await this.sendPushNotification({
          id: "push-perm-active-" + Date.now(),
          title: "🔔 Push Notifications Active",
          message: "NeuroWare will now deliver shift alarms, refills, and low-stock alerts directly to your phone.",
          priority: "normal"
        });
        this.updateBadges();
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Permission request error:", err);
      return false;
    }
  }

  // Convert VAPID key to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Subscribe device to native W3C Web Push (Apple APNs / Google FCM)
  async subscribeToWebPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = window.NEURO_CONFIG?.VAPID_PUBLIC_KEY;
      if (!vapidKey) return null;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(vapidKey)
        });
      }

      if (sub) {
        await this.registerPushSubscriptionOnServer(sub);
      }
      return sub;
    } catch (e) {
      console.warn("Web Push registration note:", e);
      return null;
    }
  }

  // Save device push subscription to cloud database (data.json)
  async registerPushSubscriptionOnServer(sub) {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return;
    const db = this.getDb();
    if (!db) return;
    if (!db.pushSubscriptions) db.pushSubscriptions = [];

    const subJson = sub.toJSON();
    const endpoint = subJson.endpoint;
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) return;

    const existingIdx = db.pushSubscriptions.findIndex(s => s.endpoint === endpoint);
    const subRecord = {
      endpoint: endpoint,
      keys: { p256dh, auth },
      username: currentUser.username,
      role: currentUser.role,
      deviceId: this.auth.storage?.getDeviceId() || "unknown",
      platform: navigator.platform || "mobile",
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      db.pushSubscriptions[existingIdx] = subRecord;
    } else {
      db.pushSubscriptions.push(subRecord);
    }

    await this.saveDb(db, `Register push device for @${currentUser.username}`);
  }

  // Broadcast push notifications to external devices (instant hospital pager + GitHub Actions Web Push)
  async broadcastPushNotification(notif) {
    const storage = window.NW?.storage || this.auth?.storage;
    if (!storage) return;

    // 1. Instant hospital push channel (ntfy.sh pub-sub)
    if (typeof storage.broadcastToPushChannel === "function") {
      storage.broadcastToPushChannel(notif).catch(() => {});
    }

    // 2. Trigger GitHub Actions CI runner (delivers Apple APNs and Google FCM Web Push to sleeping phones)
    if (typeof storage.triggerCloudPushDispatch === "function") {
      storage.triggerCloudPushDispatch(notif).catch(() => {});
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
          try {
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
          } catch (iconErr) {
            // Some platforms reject SVG icons in notifications, fallback without icon
            await registration.showNotification(title, {
              body: body,
              vibrate: [250, 100, 250],
              tag: tag,
              renotify: true
            });
            return;
          }
        }
      } catch (swErr) {
        console.warn("ServiceWorker showNotification note:", swErr);
      }
    }

    // 2. Direct Notification API Fallback
    try {
      try {
        new Notification(title, {
          body: body,
          icon: "./assets/icon.svg",
          badge: "./assets/icon.svg",
          vibrate: [250, 100, 250],
          tag: tag
        });
      } catch (e1) {
        new Notification(title, {
          body: body,
          tag: tag
        });
      }
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

    const testNotif = {
      id: "test-push-" + Date.now(),
      title: "🧠 NeuroWare Phone Alert",
      message: "Test push notification delivered successfully! Live shift, refill, and registration updates will ring on this phone.",
      priority: "normal",
      type: "system"
    };

    // 1. Deliver local alert
    await this.sendPushNotification(testNotif);

    // 2. Broadcast test alert across cloud channels
    await this.broadcastPushNotification(testNotif);
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

if (typeof window !== "undefined") {
  window.NotificationManager = NotificationManager;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = NotificationManager;
}
