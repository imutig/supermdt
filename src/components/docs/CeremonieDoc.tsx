import { OfficialDoc, DocBlock, Info } from "@/components/docs/OfficialDoc";
import { fmtMatricule } from "@/components/common/AgentTag";

type Promotion = { _id: string; agentName: string; matricule: number | null; fromGrade: string | null; toGrade: string };
type Reminder = { _id: string; text: string };

// Document officiel d'une cérémonie : date/heure/lieu, montées en grade et
// rappels. Réutilise l'ossature OfficialDoc (une seule feuille, capturée en PNG).
export function CeremonieDoc({
  ceremony,
  onClose,
}: {
  ceremony: { _id: string; title: string; at: number; startTime: string; lieu: string | null; notes: string | null; reminders: Reminder[]; promotions: Promotion[] };
  onClose: () => void;
}) {
  const dateStr = new Date(ceremony.at).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
  const year = new Date(ceremony.at).getUTCFullYear();
  const ref = `CER-${String(ceremony._id).slice(-6).toUpperCase()}-${year}`;
  const slug = ceremony.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ceremonie";

  const promoLines = ceremony.promotions.map((p) => `${fmtMatricule(p.matricule) ?? "-"} ${p.agentName} : ${p.fromGrade ?? "-"} -> ${p.toGrade}`);
  const description = [
    `Cérémonie du ${dateStr} à ${ceremony.startTime} (heure de Paris).`,
    ceremony.promotions.length ? `${ceremony.promotions.length} montée(s) en grade.` : null,
  ].filter(Boolean).join(" ");

  return (
    <OfficialDoc
      toolbarTitle="Cérémonie officielle"
      title={ceremony.title}
      subtitle="Cérémonie officielle · délivrée par le département de police de Los Santos"
      reference={ref}
      filename={`ceremonie-${slug}.png`}
      discordEvent="ceremony.publish"
      discordEmbed={{
        title: `Cérémonie : ${ceremony.title}`,
        description,
        color: 0x49a24a,
        fields: ceremony.promotions.length
          ? [{ name: "Montées en grade", value: promoLines.slice(0, 12).join("\n") + (promoLines.length > 12 ? `\n… +${promoLines.length - 12}` : "") }]
          : undefined,
      }}
      onClose={onClose}
    >
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-[8px] border p-4" style={{ borderColor: "#e5e8ec" }}>
        <Info label="Date" value={dateStr} />
        <Info label="Heure" value={`${ceremony.startTime} (Paris)`} />
        <Info label="Lieu" value={ceremony.lieu ?? "LSPD · Station 13"} />
      </div>

      {ceremony.promotions.length > 0 && (
        <div className="mb-6">
          <DocBlock title="Montées en grade">
            <div className="overflow-hidden rounded-[8px] border" style={{ borderColor: "#e5e8ec" }}>
              <div className="grid grid-cols-[100px_1fr_1fr] gap-3 border-b bg-[#f4f6f8] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>
                <span>N° badge</span>
                <span>Agent</span>
                <span>Grade</span>
              </div>
              {ceremony.promotions.map((p) => (
                <div key={p._id} className="grid grid-cols-[100px_1fr_1fr] items-center gap-3 border-b px-4 py-[9px] text-[13px] last:border-0" style={{ borderColor: "#eef1f4" }}>
                  <span className="font-data font-semibold" style={{ color: "#2E6B2F" }}>{fmtMatricule(p.matricule) ?? "-"}</span>
                  <span className="font-semibold">{p.agentName}</span>
                  <span>
                    <span style={{ color: "#98a0ab" }}>{p.fromGrade ?? "-"}</span>
                    <span style={{ color: "#98a0ab" }}> → </span>
                    <span className="font-semibold">{p.toGrade}</span>
                  </span>
                </div>
              ))}
            </div>
          </DocBlock>
        </div>
      )}

      {ceremony.reminders.length > 0 && (
        <div className="mb-2">
          <DocBlock title="Rappels">
            <ul className="ml-5 list-disc space-y-1 text-[13px]">
              {ceremony.reminders.map((r) => (
                <li key={r._id}>{r.text}</li>
              ))}
            </ul>
          </DocBlock>
        </div>
      )}

      {ceremony.notes && (
        <div className="mt-4 text-[12.5px]" style={{ color: "#5c626e" }}>{ceremony.notes}</div>
      )}
    </OfficialDoc>
  );
}
