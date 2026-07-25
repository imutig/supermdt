import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { GraduationCap, Users, Plus, X, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { readableError } from "@/lib/errors";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { fmtBadge } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { AgentPicker } from "@/components/common/AgentPicker";

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
  const navigate = useNavigate();
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
                  <Row key={c._id} p={c as Person} hideBadge onOpen={() => navigate(`/lspa/cadet/${c._id}`)}>
                    <span className="text-[12px] text-faint">
                      {c.dateEntree ? `Entré le ${new Date(c.dateEntree).toLocaleDateString("fr-FR")}` : "Date d'entrée inconnue"}
                    </span>
                    <ChevronRight className="h-[15px] w-[15px] flex-shrink-0 text-faint" />
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
              manage ? (
                <Button onClick={() => setAdding(true)} className="!py-[5px] !text-[12px]">
                  <Plus className="h-[13px] w-[13px]" />
                  Ajouter
                </Button>
              ) : undefined
            }
          >
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

      {adding && data && (
        <AddEncadrantModal
          agents={data.assignables as Person[]}
          ranks={data.ranks as Rank[]}
          onClose={() => setAdding(false)}
          onPick={async (agentId, rankId) => {
            await apply(agentId, rankId);
            setAdding(false);
          }}
        />
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

function Row({ p, hideBadge, onOpen, children }: { p: Person; hideBadge?: boolean; onOpen?: () => void; children?: React.ReactNode }) {
  const badge = !hideBadge ? fmtBadge(p.matricule) : null;
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      onClick={onOpen}
      className={`flex w-full items-center gap-[11px] border-b border-border px-[15px] py-[10px] text-left last:border-b-0 ${onOpen ? "hover:bg-surface-2" : ""}`}
    >
      <Avatar p={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px] text-[13.5px] font-semibold">
          <span className="truncate">{p.prenomRP} {p.nomRP}</span>
          {p.onDuty && <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-accent" title="En service" />}
        </div>
        <div className="mt-[1px] flex items-center gap-[7px] text-[11.5px] text-muted">
          {badge && <span className="font-data text-accent">{badge}</span>}
          <span>{p.grade ?? "Sans grade"}</span>
        </div>
      </div>
      {children}
    </Tag>
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

// Ajout d'un encadrant : on choisit un agent (recherche vivante) puis le grade
// d'académie à lui attribuer. En modale, jamais greffé sur la page.
function AddEncadrantModal({
  agents, ranks, onClose, onPick,
}: {
  agents: Person[];
  ranks: Rank[];
  onClose: () => void;
  onPick: (agentId: Id<"agents">, rankId: Id<"academyRanks">) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rankId, setRankId] = useState<Id<"academyRanks"> | "">(ranks[0]?._id ?? "");
  const [busy, setBusy] = useState(false);
  const agentId = selected[0] as Id<"agents"> | undefined;

  async function submit() {
    if (!agentId || !rankId) return;
    setBusy(true);
    await onPick(agentId, rankId);
    setBusy(false);
  }

  return (
    <Modal
      title="Ajouter un encadrant"
      icon={<Users className="h-[17px] w-[17px]" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!agentId || !rankId} onClick={() => void submit()}>Attribuer le grade</Button>
        </>
      }
    >
      <div className="flex flex-col gap-[16px]">
        <label className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Agent</span>
          {agents.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border px-3 py-[10px] text-[12.5px] text-faint">
              Aucun agent disponible. Seuls les agents actifs de la station, sans grade d'académie, apparaissent ici.
            </div>
          ) : (
            <AgentPicker
              roster={agents.map((a) => ({ _id: a._id, prenomRP: a.prenomRP, nomRP: a.nomRP, matricule: a.matricule }))}
              selected={selected}
              onChange={(ids) => setSelected(ids.slice(-1))}
              placeholder="Rechercher un agent de la station…"
            />
          )}
        </label>

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Grade d'académie</span>
          <select
            value={rankId}
            onChange={(e) => setRankId(e.target.value as Id<"academyRanks">)}
            className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
          >
            {ranks.map((r) => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
