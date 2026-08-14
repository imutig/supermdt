import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";

// ============================================================================
// Nettoyage ponctuel des fiches de TEST laissées sur le NexusMDT pendant la
// validation des payloads write-through (voir NEXUS-TEST-CLEANUP.md).
//
// On agit sous l'identité d'un agent Nexus AYANT le droit de DELETE (Jamal
// Turner) : on passe son agentId, on récupère son token via nexusSync.tokenFor,
// puis on liste (lecture seule) ou on supprime le plan.
//
// Usage :
//   npx convex run cleanupNexus:listTestRecords   '{"agentId":"..."}' --prod   (lecture seule)
//   npx convex run cleanupNexus:deleteAllTestRecords '{"agentId":"..."}' --prod (supprime)
// ============================================================================

const BASE = "https://mdt.vizu-world.com";

type Item = { path: string; id: string; label: string };
type ListResult = {
  jamalCounts: { citoyens: number; dossiers: number; rapports: number; amendes: number };
  zzCitoyens: Item[]; zzDossiers: Item[]; zzRapports: Item[]; zzAmendes: Item[];
  knownStandalone: Item[]; plan: Item[];
};
type DeleteResult = { total: number; ok: number; failed: number; results: { label: string; ok: boolean; status: number }[] };

async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ConvexError(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}
async function fetchAll(resource: string, key: string, token: string): Promise<any[]> {
  const first = await apiGet(`/api/${resource}?entity=lspd&page=1&limit=100`, token);
  let all = (first[key] || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) all = all.concat((await apiGet(`/api/${resource}?entity=lspd&page=${p}&limit=100`, token))[key] || []);
  return all;
}
const isZZ = (s: unknown) => typeof s === "string" && /^\s*zz/i.test(s);
const citoyenName = (r: any) => `${r?.citoyen?.prenom ?? r?.prenom ?? ""} ${r?.citoyen?.nom ?? r?.nom ?? ""}`.trim();
const citoyenIsZZ = (r: any) => isZZ(r?.citoyen?.prenom ?? r?.prenom) || isZZ(r?.citoyen?.nom ?? r?.nom);
const idOf = (r: any) => String(r?._id ?? r?.id ?? "");

// Fiches attachées à un VRAI citoyen (Riyez Ravher n°636) : on supprime QUE ces
// fiches précises, jamais le citoyen. Ids relevés lors des tests write-through.
const KNOWN_STANDALONE: Item[] = [
  { path: "plaintes", id: "6a7eb998e5747dfeba48d26b", label: "plainte n°24 (ZZTEST SYNC EDIT)" },
  { path: "depositions", id: "6a7eb9a1e5747dfeba48d26e", label: "deposition n°7 (ZZTEST SYNC)" },
  { path: "armes", id: "6a7ec53fe5747dfeba48d7f5", label: "arme ZZSYNC-0001" },
  { path: "vehicules", id: "6a7ec547e5747dfeba48d7f7", label: "vehicule ZZSYNC01" },
];

// Construit le plan de suppression (lecture seule) à partir d'un token.
async function buildPlan(token: string): Promise<ListResult> {
  const [citoyens, dossiers, rapports, amendes] = await Promise.all([
    fetchAll("citoyens", "citoyens", token),
    fetchAll("dossiers", "dossiers", token),
    fetchAll("rapports", "rapports", token),
    fetchAll("amendes", "amendes", token),
  ]);
  const zzCitoyens: Item[] = citoyens.filter((c) => isZZ(c?.prenom) || isZZ(c?.nom))
    .map((c) => ({ path: "citoyens", id: idOf(c), label: `citoyen ${citoyenName(c)} (n°${c?.numero ?? "?"})` }));
  const zzDossiers: Item[] = dossiers.filter(citoyenIsZZ)
    .map((d) => ({ path: "dossiers", id: idOf(d), label: `dossier n°${d?.numero ?? "?"} (${citoyenName(d)})` }));
  const zzRapports: Item[] = rapports.filter(citoyenIsZZ)
    .map((r) => ({ path: "rapports", id: idOf(r), label: `rapport n°${r?.numero ?? "?"} (${citoyenName(r)})` }));
  const zzAmendes: Item[] = amendes.filter(citoyenIsZZ)
    .map((a) => ({ path: "amendes", id: idOf(a), label: `amende (${citoyenName(a)}, ${a?.montant ?? "?"})` }));
  // Ordre : fiches rattachées d'abord, citoyens en DERNIER.
  const plan = [...zzDossiers, ...zzRapports, ...zzAmendes, ...KNOWN_STANDALONE, ...zzCitoyens].filter((x) => x.id);
  return {
    jamalCounts: { citoyens: citoyens.length, dossiers: dossiers.length, rapports: rapports.length, amendes: amendes.length },
    zzCitoyens, zzDossiers, zzRapports, zzAmendes, knownStandalone: KNOWN_STANDALONE, plan,
  };
}

async function runDeletes(token: string, items: Item[]): Promise<DeleteResult> {
  const results: { label: string; ok: boolean; status: number }[] = [];
  for (const it of items) {
    try {
      const res = await fetch(`${BASE}/api/${it.path}/${it.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      results.push({ label: it.label, ok: res.ok, status: res.status });
    } catch {
      results.push({ label: it.label, ok: false, status: -1 });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  return { total: results.length, ok, failed: results.length - ok, results };
}

// Lecture seule : dresse la liste de tout ce qui serait supprimé, avec les ids.
export const listTestRecords = internalAction({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }): Promise<ListResult> => {
    const token: string | null = await ctx.runAction(internal.nexusSync.tokenFor, { agentId });
    if (!token) throw new ConvexError("Aucun token Nexus pour cet agent (compte non lié ?).");
    return await buildPlan(token);
  },
});

// Un coup : (re)construit le plan puis supprime tout, sous l'identité de l'agent.
export const deleteAllTestRecords = internalAction({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }): Promise<DeleteResult> => {
    const token: string | null = await ctx.runAction(internal.nexusSync.tokenFor, { agentId });
    if (!token) throw new ConvexError("Aucun token Nexus pour cet agent (compte non lié ?).");
    const { plan } = await buildPlan(token);
    return await runDeletes(token, plan);
  },
});
