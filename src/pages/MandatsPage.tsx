import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

function relTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export function MandatsPage() {
  const mandatsQ = useQuery(api.mandats.active);
  const mandats = mandatsQ ?? [];
  const navigate = useNavigate();

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-center gap-[9px]">
        <span className="h-[8px] w-[8px] rounded-full" style={{ background: "#dc2626", animation: "mdtPulse 1.6s ease-in-out infinite" }} />
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Mandats actifs</h1>
        <span className="text-[13px] text-faint">temps réel · qui est recherché</span>
        <div className="flex-1" />
        <span className="font-data text-[13px] font-semibold text-muted">{mandats.length}</span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.4fr_2fr_1fr_.8fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Individu</span>
          <span>Motif</span>
          <span>Type</span>
          <span>Émis</span>
        </div>
        {mandatsQ === undefined && <div className="p-4"><SkeletonRows rows={4} /></div>}
        {mandatsQ !== undefined && mandats.length === 0 && <EmptyState title="Aucun mandat actif" message="La chance est de votre côté aujourd'hui." />}
        {mandats.map((m) => (
          <div
            key={m._id}
            onClick={() => navigate(`/citoyen/${m.citizenId}`)}
            className="grid cursor-pointer grid-cols-[1.4fr_2fr_1fr_.8fr] items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-2"
          >
            <span className="text-[13px] font-semibold">{m.citizenName}</span>
            <span className="text-[12.5px] text-muted">{m.motif}</span>
            <span>
              <span className="rounded-[5px] px-[7px] py-[2px] text-[10px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {m.typeName}
              </span>
            </span>
            <span className="text-[11.5px] text-muted">{relTime(m.issuedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
