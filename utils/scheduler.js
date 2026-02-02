"use strict";

const cron = require("node-cron");
const runBackup = require("../scripts/backup");

function initScheduler() {
    console.log("[Scheduler] ⏳ Inicializando sistema de cron jobs...");

    // Programación: Todos los días a las 09:00 UTC
    // '0 9 * * *' => minuto 0, hora 9
    cron.schedule("0 9 * * *", async () => {
        console.log("[Scheduler] 🕘 Ejecutando backup programado (09:00 UTC)...");
        try {
            await runBackup();
        } catch (error) {
            console.error("[Scheduler] ❌ Error en backup programado:", error.message);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log("✅ Scheduler activo (Backup: 09:00 UTC).");
}

module.exports = { initScheduler };
