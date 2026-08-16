import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAgent, requirePermission } from "./rbac";
import { writeAudit } from "./lib/audit";

// Documents du site (actuellement : le Règlement). Un PDF par clé, stocké dans
// le storage Convex ; consultable par tout agent, remplaçable par l'État-Major.

const REGLEMENT = "reglement";

// URL + métadonnées du règlement courant (null si aucun n'a été téléversé).
export const getReglement = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    const row = await ctx.db.query("siteDocuments").withIndex("by_key", (q) => q.eq("key", REGLEMENT)).unique();
    if (!row) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    if (!url) return null;
    return { url, fileName: row.fileName, uploadedAt: row.uploadedAt };
  },
});

// URL de téléversement à usage unique (le client POST le PDF dessus).
export const generateReglementUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    return await ctx.storage.generateUploadUrl();
  },
});

// Enregistre le PDF téléversé comme règlement courant (remplace l'ancien).
export const setReglement = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string() },
  handler: async (ctx, { storageId, fileName }) => {
    const agent = await requireAgent(ctx);
    await requirePermission(ctx, agent, "rbac.manage");
    if (!fileName.toLowerCase().endsWith(".pdf")) throw new ConvexError("Le règlement doit être un fichier PDF.");
    const existing = await ctx.db.query("siteDocuments").withIndex("by_key", (q) => q.eq("key", REGLEMENT)).unique();
    if (existing) {
      // Libère l'ancien fichier du storage avant de le remplacer.
      await ctx.storage.delete(existing.storageId).catch(() => undefined);
      await ctx.db.patch(existing._id, { storageId, fileName, uploadedBy: agent._id, uploadedAt: Date.now() });
    } else {
      await ctx.db.insert("siteDocuments", { key: REGLEMENT, storageId, fileName, uploadedBy: agent._id, uploadedAt: Date.now() });
    }
    await writeAudit(ctx, agent, { action: "reglement.update", resourceType: "document", resourceLabel: fileName });
  },
});
