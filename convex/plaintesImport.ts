import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// Import des PLAINTES et DÉPOSITIONS depuis le MDT Nexus (vizu).
//
// Même philosophie que casiersImport : idempotent par importRef (= numéro
// Nexus), adoption des orphelins (fiches créées en write-through mais dont le
// tamponnage a échoué) via nexusId, rattachement citoyen/officiers recalculé à
// chaque passe. Le format Nexus est documenté dans la mémoire du projet.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "https://mdt.vizu-world.com";

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ------------------------------- fetch ------------------------------------
async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new ConvexError("Token invalide/expiré (plaintes/dépositions).");
  if (!res.ok) throw new ConvexError(`Erreur API ${res.status} sur ${path}`);
  return res.json();
}
async function fetchAllPaged(base: string, key: string, token: string): Promise<any[]> {
  const first = await apiGet(`${base}?entity=lspd&page=1&limit=100`, token);
  let all = (first[key] || []).slice();
  const pages = first.pages || 1;
  for (let p = 2; p <= pages; p++) all = all.concat((await apiGet(`${base}?entity=lspd&page=${p}&limit=100`, token))[key] || []);
  return all;
}

// ------------------------------- refs -------------------------------------
async function resolveRefs(ctx: any) {
  const citizens = await ctx.db.query("citizens").collect();
  const byNexus = new Map<string, Id<"citizens">>();
  const byName = new Map<string, Id<"citizens">>();
  for (const c of citizens) {
    if (c.nexusId) byNexus.set(c.nexusId, c._id);
    byName.set(norm(`${c.prenom} ${c.nom}`), c._id);
    byName.set(norm(`${c.nom} ${c.prenom}`), c._id);
  }
  const agents = await ctx.db.query("agents").collect();
  // Clé matricule normalisée en chiffres : le Nexus préfixe parfois (« LSPD-53876 »).
  const byMat = new Map<string, Id<"agents">>();
  for (const a of agents) if (a.matricule != null) byMat.set(String(a.matricule).replace(/\D/g, ""), a._id);
  const lastCount = new Map<string, number>();
  for (const a of agents) lastCount.set(norm(a.nomRP), (lastCount.get(norm(a.nomRP)) ?? 0) + 1);
  const byLastName = new Map<string, Id<"agents">>();
  for (const a of agents) if (lastCount.get(norm(a.nomRP)) === 1) byLastName.set(norm(a.nomRP), a._id);
  const owner = agents.find((a: any) => a.isOwner);
  return { byNexus, byName, byMat, byLastName, owner };
}
// Citoyen local à partir du bloc Nexus { id, nom, prenom } : nexusId d'abord.
function resolveCitizen(refs: any, cit: any): Id<"citizens"> | undefined {
  if (!cit) return undefined;
  if (cit.id && refs.byNexus.get(cit.id)) return refs.byNexus.get(cit.id);
  const prenom = cit.prenom || "";
  const nom = cit.nom || "";
  return refs.byName.get(norm(`${prenom} ${nom}`)) || refs.byName.get(norm(`${nom} ${prenom}`)) || undefined;
}
// Snapshot des officiers Nexus + liste d'agentIds rattachés (matricule ou nom unique).
function buildOfficers(rawOfficiers: any[], refs: any) {
  const officiers: { matricule?: string; nom: string }[] = [];
  const agentIds: Id<"agents">[] = [];
  const seen = new Set<string>();
  for (const o of rawOfficiers || []) {
    const nom = (o?.nom || "").trim();
    const mat = o?.matricule != null ? String(o.matricule) : undefined; // valeur brute (affichage)
    const matDigits = mat ? mat.replace(/\D/g, "") : ""; // pour le rattachement
    if (!nom && !mat) continue;
    officiers.push({ matricule: mat, nom: nom || `#${mat}` });
    // Matricule d'abord (fiable, sans ambiguïté), sinon nom de famille unique.
    const aid = (matDigits && refs.byMat.get(matDigits)) || (nom ? refs.byLastName.get(norm(nom)) : undefined);
    if (aid && !seen.has(aid)) { seen.add(aid); agentIds.push(aid); }
  }
  return { officiers, agentIds };
}

