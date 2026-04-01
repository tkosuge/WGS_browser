import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "wgs_data.db");
const db = new Database(DB_PATH);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS organisms (
    id INTEGER,
    organism_name TEXT,
    file_name TEXT,
    accession TEXT,
    div TEXT,
    submitted TEXT,
    updated TEXT,
    bioproject TEXT,
    biosample TEXT,
    sra TEXT,
    domain TEXT,
    phylum TEXT,
    class TEXT,
    "order" TEXT,
    family TEXT,
    genus TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_id ON organisms(id);
  CREATE INDEX IF NOT EXISTS idx_organism_name ON organisms(organism_name);
  CREATE INDEX IF NOT EXISTS idx_file_name ON organisms(file_name);
  CREATE INDEX IF NOT EXISTS idx_accession ON organisms(accession);
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

async function updateData() {
  console.log("Starting data update from local file...");
  const filePath = path.join(__dirname, "WGS_ORGANISM_LIST_with_Taxonomy.tsv");
  
  if (!fs.existsSync(filePath)) {
    console.warn(`Local file not found at ${filePath}. Skipping update.`);
    return;
  }

  try {
    // Clear existing data in a transaction
    db.prepare("DELETE FROM organisms").run();

    const insert = db.prepare(`
      INSERT INTO organisms (id, organism_name, file_name, accession, div, submitted, updated, bioproject, biosample, sra, domain, phylum, class, "order", family, genus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(row);
    });

    let lineCount = 0;
    let batch: any[] = [];
    const BATCH_SIZE = 10000;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      lineCount++;
      if (lineCount < 2) continue; // Skip first 1 lines (header is on line 1, data starts line 2-)
      
      const parts = line.split("\t");
      if (parts.length < 18) continue;

      const row = [
        parts[0] ? parseInt(parts[0], 10) : null, // id
        parts[1] || "", // organism name
        parts[2] || "", // file
        parts[3] || "", // accession
        parts[6] || "", // DIV
        parts[7] || "", // submitted
        parts[8] || "", // updated
        parts[9] || "", // BioProject
        parts[10] || "", // BioSample
        parts[11] || "", // SRA
        parts[12] || "", // 'domain'
        parts[13] || "", // 'phylum'
        parts[14] || "", // 'class'
        parts[15] || "", // 'order'
        parts[16] || "", // 'family'
        parts[17] || "" // 'genus'
      ];

      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        insertMany(batch);
        batch = [];
        console.log(`Processed ${lineCount} lines...`);
      }
    }

    if (batch.length > 0) {
      insertMany(batch);
    }

    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("last_updated", new Date().toISOString());
    console.log("Data update complete.");
  } catch (error) {
    console.error("Update failed:", error);
  }
}

// Check if update is needed (every 3 hours)
async function checkUpdate() {
  const lastUpdated = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_updated") as { value: string } | undefined;
  const now = new Date();
  
  if (!lastUpdated || (now.getTime() - new Date(lastUpdated.value).getTime()) > 3 * 60 * 60 * 1000) {
    await updateData();
  }
}

async function startServer() {
  const app = express();
  const PORT = 23000;

  // Initial check
  checkUpdate();
  // Schedule check every hour
  setInterval(checkUpdate, 60 * 60 * 1000);

  app.get("/wgs/api/organisms", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || "organism_name";
    const sortOrder = (req.query.sortOrder as string) === "desc" ? "DESC" : "ASC";
    const globalFilter = (req.query.filter as string) || "";

    const validColumns = ["id", "organism_name", "file_name", "accession", "div", "submitted", "updated", "bioproject", "biosample", "sra", "domain", "phylum", "class", "order", "family", "genus"];
    const safeSortBy = validColumns.includes(sortBy) ? sortBy : "organism_name";

    let whereClauses: string[] = [];
    let params: any[] = [];

    // Global Filter
    if (globalFilter) {
      const search = `%${globalFilter}%`;
      const globalFields = ["organism_name", "file_name", "accession", "bioproject", "domain", "phylum", "class", "order", "family", "genus"];
      whereClauses.push(`(${globalFields.map(f => `"${f}" LIKE ?`).join(" OR ")})`);
      params.push(...Array(globalFields.length).fill(search));
    }

    // Column-specific Filters
    validColumns.forEach(col => {
      const val = req.query[`filter_${col}`] as string;
      if (val) {
        whereClauses.push(`"${col}" LIKE ?`);
        params.push(`%${val}%`);
      }
    });

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) as total FROM organisms ${whereClause}`;
    const total = (db.prepare(countQuery).get(...params) as any).total;

    const dataQuery = `
      SELECT * FROM organisms 
      ${whereClause}
      ORDER BY "${safeSortBy}" ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limit, offset);

    const lastUpdated = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_updated") as { value: string } | undefined;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
      lastUpdated: lastUpdated?.value
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use("/wgs", vite.middlewares);
  } else {
    app.use("/wgs", express.static(path.join(__dirname, "dist")));
    app.get("/wgs/*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
