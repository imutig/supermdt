import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { OfficialDoc, DocBlock, Info } from "./OfficialDoc";

// Rapport officiel : même charte que l'extrait de casier.
// Le corps est lu depuis l'éditeur collaboratif affiché à l'écran, ce qui
// garantit que le document reflète exactement le rapport en cours.
export function RapportDoc({ reportId, body, onClose }: { reportId: Id<"reports">; body: string; onClose: () => void }) {
  const report = useQuery(api.reports.get, { id: reportId });
  if (report === undefined || report === null) return null;

  const ref = `RPT-${String(reportId).slice(-6).toUpperCase()}-${new Date().getFullYear()}`;
  const STATUS: Record<string, string> = { BROUILLON: "Brouillon", SOUMIS: "Soumis", VALIDE: "Validé" };

  return (
    <OfficialDoc
      toolbarTitle="Rapport officiel"
      title={report.typeName || "Rapport unifié"}
      subtitle="Document officiel · délivré par le département de police de Los Santos"
      reference={ref}
      filename={`${ref}.png`}
      discordEvent="rapport.submit"
      discordEmbed={{
        title: `Rapport · ${report.typeName || "unifié"}`,
        description: `**${report.title}**`,
        color: report.status === "VALIDE" ? 0x49a24a : 0xe0a030,
        fields: [
          { name: "Lead", value: report.lead.name, inline: true },
          { name: "Statut", value: STATUS[report.status] ?? report.status, inline: true },
        ],
      }}
      onClose={onClose}
    >
      <div className="mb-5 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec", background: "#f7f8fa" }}>
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>En-tête du rapport</div>
        <div className="grid grid-cols-3 gap-3 text-[12.5px]">
          <Info label="Intitulé" value={report.title} />
          <Info label="Type" value={report.typeName || "-"} />
          <Info label="Statut" value={STATUS[report.status] ?? report.status} />
          <Info label="Lead" value={report.lead.name} />
          <Info label="Scribe" value={report.scribe?.name ?? "-"} />
          <Info label="Lieu" value={report.lieu || "-"} />
        </div>
      </div>

      <div className="mb-5">
        <DocBlock title="Détails">
          <div className="whitespace-pre-wrap rounded-[8px] border p-4 text-[12.5px] leading-[1.6]" style={{ borderColor: "#e5e8ec" }}>
            {body.trim() || "Aucun contenu rédigé."}
          </div>
        </DocBlock>
      </div>

      {report.suspects.length > 0 && (
        <div className="mb-5">
          <DocBlock title="Personnes impliquées">
            <div className="flex flex-col gap-2">
              {report.suspects.map((s) => (
                <div key={s._id} className="flex items-center gap-3 rounded-[8px] border p-3 text-[12.5px]" style={{ borderColor: "#e5e8ec" }}>
                  <span className="flex-1 font-semibold">{s.name}</span>
                  {s.dob && <span className="font-data text-[11px]" style={{ color: "#5c626e" }}>Né(e) le {s.dob}</span>}
                </div>
              ))}
            </div>
          </DocBlock>
        </div>
      )}

      {(report.vehicles.length > 0 || report.weapons.length > 0) && (
        <div className="mb-5 grid grid-cols-2 gap-4">
          {report.vehicles.length > 0 && (
            <DocBlock title="Véhicules">
              <div className="flex flex-col gap-[6px]">
                {report.vehicles.map((v) => (
                  <div key={v._id} className="rounded-[8px] border p-[9px] text-[12px]" style={{ borderColor: "#e5e8ec" }}>{v.label}</div>
                ))}
              </div>
            </DocBlock>
          )}
          {report.weapons.length > 0 && (
            <DocBlock title="Armes">
              <div className="flex flex-col gap-[6px]">
                {report.weapons.map((w) => (
                  <div key={w._id} className="rounded-[8px] border p-[9px] text-[12px]" style={{ borderColor: "#e5e8ec" }}>{w.label}</div>
                ))}
              </div>
            </DocBlock>
          )}
        </div>
      )}

      {report.contributors.length > 0 && (
        <div className="mb-2">
          <DocBlock title="Agents impliqués">
            <div className="flex flex-wrap gap-2">
              {report.contributors.map((c) => (
                <span key={c.agentId} className="rounded-[6px] border px-[9px] py-[4px] text-[11.5px] font-semibold" style={{ borderColor: "#e5e8ec" }}>{c.name}</span>
              ))}
            </div>
          </DocBlock>
        </div>
      )}
    </OfficialDoc>
  );
}