// ------------------------------- mapping ----------------------------------
function mapPlainte(raw: any) {
  return {
    nexusId: String(raw._id),
    numero: typeof raw.numero === "number" ? raw.numero : undefined,
    citoyen: raw.citoyen || null,
    contre: (raw.contre || "").trim(),
    motif: (raw.raison || "—").trim(),
    status: (raw.statut || "En cours").trim(),
    raisonStatut: (raw.raisonStatut || "").trim(),
    avocats: Array.isArray(raw.avocats) ? raw.avocats.filter((x: any) => typeof x === "string") : [],
    officiers: Array.isArray(raw.officiers) ? raw.officiers : [],
    photos: Array.isArray(raw.photos) ? raw.photos.filter((x: any) => typeof x === "string") : [],
    body: raw.corps || "",
    at: Date.parse(raw.createdAt || "") || undefined,
  };
}
function mapDeposition(raw: any) {
  return {
    nexusId: String(raw._id),
    numero: typeof raw.numero === "number" ? raw.numero : undefined,
    citoyen: raw.citoyen || null,
    title: (raw.objet || "").trim(),
    officiers: Array.isArray(raw.officiers) ? raw.officiers : [],
    body: raw.corps || "",
    at: Date.parse(raw.createdAt || "") || undefined,
  };
}

// ------------------------------- upsert -----------------------------------
export const _upsertPlaintes = internalMutation({
  args: { raws: v.array(v.string()), dryRun: v.optional(v.boolean()), reconcile: v.optional(v.boolean()) },
  handler: async (ctx, { raws, dryRun, reconcile }) => {
    const refs = await resolveRefs(ctx);
    if (!refs.owner) throw new ConvexError("Aucun compte owner pour rattacher les plaintes importées.");
    const all = await ctx.db.query("complaints").collect();
    const byRef = new Map<string, (typeof all)[number]>();
    const byNexus = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      if (c.importRef) byRef.set(c.importRef, c);
      if (c.nexusId) byNexus.set(c.nexusId, c);
    }
    const seenNexus = new Set<string>();
    let ajoutes = 0, maj = 0, ignores = 0;
    for (const rawStr of raws) {
      const p = mapPlainte(JSON.parse(rawStr));
      seenNexus.add(p.nexusId);
      const plaignantId = resolveCitizen(refs, p.citoyen);
      // Plaignant non recensé (citoyen.id null côté Nexus) : on garde le nom pour
      // ne rien perdre — la fiche existe même sans citoyen local rattaché.
      const plaignantName = plaignantId ? undefined : `${p.citoyen?.prenom ?? ""} ${p.citoyen?.nom ?? ""}`.trim() || "Non recensé";
      const { officiers, agentIds } = buildOfficers(p.officiers, refs);
      const importRef = p.numero != null ? String(p.numero) : `nx:${p.nexusId}`;
      const fields = {
        plaignantId,
        plaignantName,
        contre: p.contre || undefined,
        agentIds,
        officiers,
        motif: p.motif,
        status: p.status,
        raisonStatut: p.raisonStatut || undefined,
        avocat: p.avocats[0] || undefined,
        avocats: p.avocats,
        photos: p.photos,
        body: p.body,
        nexusId: p.nexusId,
        numero: p.numero,
        importRef,
      };
      const existing = byRef.get(importRef) || byNexus.get(p.nexusId);
      if (dryRun) { existing ? maj++ : ajoutes++; continue; }
      if (existing) {
        if (existing.deletedAt) { ignores++; continue; } // ne pas ressusciter un supprimé
        await ctx.db.patch(existing._id, fields);
        maj++;
      } else {
        await ctx.db.insert("complaints", { ...fields, at: p.at ?? Date.now(), createdBy: agentIds[0] ?? refs.owner._id });
        ajoutes++;
      }
    }
    // Réconciliation : une plainte importée (nexusId) absente du Nexus a été
    // supprimée là-bas -> soft-delete local. Seulement en synchro complète.
    let supprimes = 0;
    if (reconcile && !dryRun) {
      for (const c of all) {
        if (c.nexusId && !c.deletedAt && !seenNexus.has(c.nexusId)) {
          await ctx.db.patch(c._id, { deletedAt: Date.now() });
          supprimes++;
        }
      }
    }
    return { ajoutes, maj, ignores, supprimes };
  },
});

