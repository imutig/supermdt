import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { OfficialDoc, DocBlock, Info, Stat, type DocEmbed } from "./OfficialDoc";
import { richTextToPlain } from "@/components/common/RichTextEditor";

type Entry = NonNullable<(typeof api.casier.getEntry)["_returnType"]>;

function fmtDur(seconds: number) {
  if (!seconds) return "Aucune";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${seconds}s`;
}

export function casierRef(entryId: string) {
  return `CAS-${String(entryId).slice(-6).toUpperCase()}-${new Date().getFullYear()}`;
}

export function casierMeta(entry: Entry, entryId: string): { reference: string; filename: string; embed: DocEmbed; isDossier: boolean } {
  const ref = casierRef(entryId);
  const isDossier = entry.arrestType === "DOSSIER";
  return {
    reference: ref,
    filename: `${ref}-${entry.citizenName.replace(/\s+/g, "-")}.png`,
    isDossier,
    embed: {
      title: isDossier ? "Dossier d'arrestation" : "Rapport au casier",
      description: `**${entry.citizenName}**`,
      color: isDossier ? 0xd94040 : 0xe0a030,
      fields: [
        { name: "Amende", value: `$${entry.totalFine.toLocaleString("fr-FR")}`, inline: true },
        { name: "Peine", value: fmtDur(entry.totalJailSeconds), inline: true },
        { name: "Chefs", value: String(entry.charges.length), inline: true },
      ],
    },
  };
}

// Corps du document, partagé entre l'aperçu et la capture hors écran.
export function CasierBody({ entry, reference }: { entry: Entry; reference: string }) {
  const isDossier = entry.arrestType === "DOSSIER";
  const annulee = entry.status === "ANNULEE";
  return (
    <>
      <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Mis en cause</div>
        <div className="grid grid-cols-3 gap-3 text-[12.5px]">
          <Info label="Identité" value={entry.citizenName} />
          <Info label="Date des faits" value={new Date(entry.at).toLocaleString("fr-FR")} />
          <Info label="Agents" value={entry.officers.map((o) => o.name).join(", ") || "-"} />
          <Info label="Niveau DEFCON" value={entry.defcon?.name ?? "-"} />
          <Info label="Lieu" value={entry.lieu || "-"} />
          <Info label="Référence" value={reference} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Chefs retenus" value={String(entry.charges.length)} />
        <Stat label="Total amendes" value={`$${entry.totalFine.toLocaleString("fr-FR")}`} />
        <Stat label="Peine" value={fmtDur(entry.totalJailSeconds)} />
      </div>

      <div className="mb-5">
        <DocBlock title="Chefs retenus">
          {entry.charges.length === 0 ? (
            <div className="rounded-[8px] border p-6 text-center text-[13px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>Aucun chef retenu.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {entry.charges.map((c, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[8px] border p-3" style={{ borderColor: "#e5e8ec" }}>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold">{c.name}</div>
                    <div className="mt-[2px] flex gap-3 text-[11px]" style={{ color: "#5c626e" }}>
                      {c.category && <span>{c.category}</span>}
                      {c.isRecidive && <span style={{ color: "#c02828" }}>Récidive</span>}
                      {c.onDecision && <span>Sur décision</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-data text-[13px] font-bold">${c.computedFine.toLocaleString("fr-FR")}</div>
                    {c.computedJailSeconds > 0 && <div className="text-[10.5px]" style={{ color: "#5c626e" }}>{fmtDur(c.computedJailSeconds)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DocBlock>
      </div>

      {entry.derouleFaits && (
        <div className="mb-5">
          <DocBlock title="Déroulé des faits">
            <div className="whitespace-pre-wrap rounded-[8px] border p-4 text-[12.5px] leading-[1.6]" style={{ borderColor: "#e5e8ec" }}>{richTextToPlain(entry.derouleFaits)}</div>
          </DocBlock>
        </div>
      )}

      {isDossier && (
        <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec" }}>
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Procédure d'arrestation</div>
          <div className="grid grid-cols-3 gap-3 text-[12.5px]">
            <Info label="Menottage" value={entry.cuffedAt || "-"} />
            <Info label="Miranda" value={entry.mirandaAt || "-"} />
            <Info label="Statut du dossier" value={entry.dossierStatus || "-"} />
            <Info label="Droits notifiés" value={[entry.rightsLawyer ? "avocat" : null, entry.rightsFood ? "repas" : null, entry.rightsMedical ? "médical" : null].filter(Boolean).join(", ") || "aucun"} />
            <Info label="Usage de la force" value={entry.forceUsed ? "Oui" : "Non"} />
            <Info label="Avocat" value={entry.avocat || "-"} />
          </div>
        </div>
      )}

      {(entry.vehicles.length > 0 || entry.weapons.length > 0) && (
        <div className="mb-5 grid grid-cols-2 gap-4">
          {entry.vehicles.length > 0 && (
            <DocBlock title="Véhicules">
              <div className="flex flex-col gap-[6px]">
                {entry.vehicles.map((v) => (
                  <div key={v._id} className="rounded-[8px] border p-[9px] text-[12px]" style={{ borderColor: "#e5e8ec" }}>{v.label}</div>
                ))}
              </div>
            </DocBlock>
          )}
          {entry.weapons.length > 0 && (
            <DocBlock title="Armes">
              <div className="flex flex-col gap-[6px]">
                {entry.weapons.map((w) => (
                  <div key={w._id} className="rounded-[8px] border p-[9px] text-[12px]" style={{ borderColor: "#e5e8ec" }}>{w.label}</div>
                ))}
              </div>
            </DocBlock>
          )}
        </div>
      )}

      <div className="mb-5 flex items-center justify-between rounded-[8px] px-4 py-3" style={{ background: "#49A24A", color: "#fff" }}>
        <span className="text-[13px] font-bold uppercase tracking-[0.08em]">Total dû</span>
        <span className="font-data text-[19px] font-extrabold">${entry.totalFine.toLocaleString("fr-FR")}</span>
      </div>

      {annulee && (
        <div className="mb-2 rounded-[8px] border p-3 text-[12px]" style={{ borderColor: "#f3c9c9", background: "#fdf3f3", color: "#c02828" }}>
          Entrée annulée{entry.annulReason ? ` : ${entry.annulReason}` : "."}
        </div>
      )}
    </>
  );
}

// Dossier d'arrestation / rapport au casier : même charte que l'extrait de casier.
export function CasierDoc({ entryId, onClose }: { entryId: Id<"casierEntries">; onClose: () => void }) {
  const entry = useQuery(api.casier.getEntry, { entryId });
  if (entry === undefined || entry === null) return null;
  const meta = casierMeta(entry, entryId);

  return (
    <OfficialDoc
      toolbarTitle={meta.isDossier ? "Dossier d'arrestation" : "Rapport au casier"}
      title={meta.isDossier ? "Dossier d'arrestation" : "Rapport au casier"}
      subtitle="Document officiel · délivré par le département de police de Los Santos"
      reference={meta.reference}
      filename={meta.filename}
      discordEvent="casier.create"
      discordEmbed={meta.embed}
      discordPath={`/citoyen/${entry.citizenId}`}
      onClose={onClose}
    >
      <CasierBody entry={entry} reference={meta.reference} />
    </OfficialDoc>
  );
}
