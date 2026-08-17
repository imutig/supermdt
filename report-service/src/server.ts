import express from "express";
import { buildTex, type ReportPayload } from "./template.js";
import { compile } from "./latex.js";

// Service de compilation du rapport hebdomadaire LSPD (LaTeX -> PDF).
// Reçoit les données JSON, remplit le modèle, compile en XeLaTeX, renvoie le PDF.
// Protégé par un secret partagé (REPORT_SECRET), comme le bot avec Convex.

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.REPORT_SECRET ?? "";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "report-service" });
});

app.post("/compile", async (req, res) => {
  if (!SECRET || req.get("x-report-secret") !== SECRET) {
    res.status(401).json({ error: "Secret invalide." });
    return;
  }
  const payload = req.body as ReportPayload;
  if (!payload || !payload.meta || !payload.kpis) {
    res.status(400).json({ error: "Payload incomplet." });
    return;
  }
  try {
    const pdf = await compile(buildTex(payload));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="rapport.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error("[report] compilation :", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erreur de compilation." });
  }
});

app.listen(PORT, () => {
  console.log(`[report-service] à l'écoute sur :${PORT}${SECRET ? "" : " (⚠️ REPORT_SECRET non défini)"}`);
});
