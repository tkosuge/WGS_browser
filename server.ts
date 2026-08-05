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
    kingdom TEXT,
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
  CREATE INDEX IF NOT EXISTS idx_domain ON organisms(domain);
  CREATE INDEX IF NOT EXISTS idx_kingdom ON organisms(kingdom);
  CREATE INDEX IF NOT EXISTS idx_phylum ON organisms(phylum);
  CREATE INDEX IF NOT EXISTS idx_class ON organisms(class);
  CREATE INDEX IF NOT EXISTS idx_order ON organisms("order");
  CREATE INDEX IF NOT EXISTS idx_family ON organisms(family);
  CREATE INDEX IF NOT EXISTS idx_genus ON organisms(genus);
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
      INSERT INTO organisms (id, organism_name, file_name, accession, div, submitted, updated, bioproject, biosample, sra, domain, kingdom, phylum, class, "order", family, genus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      if (parts.length < 19) continue;

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
        parts[13] || "", // 'kingdom'
        parts[14] || "", // 'phylum'
        parts[15] || "", // 'class'
        parts[16] || "", // 'order'
        parts[17] || "", // 'family'
        parts[18] || "" // 'genus'
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

    const stats = fs.statSync(filePath);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("last_updated", stats.mtime.toISOString());
    console.log("Data update complete.");
  } catch (error) {
    console.error("Update failed:", error);
  }
}

// Check if update is needed (based on file modification time)
async function checkUpdate() {
  const filePath = path.join(__dirname, "WGS_ORGANISM_LIST_with_Taxonomy.tsv");
  if (!fs.existsSync(filePath)) return;

  const stats = fs.statSync(filePath);
  const fileMtime = stats.mtime.toISOString();
  
  const lastUpdated = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_updated") as { value: string } | undefined;
  
  if (!lastUpdated || lastUpdated.value !== fileMtime) {
    await updateData();
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initial check
  checkUpdate();
  // Schedule check every hour
  setInterval(checkUpdate, 60 * 60 * 1000);

  const getWhereClause = (query: any) => {
    const globalFilter = (query.filter as string) || "";
    const validColumns = ["id", "organism_name", "file_name", "accession", "div", "submitted", "updated", "bioproject", "biosample", "sra", "domain", "kingdom", "phylum", "class", "order", "family", "genus"];
    const taxColumns = ["domain", "kingdom", "phylum", "class", "order", "family", "genus", "organism_name"];
    
    let whereClauses: string[] = [];
    let params: any[] = [];
    let taxFilters: Record<string, string> = {};

    // Global Filter
    if (globalFilter) {
      const search = `%${globalFilter}%`;
      const globalFields = ["organism_name", "file_name", "accession", "bioproject", "domain", "phylum", "class", "order", "family", "genus"];
      whereClauses.push(`(${globalFields.map(f => `"${f}" LIKE ?`).join(" OR ")})`);
      params.push(...Array(globalFields.length).fill(search));
    }

    // Column-specific Filters
    validColumns.forEach(col => {
      const val = query[`filter_${col}`] as string;
      if (val) {
        if (taxColumns.includes(col)) {
          taxFilters[col] = val;
          whereClauses.push(`"${col}" = ?`);
          params.push(val);
        } else {
          whereClauses.push(`"${col}" LIKE ?`);
          params.push(`%${val}%`);
        }
      }
    });

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return { whereClause, params, taxFilters };
  };

  app.get("/api/organisms", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || "organism_name";
    const sortOrder = (req.query.sortOrder as string) === "desc" ? "DESC" : "ASC";

    const validColumns = ["id", "organism_name", "file_name", "accession", "div", "submitted", "updated", "bioproject", "biosample", "sra", "domain", "kingdom", "phylum", "class", "order", "family", "genus"];
    const safeSortBy = validColumns.includes(sortBy) ? sortBy : "organism_name";

    const { whereClause, params, taxFilters } = getWhereClause(req.query);

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

    const getDistinctTax = (column: string, requiredParentKey: string | null, parentFilters: Record<string, string>) => {
      // If a parent key is required but not provided in the current filters, return empty array
      if (requiredParentKey && !taxFilters[requiredParentKey]) {
        return [];
      }

      let clauses = [`"${column}" IS NOT NULL`, `"${column}" != ''`];
      let p: any[] = [];
      Object.entries(parentFilters).forEach(([col, val]) => {
        if (val) {
          clauses.push(`"${col}" = ?`);
          p.push(val);
        }
      });
      const query = `SELECT DISTINCT "${column}" FROM organisms WHERE ${clauses.join(" AND ")} ORDER BY "${column}" ASC`;
      return db.prepare(query).all(...p).map((r: any) => r[column]);
    };

    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
      lastUpdated: lastUpdated?.value,
      filters: {
        domain: getDistinctTax("domain", null, {}),
        kingdom: getDistinctTax("kingdom", "domain", { domain: taxFilters.domain }),
        phylum: getDistinctTax("phylum", "kingdom", { domain: taxFilters.domain, kingdom: taxFilters.kingdom }),
        class: getDistinctTax("class", "phylum", { domain: taxFilters.domain, kingdom: taxFilters.kingdom, phylum: taxFilters.phylum }),
        order: getDistinctTax("order", "class", { domain: taxFilters.domain, kingdom: taxFilters.kingdom, phylum: taxFilters.phylum, class: taxFilters.class }),
        family: getDistinctTax("family", "order", { domain: taxFilters.domain, kingdom: taxFilters.kingdom, phylum: taxFilters.phylum, class: taxFilters.class, "order": taxFilters.order }),
        genus: getDistinctTax("genus", "family", { domain: taxFilters.domain, kingdom: taxFilters.kingdom, phylum: taxFilters.phylum, class: taxFilters.class, "order": taxFilters.order, family: taxFilters.family }),
        organism_name: getDistinctTax("organism_name", "genus", { domain: taxFilters.domain, kingdom: taxFilters.kingdom, phylum: taxFilters.phylum, class: taxFilters.class, "order": taxFilters.order, family: taxFilters.family, genus: taxFilters.genus }),
      }
    });
  });

  app.get("/api/organisms/files", (req, res) => {
    const { whereClause, params } = getWhereClause(req.query);
    const query = `SELECT file_name FROM organisms ${whereClause}`;
    const rows = db.prepare(query).all(...params) as { file_name: string }[];
    res.json(rows.map(r => r.file_name));
  });

  app.get("/api/proxy/metadata", async (req, res) => {
    const { type, id } = req.query;
    if (!type || !id) return res.status(400).json({ error: "Missing type or id" });

    const baseUrl = type === "project" 
      ? `https://ddbj.nig.ac.jp/search/entry/bioproject/${id}.json`
      : `https://ddbj.nig.ac.jp/search/entry/biosample/${id}.json`;

    try {
      const response = await fetch(baseUrl, {
        headers: {
          "User-Agent": "WGS-Browser/1.0"
        }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy metadata error:", error);
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use("", vite.middlewares);
  } else {
    app.use("", express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
