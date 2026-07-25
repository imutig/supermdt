import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { GraduationCap, Users, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { readableError } from "@/lib/errors";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { fmtBadge } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";

// Effectif de l'académie. Deux populations distinctes : la promotion en cours
// (les cadets) et l'encadrement. Un encadrant garde son grade LSPD ; le grade
// d'académie se superpose, ce que la mise en page rend visible.
type Person = {
  _id: Id<"agents">;
  prenomRP: string;
  nomRP: string;
  matricule: number | null;
  avatarUrl: string | null;
  dateEntree: number | null;
  onDuty: boolean;
  grade: string | null;
};
type Rank = { _id: Id<"academyRanks">; name: string; abbrev: string; color?: string; position: number };

export function LspaEffectif() {
  const data = useQuery(api.lspa.effectif);
  const setRank = useMutation(api.lspa.setAcademyRank);
  const { can } = useCan();
  const manage = can("lspa.rank.manage");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply(agentId: Id<"agents">, rankId?: Id<"academyRanks">) {
    setErr(null);
    try {
      await setRank({ agentId, rankId });
    } catch (e) {
      setErr(readableError(e));
    }
  }

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Effectif de l'académie</h1>
        <div className="mt-[3px] text-[13px] text-muted">
          La promotion en formation et son encadrement.
        </div>
      </div>

      {err && (
        <div
          className="mb-[14px] rounded-[9px] px-[13px] py-[10px] text-[12.5px]"
          style={{ background: "rgba(220,38,38,.09)", border: "1px solid rgba(220,38,38,.3)", color: "#c02828" }}
        >
          {err}
        </div>
      )}

      {data === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          <Section
            icon={<GraduationCap className="h-[14px] w-[14px]" />}
            title="Promotion"
            count={data.cadets.length}
          >
            {data.cadets.length === 0 ? (
              <EmptyState compact title="Aucun cadet" message="Les comptes au grade Cadet apparaîtront ici." />
            ) : (
              <div className="flex flex-col">
                {data.cadets.map((c) => (
                  <Row key={c._id} p={c as Person}>
                    <span className="text-[12px] text-faint">
                      {c.dateEntree ? `Entré le ${new Date(c.dateEntree).toLocaleDateString("fr-FR")}` : "Date d'entrée inconnue"}
                    </span>
                  </Row>
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={<Users className="h-[14px] w-[14px]" />}
            title="Encadrement"
            count={data.encadrants.length}
            action={
              manage && !adding && data.assignables.length > 0 ? (
                <Button onClick={() => setAdding(true)} className="!py-[5px] !text-[12px]">
                  <Plus className="h-[13px] w-[13px]" />
                  Ajouter
                </Button>
              ) : undefined
            }
          >
            {adding && (
              <AddPanel
                agents={data.assignables as Person[]}
                ranks={data.ranks as Rank[]}
                onClose={() => setAdding(false)}
                onPick={async (agentId, rankId) => {
                  await apply(agentId, rankId);
                  setAdding(false);
                }}
              />
            )}
            {data.encadrants.length === 0 ? (
              <EmptyState compact title="Aucun encadrant" message="Attribuez un grade d'académie à un agent." />
            ) : (
              <div className="flex flex-col">
                {data.encadrants.map((e) => (
                  <Row key={e._id} p={e as Person}>
                    {manage ? (
                      <div className="flex items-center gap-[6px]">
                        <select
                          value={e.rank._id}
                          onChange={(ev) => void apply(e._id, ev.target.value as Id<"academyRanks">)}
                          className="h-[28px] rounded-[7px] border border-border bg-surface-2 px-[8px] text-[12px] text-text outline-none"
                        >
                          {data.ranks.map((r) => (
                            <option key={r._id} value={r._id}>{r.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => void apply(e._id, undefined)}
                          title="Retirer de l'encadrement"
                          className="mdt-press flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-faint hover:text-danger"
                        >
                          <X className="h-[13px] w-[13px]" />
                        </button>
                      </div>
                    ) : (
                      <RankChip rank={e.rank as Rank} />
                    )}
                  </Row>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  icon, title, count, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex h-[42px] items-center gap-[9px] border-b border-border px-[15px]">
        <span className="text-faint">{icon}</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.09em]">{title}</span>
        <span className="font-data text-[12px] text-faint">{count}</span>
        <div className="flex-1" />
        {action}
      </header>
      {children}
    </section>
  );
}

function Row({ p, children }: { p: Person; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[11px] border-b border-border px-[15px] py-[10px] last:border-b-0">
      <Avatar p={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px] text-[13.5px] font-semibold">
          <span className="truncate">{p.prenomRP} {p.nomRP}</span>
          {p.onDuty && <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-accent" title="En service" />}
        </div>
        <div className="mt-[1px] flex items-center gap-[7px] text-[11.5px] text-muted">
          {fmtBadge(p.matricule) && <span className="font-data text-accent">{fmtBadge(p.matricule)}</span>}
          <span>{p.grade ?? "Sans grade"}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function Avatar({ p }: { p: Person }) {
  if (p.avatarUrl) {
    return <img src={p.avatarUrl} alt="" className="h-[34px] w-[34px] flex-shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-muted">
      {p.prenomRP.charAt(0)}{p.nomRP.charAt(0)}
    </span>
  );
}

function RankChip({ rank }: { rank: Rank }) {
  const c = rank.color ?? "var(--accent)";
  return (
    <span
      className="flex-shrink-0 rounded-[6px] px-[8px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
      title={rank.name}
    >
      {rank.abbrev || rank.name}
    </span>
  );
}

// Panneau d'ajout : on choisit l'agent puis le grade d'académie à lui donner.
function AddPanel({
  agents, ranks, onClose, onPick,
}: {
  agents: Person[];
  ranks: Rank[];
  onClose: () => void;
  onPick: (agentId: Id<"agents">, rankId: Id<"academyRanks">) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [agentId, setAgentId] = useState<Id<"agents"> | "">("");
  const [rankId, setRankId] = useState<Id<"academyRanks"> | "">(ranks[0]?._id ?? "");

  const needle = q.trim().toLowerCase();
  const list = needle
    ? agents.filter((a) => `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(needle))
    : agents;

  return (
    <div className="border-b border-border bg-surface-2 p-[13px_15px]">
      <div className="mb-[9px] flex items-center gap-[9px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un agent…"
          className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-border bg-surface px-[10px] text-[13px] text-text outline-none"
        />
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value as Id<"agents">)}
          className="h-[32px] max-w-[220px] flex-1 rounded-[8px] border border-border bg-surface px-[8px] text-[13px] text-text outline-none"
        >
          <option value="">Choisir un agent…</option>
          {list.map((a) => (
            <option key={a._id} value={a._id}>{a.prenomRP} {a.nomRP}</option>
          ))}
        </select>
        <select
          value={rankId}
          onChange={(e) => setRankId(e.target.value as Id<"academyRanks">)}
          className="h-[32px] rounded-[8px] border border-border bg-surface px-[8px] text-[13px] text-text outline-none"
        >
          {ranks.map((r) => (
            <option key={r._id} value={r._id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-[8px]">
        <Button
          variant="primary"
          disabled={!agentId || !rankId}
          onClick={() => agentId && rankId && void onPick(agentId, rankId)}
          className="!py-[6px] !text-[12.5px]"
        >
          Attribuer
        </Button>
        <Button variant="ghost" onClick={onClose} className="!py-[6px] !text-[12.5px]">Annuler</Button>
      </div>
    </div>
  );
}
