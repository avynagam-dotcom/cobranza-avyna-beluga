"use strict";

const fs = require("fs");
const path = require("path");

// Configuration
// Use process.env.DATA_DIR or default to a safe location (e.g. /var/data/cobranza/beluga)
// IMPORTANT: We must ensure this matches what server.js uses.
// Ideally, server.js initializes this and passes it, or we rely on the same env var.
const DEFAULT_DATA_DIR = "/var/data/cobranza/beluga";
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
const AUDIT_FILE = path.join(DATA_DIR, "audit.jsonl");

// Ensure DATA_DIR exists is the responsibility of the caller (server.js startup),
// but we can safeguard here for write operations.
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Appends an entry to the audit log.
 * @param {string} action - 'WRITE', 'DELETE', etc.
 * @param {string} filename - The file being affected.
 * @param {object} details - Extra info (size, status).
 */
function logAudit(action, filename, details = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      file: filename,
      ...details,
    };
    // Ensure audit file directory exists
    ensureDir(path.dirname(AUDIT_FILE));
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[Persistence] Audit Log Failed:", err.message);
  }
}

/**
 * Atomically saves data to a file.
 * 1. Writes to .tmp file
 * 2. Validates .tmp file size > 0
 * 3. Renames .tmp to target file
 * @param {string} filePath - Absolute path to the file.
 * @param {string|Buffer} data - Content to write.
 */
function saveData(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  
  try {
    ensureDir(path.dirname(filePath));
    
    // 1. Write to temp file
    fs.writeFileSync(tempPath, data);
    
    // 2. Validate integrity
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
      throw new Error("File write resulted in 0 bytes");
    }
    
    // 3. Atomic rename
    fs.renameSync(tempPath, filePath);
    
    // 4. Audit
    logAudit("WRITE", path.basename(filePath), { size: stats.size, success: true });
    
  } catch (err) {
    console.error(`[Persistence] Failed to save ${path.basename(filePath)}:`, err.message);
    logAudit("WRITE_ERROR", path.basename(filePath), { error: err.message });
    
    // Cleanup temp file if it exists
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    }
    
    throw err; // Re-throw so the caller knows it failed
  }
}

module.exports = {
  saveData,
  logAudit, // Exported in case other modules need to log explicit actions
  DATA_DIR
};
