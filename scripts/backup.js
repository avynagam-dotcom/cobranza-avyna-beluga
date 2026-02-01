"use strict";

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function runBackup() {
    // Identidad del sistema: default a 'beluga' para asegurar la carpeta correcta en R2
    const SYSTEM_NAME = process.env.SYSTEM_NAME || "beluga";

    const R2_ENDPOINT = process.env.R2_ENDPOINT;
    const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    const R2_BUCKET = process.env.R2_BUCKET;

    // Carpeta de datos a respaldar (aislada)
    const DATA_DIR = process.env.DATA_DIR || "/var/data/cobranza/beluga";

    // Validación de fuente
    const SOURCE_DIR = fs.existsSync(DATA_DIR) ? DATA_DIR : path.join(__dirname, "..");

    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
        console.error("❌ [Backup] Faltan variables de entorno R2. Abortando.");
        return; // No lanzamos error para no crashear proceso principal si se llama directo, pero logueamos
    }

    const date = new Date().toISOString().split("T")[0];
    const filename = `backup-${SYSTEM_NAME}-${date}.tar.gz`;
    const archivePath = path.join("/tmp", filename);

    try {
        console.log(`📦 [Backup] Iniciando respaldo para ${SYSTEM_NAME}...`);

        // Comprimimos data y uploads si existen en el SOURCE_DIR
        const targets = [];
        if (fs.existsSync(path.join(SOURCE_DIR, "data"))) targets.push("data");
        if (fs.existsSync(path.join(SOURCE_DIR, "uploads"))) targets.push("uploads");

        if (targets.length === 0) {
            console.log("⚠️ [Backup] No hay carpetas 'data' o 'uploads' en", SOURCE_DIR);
            return;
        }

        // Crear tarball
        // Usamos cwd: SOURCE_DIR para que el tar contenga rutas relativas 'data/...'
        execSync(`tar -czf ${archivePath} ${targets.join(" ")}`, { cwd: SOURCE_DIR });

        console.log(`🚀 [Backup] Subiendo ${filename} a R2...`);
        const s3 = new S3Client({
            region: "auto",
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });

        const fileBuffer = fs.readFileSync(archivePath);
        await s3.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: `${SYSTEM_NAME}/${filename}`, // Carpeta beluga/ en el bucket
            Body: fileBuffer,
            ContentType: "application/gzip",
        }));

        console.log(`✅ [Backup] Exitoso: ${SYSTEM_NAME}/${filename}`);

    } catch (error) {
        console.error("❌ [Backup] Error crítico:", error.message);
        throw error; // Re-throw para que el scheduler lo note
    } finally {
        if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
        }
    }
}

module.exports = runBackup;

if (require.main === module) {
    runBackup().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
