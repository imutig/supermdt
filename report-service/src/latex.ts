import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

// Dossier contenant style/, fonts/, images/ : xelatex compile depuis là pour que
// les chemins relatifs (Path=fonts/, images/…) résolvent.
const TEX_DIR = path.resolve(process.cwd(), "tex");
const JOB_EXTS = [".tex", ".pdf", ".aux", ".log", ".out", ".toc", ".synctex.gz"];

function runPass(job: string): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    execFile(
      "xelatex",
      ["-interaction=nonstopmode", "-no-shell-escape", `${job}.tex`],
      { cwd: TEX_DIR, timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => resolve({ code: err ? 1 : 0, log: stdout ?? "" }),
    );
  });
}

// Compile un source LaTeX en PDF. Trois passes (sommaire + \pageref{LastPage}).
// Chaque requête utilise un jobname unique -> compilations concurrentes sûres.
export async function compile(texSource: string): Promise<Buffer> {
  const job = `rapport_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const texPath = path.join(TEX_DIR, `${job}.tex`);
  await writeFile(texPath, texSource, "utf8");
  try {
    let lastLog = "";
    for (let pass = 0; pass < 3; pass++) lastLog = (await runPass(job)).log;
    try {
      return await readFile(path.join(TEX_DIR, `${job}.pdf`));
    } catch {
      // Pas de PDF : on remonte l'extrait d'erreur du log LaTeX.
      const errLog = await readFile(path.join(TEX_DIR, `${job}.log`), "utf8").catch(() => lastLog);
      const lines = errLog.split("\n").filter((l) => l.startsWith("!") || /l\.\d+/.test(l)).slice(0, 12);
      throw new Error(`Échec de compilation LaTeX.\n${lines.join("\n") || "(voir logs)"}`);
    }
  } finally {
    await Promise.all(JOB_EXTS.map((ext) => unlink(path.join(TEX_DIR, `${job}${ext}`)).catch(() => {})));
  }
}