export const _upsertDepositions = internalMutation({
  args: { raws: v.array(v.string()), dryRun: v.optional(v.boolean()), reconcile: v.optional(v.boolean()) },
  handler: async (ctx, { raws, dryRun, reconcile }) => {
    const refs = await resolveRefs(ctx);
    if (!refs.owner) throw new ConvexError("Aucun compte owner pour rattacher les dépositions importées.");
    const all = await ctx.db.query("depositions").collect();
    const byRef = new Map<string, (typeof all)[number]>();
    const byNexus = new Map<string, (typeof all)[number]>();
    for (const d of all) {
      if (d.importRef) byRef.set(d.importRef, d);
      if (d.nexusId) byNexus.set(d.nexusId, d);
    }
    const seenNexus = new Set<string>();
    let ajoutes = 0, maj = 0, ignores = 0;
    for (const rawStr of raws) {
      const d = mapDeposition(JSON.parse(rawStr));
      seenNexus.add(d.nexusId);
      const citizenId = resolveCitizen(refs, d.citoyen);
      if (!citizenId) { ignores++; continue; }
      const { officiers, agentIds } = buildOfficers(d.officiers, refs);
      const importRef = d.numero != null ? String(d.numero) : `nx:${d.nexusId}`;
      const fields = {
        citizenId,
        linkType: "STANDALONE" as const,
        title: d.title || undefined,
        officiers,
        body: d.body,
        nexusId: d.nexusId,
        numero: d.numero,
        importRef,
      };
      const existing = byRef.get(importRef) || byNexus.get(d.nexusId);
      if (dryRun) { existing ? maj++ : ajoutes++; continue; }
      if (existing) {
        if (existing.deletedAt) { ignores++; continue; }
        await ctx.db.patch(existing._id, fields);
        maj++;
      } else {
        await ctx.db.insert("depositions", { ...fields, at: d.at ?? Date.now(), createdBy: agentIds[0] ?? refs.owner._id });
        ajoutes++;
      }
    }
    let supprimes = 0;
    if (reconcile && !dryRun) {
      for (const d of all) {
        if (d.nexusId && !d.deletedAt && !seenNexus.has(d.nexusId)) {
          await ctx.db.patch(d._id, { deletedAt: Date.now() });
          supprimes++;
        }
      }
    }
    return { ajoutes, maj, ignores, supprimes };
  },
});

// ------------------------------- actions ----------------------------------
export const plaintesSync = internalAction({
  args: { token: v.optional(v.string()), dryRun: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, { token, dryRun, limit }): Promise<unknown> => {
    const tk = token || process.env.VIZU_TOKEN;
    if (!tk) throw new ConvexError("Aucun token (plaintes).");
    let raw = await fetchAllPaged("/api/plaintes", "plaintes", tk);
    if (limit) raw = raw.slice(0, limit);
    // Réconciliation des suppressions seulement en synchro complète (non tronquée).
    return await ctx.runMutation(internal.plaintesImport._upsertPlaintes, { raws: raw.map((r) => JSON.stringify(r)), dryRun, reconcile: !limit });
  },
});
export const depositionsSync = internalAction({
  args: { token: v.optional(v.string()), dryRun: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, { token, dryRun, limit }): Promise<unknown> => {
    const tk = token || process.env.VIZU_TOKEN;
    if (!tk) throw new ConvexError("Aucun token (dépositions).");
    let raw = await fetchAllPaged("/api/depositions", "depositions", tk);
    if (limit) raw = raw.slice(0, limit);
    return await ctx.runMutation(internal.plaintesImport._upsertDepositions, { raws: raw.map((r) => JSON.stringify(r)), dryRun, reconcile: !limit });
  },
});
