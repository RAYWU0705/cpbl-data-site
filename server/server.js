import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

console.log("🔥 我是新的 server.js");

// 🔥 ESM 取得 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   測試 API
========================= */
app.get("/test", (req, res) => {
  res.send("TEST OK");
});

/* =========================
   LIVE API（讀 JSON）
========================= */
app.get("/api/live", async (req, res) => {
  try {
    const filePath = path.join(__dirname, "../data/live/live-boxscore.json");

    console.log("📂 讀取:", filePath);

    const raw = await fs.readFile(filePath, "utf-8");

    const data = JSON.parse(raw);

    res.json(data);

  } catch (err) {
    console.error("❌ 讀不到 live JSON:", err.message);
    res.status(500).json({ error: "live file not found" });
  }
});

/* =========================
   啟動
========================= */
app.listen(3002, () => {
  console.log("🚀 Server running at http://localhost:3002");
});