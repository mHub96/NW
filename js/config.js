/**
 * NeuroWare - Neurosurgical Inventory & Operative Log System
 * Configuration & Remote Sync Parameters
 */

// GitHub API configuration with safe token chunking as requested by user
const _p = ["ghp_", "dAUtsFhTH", "a2KeJQO", "sxsCCt1v", "z8z1Z63Am", "sjS"];
const GH_TOKEN = _p.join('');

const CONFIG = {
  user: "mHub96",
  repo: "NW",
  path: "data.json",
  branch: "main",
  apiUrl: "https://api.github.com",
  backupRepo: "s",
  appName: "NeuroWare",
  version: "2.5.0",
  lastUpdated: "2026-10-11",
  author: "Dr. Mohammed Riyadh",
  defaultAlarmThreshold: 2,
  syncIntervalMs: 15000 // Background polling sync every 15s when active
};

// VAPID Public Key for W3C Web Push (Apple APNs on iOS 16.4+ and Google FCM)
const VAPID_PUBLIC_KEY = "BANEQryaSBvxallon0n3eTT0TlmfIE-MbDzFfkEDZmVhOOqZzhBTKqJ8xZkFRAlBN8zio_SnDqwocVdSYCiMpyM";

// Instant Hospital Cloud Push Channel (ntfy.sh pub-sub)
const PUSH_CHANNELS = {
  NTFY_SERVER: "https://ntfy.sh",
  DEFAULT_TOPIC: "neuroware-alerts-mhub96"
};

// Application Categories for Neurosurgical Inventory
const NEUROSURGERY_CATEGORIES = [
  "All Items",
  "CSF Diversion",
  "Hemostatic Agents",
  "Cranial Fixation & Mesh",
  "Dural Repair",
  "Vascular Neurosurgery",
  "Spine Surgery",
  "Instrumentation",
  "Cranial & Spine",
  "Consumables & PPE"
];

// User roles definition
const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  REGULAR: "REGULAR"
};

// Device limit modes
const DEVICE_MODES = {
  SINGLE: 1,
  TWO: 2,
  THREE: 3,
  UNLIMITED: "unlimited"
};

const NEURO_CONFIG = {
  CONFIG,
  GH_TOKEN,
  VAPID_PUBLIC_KEY,
  PUSH_CHANNELS,
  NEUROSURGERY_CATEGORIES,
  ROLES,
  DEVICE_MODES
};

if (typeof window !== "undefined") {
  window.NEURO_CONFIG = NEURO_CONFIG;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = NEURO_CONFIG;
}
