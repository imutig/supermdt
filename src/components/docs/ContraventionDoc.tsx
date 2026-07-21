import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { OfficialDoc, DocBlock, Info, Stat, type DocEmbed } from "./OfficialDoc";

type Entry = NonNullable<(typeof api.citations.getEntry)["_returnType"]>;

export function citationRef(citationId: string) {
  return `CTR-${String(citationId).slice(-6).toUpperCase()}-${new Date().getFullYear()}`;
}

export function citationMeta(entry: Entry, citationId: string): { reference: string; filename: string; embed: DocEmbed } {
  const ref = citationRef(citationId);
  return {
    reference: ref,
    filename: `${ref}-${entry.citizenName.replace(/\s+/g, "-")}.png`,
    embed: {
      title: "Avis de contravention",
      description: `**${entry.citizenName}** · $${entry.totalFine.toLocaleString("fr-FR")}`,
      color: entry.status === "ANNULEE" ? 0x8a929c : 0xe0a030,
      fields: [
        { name: "Chefs retenus", value: String(entry.charges.length), inline: true },
        { name: "Agent", value: entry.officer.name, inline: true },
      ],
    },
  };
}

// Corps du document, partagé entre l'aperçu et la capture hors écran.
export function CitationBody({ entry, reference }: { entry: Entry; reference: string }) {
  const annulee = entry.status === "ANNULEE";
  return (
    <>
      <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>Contrevenant</div>
        <div className="grid grid-cols-3 gap-3 text-[12.5px]">
          <Info label="Identité" value={entry.citizenName} />
          <Info label="Date des faits" value={new Date(entry.at).toLocaleString("fr-FR")} />
          <Info label="Agent verbalisateur" value={entry.officer.name} />
          <Info label="Niveau DEFCON" value={entry.defcon?.name ?? "-"} />
          <Info label="Statut" value={annulee ? "Annulée" : "Émise"} />
          <Info label="Référence" value={reference} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Chefs retenus" value={String(entry.charges.length)} />
        <Stat label="Montant total" value={`$${entry.totalFine.toLocaleString("fr-FR")}`} />
        <Stat label="Sur décision" value={String(entry.charges.filter((c) => c.onDecision).length)} />
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
                  <div className="font-data text-[13px] font-bold">${c.computedFine.toLocaleString("fr-FR")}</div>
                </div>
              ))}
            </div>
          )}
        </DocBlock>
      </div>

      <div className="mb-5 flex items-center justify-between rounded-[8px] px-4 py-3" style={{ background: "#49A24A", color: "#fff" }}>
        <span className="text-[13px] font-bold uppercase tracking-[0.08em]">Montant total dû</span>
        <span className="font-data text-[19px] font-extrabold">${entry.totalFine.toLocaleString("fr-FR")}</span>
      </div>

      {annulee && (
        <div className="mb-5 rounded-[8px] border p-3 text-[12px]" style={{ borderColor: "#f3c9c9", background: "#fdf3f3", color: "#c02828" }}>
          Contravention annulée{entry.annulReason ? ` : ${entry.annulReason}` : "."}
        </div>
      )}

      {entry.notes && (
        <div className="mb-2">
          <DocBlock title="Observations">
            <div className="whitespace-pre-wrap rounded-[8px] border p-3 text-[12.5px]" style={{ borderColor: "#e5e8ec" }}>{entry.notes}</div>
          </DocBlock>
        </div>
      )}
    </>
  );
}

// Avis de contravention officiel : même charte que l'extrait de casier.
export function ContraventionDoc({ citationId, onClose }: { citationId: Id<"citations">; onClose: () => void }) {
  const entry = useQuery(api.citations.getEntry, { citationId });
  if (entry === undefined || entry === null) return null;
  const meta = citationMeta(entry, citationId);

  return (
    <OfficialDoc
      toolbarTitle="Avis de contravention"
      title="Avis de contravention"
      subtitle="Document officiel · délivré par le département de police de Los Santos"
      reference={meta.reference}
      filename={meta.filename}
      discordEvent="contravention.create"
      discordEmbed={meta.embed}
      discordPath={entry.citizenId ? `/citoyen/${entry.citizenId}` : undefined}
      onClose={onClose}
    >
      <CitationBody entry={entry} reference={meta.reference} />
    </OfficialDoc>
  );
}
