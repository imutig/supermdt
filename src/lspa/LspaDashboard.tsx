import { useQuery } from "convex/react";
import { GraduationCap, Users, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { SkeletonRows } from "@/components/common/Skeleton";

// Accueil du portail. Volontairement sobre pour l'instant : il s'enrichira des
// éléments propres à l'académie (sessions à venir, progression) au fil des lots.
export function LspaDashboard() {
  const me = useMe();
  const o = useQuery(api.lspa.overview);

  const cards = [
    { label: "Cadets en formation", value: o?.cadets, icon: GraduationCap },
    { label: "Encadrants", value: o?.encadrants, icon: Users },
    { label: "Inscriptions en attente", value: o?.enAttente, icon: UserPlus },
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">
          Bonjour, {me?.agent.prenomRP ?? ""}.
        </h1>
        <div className="mt-[3px] text-[13px] text-muted">
          {me?.academyRank
            ? <>Académie · <span style={{ color: me.academyRank.color ?? "var(--accent)" }}>{me.academyRank.name}</span></>
            : "Los Santos Police Academy"}
        </div>
      </div>

      {o === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={3} /></div>
      ) : (
        <div className="mdt-stagger grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="bg-surface px-[15px] py-[14px]">
              <div className="mb-[7px] flex items-center gap-[7px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                <c.icon className="h-[13px] w-[13px]" />
                {c.label}
              </div>
              <div className="font-data text-[22px] font-bold tracking-tight">{c.value ?? 0}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
