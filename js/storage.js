/**
 * NeuroWare Storage & GitHub Cloud Synchronization Engine
 * Handles LocalStorage caching, device fingerprinting, and GitHub REST API sync
 */

class StorageEngine {
  constructor() {
    this.config = window.NEURO_CONFIG.CONFIG;
    this.token = window.NEURO_CONFIG.GH_TOKEN;
    this.storageKey = "neuroware_db";
    this.deviceKey = "neuroware_device_info";
    this.currentSha = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncStatus = "idle"; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
    this.statusListeners = [];
    this.deviceInfo = this.initDeviceFingerprint();
  }

  // Generate or retrieve persistent unique device fingerprint
  initDeviceFingerprint() {
    let stored = null;
    try {
      const raw = localStorage.getItem(this.deviceKey);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {
      console.warn("Could not read device info from localStorage", e);
    }

    if (stored && stored.id) {
      stored.lastSeen = new Date().toISOString();
      try {
        localStorage.setItem(this.deviceKey, JSON.stringify(stored));
      } catch (e) {}
      return stored;
    }

    // Generate new unique device ID
    const deviceId = "dev-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
    const ua = navigator.userAgent;
    let deviceName = "Unknown Device";

    if (/iPhone/i.test(ua)) deviceName = "Apple iPhone (iOS Safari)";
    else if (/iPad/i.test(ua)) deviceName = "Apple iPad (iPadOS)";
    else if (/Android/i.test(ua)) deviceName = "Android Mobile";
    else if (/Macintosh/i.test(ua)) deviceName = "Apple Mac (macOS)";
    else if (/Windows/i.test(ua)) deviceName = "Windows PC (Desktop)";
    else if (/Linux/i.test(ua)) deviceName = "Linux Workstation";

    const screenRes = `${window.screen?.width || 0}x${window.screen?.height || 0}`;
    const newDevice = {
      id: deviceId,
      name: deviceName,
      screen: screenRes,
      platform: navigator.platform || "Web",
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    try {
      localStorage.setItem(this.deviceKey, JSON.stringify(newDevice));
    } catch (e) {}
    return newDevice;
  }

  getDeviceId() {
    return this.deviceInfo.id;
  }

  getDeviceName() {
    return this.deviceInfo.name;
  }

  onSyncStatusChange(callback) {
    this.statusListeners.push(callback);
  }

  setSyncStatus(status, detail = "") {
    this.syncStatus = status;
    this.statusListeners.forEach(fn => fn(status, detail, this.lastSyncTime));
  }

  // Helper to encode string to UTF-8 Base64 (browser compatible)
  utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode('0x' + p1);
    }));
  }

  // Helper to decode Base64 to UTF-8
  base64ToUtf8(b64) {
    const raw = atob(b64.replace(/\s/g, ''));
    try {
      return decodeURIComponent(Array.prototype.map.call(raw, c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      return raw;
    }
  }

  // Load initial data (local first, then cloud sync)
  async loadDatabase() {
    let localData = this.getLocalDatabase();

    // If local storage is empty, try loading local data.json or fallback
    if (!localData) {
      try {
        const resp = await fetch("data.json");
        if (resp.ok) {
          localData = await resp.json();
          this.saveLocalDatabase(localData);
        }
      } catch (err) {
        console.warn("Local fetch of data.json failed, checking GitHub Cloud...", err);
      }
    }

    // Kick off background cloud fetch
    this.fetchFromGitHub()
      .then(cloudData => {
        if (cloudData) {
          // If cloud data is newer or local was empty, adopt cloud data
          this.saveLocalDatabase(cloudData);
          window.dispatchEvent(new CustomEvent("neuroware:data_synced", { detail: cloudData }));
        }
      })
      .catch(err => {
        console.warn("Initial GitHub fetch warning:", err);
      });

    return localData;
  }

  getLocalDatabase() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse local database", e);
    }
    return null;
  }

  saveLocalDatabase(data) {
    if (!data) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error("Local storage save error", e);
    }
  }

  // Fetch data.json from GitHub
  async fetchFromGitHub() {
    this.setSyncStatus("syncing", "Checking GitHub repository...");
    try {
      const url = `${this.config.apiUrl}/repos/${this.config.user}/${this.config.repo}/contents/${this.config.path}?ref=${this.config.branch}&t=${Date.now()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "NeuroWare-App"
        }
      });

      if (res.status === 404) {
        // File does not exist yet on repo main branch. Let's push initial commit from local
        console.log("data.json not found on GitHub repo. Preparing initial push...");
        const local = this.getLocalDatabase();
        if (local) {
          await this.commitToGitHub(local, "Initial commit: NeuroWare surgical inventory database");
        }
        this.setSyncStatus("synced", "Initialized on GitHub");
        return local;
      }

      if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}: ${res.statusText}`);
      }

      const fileInfo = await res.json();
      this.currentSha = fileInfo.sha;
      const contentJson = this.base64ToUtf8(fileInfo.content);
      const parsedData = JSON.parse(contentJson);

      this.lastSyncTime = new Date();
      this.setSyncStatus("synced", "Live Cloud Synced");
      return parsedData;
    } catch (error) {
      console.error("GitHub fetch failed:", error);
      this.setSyncStatus("offline", "Working offline (Local cache)");
      return null;
    }
  }

  // Commit updated database to GitHub with optimistic locking & SHA management
  async commitToGitHub(dbData, commitMessage = "Update neurosurgical inventory") {
    if (!dbData) return false;

    // Immediately save locally
    this.saveLocalDatabase(dbData);
    this.setSyncStatus("syncing", "Committing changes to cloud...");

    try {
      // Ensure we have current SHA if missing
      if (!this.currentSha) {
        try {
          const checkUrl = `${this.config.apiUrl}/repos/${this.config.user}/${this.config.repo}/contents/${this.config.path}?ref=${this.config.branch}&t=${Date.now()}`;
          const checkRes = await fetch(checkUrl, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "NeuroWare-App"
            }
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            this.currentSha = checkData.sha;
          }
        } catch (e) {}
      }

      // Update metadata timestamp
      if (dbData.meta) {
        dbData.meta.lastUpdated = new Date().toISOString();
      }

      const jsonString = JSON.stringify(dbData, null, 2);
      const base64Content = this.utf8ToBase64(jsonString);

      const putUrl = `${this.config.apiUrl}/repos/${this.config.user}/${this.config.repo}/contents/${this.config.path}`;
      const payload = {
        message: commitMessage,
        content: base64Content,
        branch: this.config.branch
      };

      if (this.currentSha) {
        payload.sha = this.currentSha;
      }

      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "NeuroWare-App"
        },
        body: JSON.stringify(payload)
      });

      if (!putRes.ok) {
        const errorJson = await putRes.json().catch(() => ({}));
        // If 409 Conflict, re-fetch SHA and retry once
        if (putRes.status === 409) {
          console.warn("SHA conflict on GitHub. Resolving with latest commit SHA...");
          const refetch = await this.fetchFromGitHub();
          if (refetch && this.currentSha) {
            payload.sha = this.currentSha;
            const retryRes = await fetch(putUrl, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify(payload)
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              this.currentSha = retryData.content.sha;
              this.lastSyncTime = new Date();
              this.setSyncStatus("synced", "Changes synced to GitHub");
              return true;
            }
          }
        }
        throw new Error(errorJson.message || `HTTP ${putRes.status}`);
      }

      const result = await putRes.json();
      this.currentSha = result.content?.sha || result.commit?.sha || null;
      this.lastSyncTime = new Date();
      this.setSyncStatus("synced", "Changes synced to GitHub");
      return true;
    } catch (err) {
      console.error("Failed to commit to GitHub:", err);
      this.setSyncStatus("error", "Sync pending (Saved locally)");
      return false;
    }
  }

  // Force manual cloud refresh
  async forceSync() {
    const cloud = await this.fetchFromGitHub();
    if (cloud) {
      this.saveLocalDatabase(cloud);
      window.dispatchEvent(new CustomEvent("neuroware:data_synced", { detail: cloud }));
      return { success: true, data: cloud };
    }
    return { success: false, data: this.getLocalDatabase() };
  }
}

window.StorageEngine = StorageEngine;

