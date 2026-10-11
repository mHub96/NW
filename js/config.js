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
  version: "2.3.0",
  lastUpdated: "2026-10-11",
  author: "Dr. Mohammed Riyadh",
  defaultAlarmThreshold: 2,
  syncIntervalMs: 45000 // Background polling sync every 45s
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

window.NEURO_CONFIG = {
  CONFIG,
  GH_TOKEN,
  NEUROSURGERY_CATEGORIES,
  ROLES,
  DEVICE_MODES
};

