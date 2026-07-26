import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, Users, ChevronRight, ArrowLeft, GraduationCap, CheckCircle2, Ban, RotateCcw, Ticket, Copy, BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { AgentPicker } from "@/components/common/AgentPicker";
import { CadetSheetPanel } from "./CadetSheetPanel";

const MEMBER_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "En formation", color: "var(--accent)" },
  GRADUATED: { label: "Diplômé", color: "var(--accent)" },
  REJECTED: { label: "Écarté", color: "var(--danger)" },
};

// ---------- Liste des promotions ----------
export function LspaPromotions() {
  const promos = useQuery(api.promotions.list);
  const create = useMutation(api.promotions.create);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useCan();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<"list" | "compare">("list");

  const open = (promos ?? []).filter((p) => p.status === "OPEN");
  const closed = (promos ?? []).filter((p) => p.status !== "OPEN");

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Promotions</h1>
          <div className="mt-[3px] text-[13px] text-muted">Les cohortes de cadets, de l'admission à la diplomation.</div>
        </div>
        {can("effectif.validate") && (
          <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-[15px] w-[15px]" /> Nouvelle promotion</Button>
        )}
      </div>

      <div className="mb-[16px] flex items-center gap-[6px]">
        <button onClick={() => setView("list")} className="rounded-[7px] px-[11px] py-[6px] text-[12.5px] font-semibold" style={view === "list" ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}>Liste</button>
        <button onClick={() => setView("compare")} className="flex items-center gap-[6px] rounded-[7px] px-[11px] py-[6px] text-[12.5px] font-semibold" style={view === "compare" ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}><BarChart3 className="h-[13px] w-[13px]" /> Comparaison</button>
      </div>

      {creating && (
        <Modal title="Nouvelle promotion" icon={<GraduationCap className="h-[17px] w-[17px]" />} onClose={() => setCreating(false)} width={440}
          footer={<>
            <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={async () => {
              const id = await toast.guard(create({ name: name.trim() }), "Création impossible");
              if (id) { setCreating(false); setName(""); navigate(`/lspa/promotions/${id}`); }
            }}>Créer</Button>
          </>}
        >
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Nom de la promotion</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Promotion Janvier 2026" className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13.5px] outline-none focus:border-accent" />
          </label>
        </Modal>
      )}

      {view === "compare" ? (
        <CompareView />
      ) : promos === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>
      ) : promos.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucune promotion" message="Créez une promotion pour accueillir une cohorte de cadets." /></div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          <PromoGroup promos={open} onOpen={(id) => navigate(`/lspa/promotions/${id}`)} />
          {closed.length > 0 && (
            <div>
              <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Archives · promotions clôturées</h2>
              <PromoGroup promos={closed} onOpen={(id) => navigate(`/lspa/promotions/${id}`)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromoGroup({ promos, onOpen }: { promos: { _id: string; name: string; status: string; startAt: number; cadets: number }[]; onOpen: (id: string) => void }) {
  if (promos.length === 0) return <div className="rounded-card border border-dashed border-border bg-surface px-4 py-[16px] text-center text-[12.5px] text-faint">Aucune promotion ouverte.</div>;
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {promos.map((p) => (
        <button key={p._id} onClick={() => onOpen(p._id)} className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[13px] text-left last:border-b-0 hover:bg-surface-2">
          <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-accent"><GraduationCap className="h-[16px] w-[16px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{p.name}</div>
            <div className="mt-[2px] flex items-center gap-[10px] text-[11.5px] text-muted">
              <span className="flex items-center gap-[4px]"><Users className="h-[12px] w-[12px]" /> {p.cadets} en formation</span>
              <span>Ouverte le {new Date(p.startAt).toLocaleDateString("fr-FR")}</span>
            </div>
          </div>
          <span className="flex-shrink-0 rounded-[7px] px-[9px] py-[4px] text-[11px] font-bold uppercase tracking-[0.06em]" style={{ background: `color-mix(in srgb, ${p.status === "OPEN" ? "var(--accent)" : "var(--muted)"} 13%, transparent)`, color: p.status === "OPEN" ? "var(--accent)" : "var(--muted)" }}>
            {p.status === "OPEN" ? "Ouverte" : "Clôturée"}
          </span>
          <ChevronRight className="h-[16px] w-[16px] flex-shrink-0 text-faint" />
        </button>
      ))}
    </div>
  );
}

// Comparaison de toutes les promotions : effectif, issues et niveau côte à côte.
function CompareView() {
  const data = useQuery(api.promotions.summary);
  const navigate = useNavigate();
  if (data === undefined) return <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>;
  if (data.promos.length === 0) return <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucune promotion" message="Rien à comparer pour l'instant." /></div>;

  const th = "px-[12px] py-[9px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint";
  const td = "px-[12px] py-[10px] text-[12.5px]";
  const pctColor = (p: number | null) => p === null ? "var(--muted)" : p >= 70 ? "var(--accent)" : p >= 40 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b border-border">
            <th className={`${th} text-left`}>Promotion</th>
            <th className={th}>Effectif</th>
            <th className={th}>En formation</th>
            <th className={th}>Diplômés</th>
            <th className={th}>Écartés</th>
            <th className={th}>Note moyenne</th>
            <th className={th}>Moyenne quiz</th>
          </tr>
        </thead>
        <tbody>
          {data.promos.map((p) => (
            <tr key={p._id} onClick={() => navigate(`/lspa/promotions/${p._id}`)} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2">
              <td className={`${td} text-left`}>
                <div className="flex items-center gap-[8px]">
                  <span className="font-semibold">{p.name}</span>
                  {p.status !== "OPEN" && <span className="rounded-[5px] bg-surface-2 px-[6px] py-px text-[10px] font-bold uppercase text-faint">archivée</span>}
                </div>
                <div className="text-[11px] text-faint">{new Date(p.startAt).toLocaleDateString("fr-FR")}{p.endAt ? ` – ${new Date(p.endAt).toLocaleDateString("fr-FR")}` : ""}</div>
              </td>
              <td className={`${td} text-center font-data`}>{p.total}</td>
              <td className={`${td} text-center font-data`}>{p.active}</td>
              <td className={`${td} text-center font-data font-bold text-accent`}>{p.graduated}</td>
              <td className={`${td} text-center font-data`} style={{ color: p.rejected > 0 ? "var(--danger)" : "var(--muted)" }}>{p.rejected}</td>
              <td className={`${td} text-center`}>
                {p.noteMoyenne !== null ? <span className="font-data font-bold" style={{ color: pctColor(p.notePct) }}>{p.noteMoyenne}{data.gradingMax > 0 ? <span className="text-faint">/{data.gradingMax}</span> : null}</span> : <span className="text-faint">-</span>}
              </td>
              <td className={`${td} text-center`}>{p.quizAvg !== null ? <span className="font-data font-bold" style={{ color: pctColor(p.quizAvg) }}>{p.quizAvg}%</span> : <span className="text-faint">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Détail d'une promotion ----------
export function LspaPromotion() {
  const { id } = useParams<{ id: string }>();
  const promotionId = id as Id<"promotions">;
  const data = useQuery(api.promotions.get, { promotionId });
  const close = useMutation(api.promotions.close);
  const setStatus = useMutation(api.promotions.setMemberStatus);
  const navigate = useNavigate();
  const toast = useToast();
  const setGroup = useMutation(api.promotions.setGroup);
  const { can } = useCan();
  const manage = can("effectif.validate");
  const [adding, setAdding] = useState(false);
  const [grading, setGrading] = useState<{ memberId: string; name: string } | null>(null);
  const [showInvites, setShowInvites] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [sheetFor, setSheetFor] = useState<Id<"agents"> | null>(null);
  const [byGroup, setByGroup] = useState(false);

  if (data === undefined) return <div className="p-[22px_26px]"><SkeletonRows rows={5} /></div>;
  if (data === null) return <div className="p-[26px]"><EmptyState title="Promotion introuvable" action={<Button onClick={() => navigate("/lspa/promotions")}>Retour</Button>} /></div>;
  const { promo, members } = data;

  // Classement par note. Les écartés restent en bas. Le major est le premier de
  // chaque groupe (mode groupe) ou de la promo (mode total).
  const scoreOf = (m: typeof members[number]) => (m.status === "REJECTED" ? -1 : m.eliminated ? 0 : m.score ?? -1);
  const sorted = [...members].sort((a, b) => scoreOf(b) - scoreOf(a));
  const groupsPresent = Array.from(new Set(members.map((m) => m.group).filter(Boolean))) as string[];
  const useGroups = byGroup && groupsPresent.length > 0;
  // memberId -> true si major de son classement.
  const majors = new Set<string>();
  if (useGroups) {
    for (const g of groupsPresent) {
      const top = sorted.find((m) => m.group === g && m.status !== "REJECTED" && m.score !== null);
      if (top) majors.add(top.memberId);
    }
  } else {
    const top = sorted.find((m) => m.status !== "REJECTED" && m.score !== null);
    if (top) majors.add(top.memberId);
  }
  const ordered = useGroups
    ? [...sorted].sort((a, b) => (a.group ?? "~").localeCompare(b.group ?? "~"))
    : sorted;

  return (
    <div className="mx-auto w-full max-w-[1000px] p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <button onClick={() => navigate("/lspa/promotions")} className="mb-[14px] flex items-center gap-[6px] text-[12.5px] font-semibold text-muted hover:text-text"><ArrowLeft className="h-[14px] w-[14px]" /> Promotions</button>

      <div className="mb-[18px] flex flex-wrap items-center gap-[12px] rounded-card border border-border bg-surface p-[16px_18px]">
        <span className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-accent"><GraduationCap className="h-[20px] w-[20px]" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-bold">{promo.name}</h1>
          <div className="mt-[2px] text-[12.5px] text-muted">
            {members.filter((m) => m.status === "ACTIVE").length} en formation · {members.filter((m) => m.status === "GRADUATED").length} diplômé(s) · {promo.status === "OPEN" ? "ouverte" : "clôturée"}
          </div>
        </div>
        <Button onClick={() => setShowStats(true)}><BarChart3 className="h-[14px] w-[14px]" /> Statistiques</Button>
        {manage && <Button onClick={() => setShowInvites(true)}><Ticket className="h-[14px] w-[14px]" /> Codes d'accès</Button>}
        {manage && (
          <Button onClick={() => void toast.guard(close({ promotionId, reopen: promo.status === "CLOSED" }), "Action impossible")}>
            {promo.status === "OPEN" ? "Clôturer" : "Rouvrir"}
          </Button>
        )}
        {manage && promo.status === "OPEN" && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-[15px] w-[15px]" /> Ajouter un cadet</Button>}
      </div>

      {members.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucun cadet" message="Ajoutez des cadets ou distribuez un code d'accès rattaché à cette promotion." /></div>
      ) : (
        <>
          {groupsPresent.length > 0 && (
            <div className="mb-[10px] flex items-center gap-[7px]">
              <span className="text-[11.5px] text-muted">Classement :</span>
              <button onClick={() => setByGroup(false)} className="rounded-[7px] px-[10px] py-[5px] text-[12px] font-semibold" style={!byGroup ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}>Au total</button>
              <button onClick={() => setByGroup(true)} className="rounded-[7px] px-[10px] py-[5px] text-[12px] font-semibold" style={byGroup ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}>Par groupe</button>
            </div>
          )}
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {ordered.map((m, idx) => {
              const st = MEMBER_STATUS[m.status];
              const showGroupHeader = useGroups && (idx === 0 || ordered[idx - 1].group !== m.group);
              return (
                <div key={m.memberId}>
                  {showGroupHeader && (
                    <div className="border-b border-border bg-surface-2 px-[16px] py-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                      {m.group ? `Groupe ${m.group}` : "Sans groupe"}
                    </div>
                  )}
                  <div className="flex items-center gap-[11px] border-b border-border px-[16px] py-[11px] last:border-b-0">
                    <button onClick={() => setSheetFor(m.agentId)} className="flex min-w-0 flex-1 items-center gap-[11px] text-left hover:opacity-80">
                      <span className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
                        {m.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                      </span>
                      <span className="truncate text-[13.5px] font-semibold">{m.name}</span>
                      {majors.has(m.memberId) && <span className="rounded-[5px] px-[6px] py-[2px] text-[10px] font-bold uppercase text-accent" style={{ background: "var(--accent-soft)" }}>Major</span>}
                    </button>
                    <span className="flex-shrink-0 font-data text-[13px] font-bold" style={{ color: m.eliminated ? "var(--danger)" : "var(--text)" }}>{m.eliminated ? "Élim." : m.score ?? "-"}</span>
                    {manage && m.status !== "GRADUATED" ? (
                      <select
                        value={m.group ?? ""}
                        onChange={(e) => void toast.guard(setGroup({ memberId: m.memberId as Id<"promotionMembers">, group: e.target.value }), "Action impossible")}
                        className="h-[28px] flex-shrink-0 rounded-[7px] border border-border bg-surface-2 px-[6px] text-[12px] outline-none"
                        title="Groupe"
                      >
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </select>
                    ) : m.group ? <span className="text-[12px] text-muted">Gr. {m.group}</span> : null}
                    <span className="flex-shrink-0 rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 13%, transparent)`, color: st.color }}>{st.label}</span>
                    {manage && m.status !== "GRADUATED" && (
                      <div className="flex flex-shrink-0 items-center gap-[6px]">
                        {m.status === "ACTIVE" ? (
                          <>
                            <Button onClick={() => setGrading({ memberId: m.memberId, name: m.name })} className="!py-[5px] !text-[12px]"><CheckCircle2 className="h-[13px] w-[13px]" /> Diplômer</Button>
                            <button onClick={() => void toast.guard(setStatus({ memberId: m.memberId as Id<"promotionMembers">, status: "REJECTED" }), "Action impossible")} title="Écarter" className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-faint hover:text-danger"><Ban className="h-[13px] w-[13px]" /></button>
                          </>
                        ) : (
                          <button onClick={() => void toast.guard(setStatus({ memberId: m.memberId as Id<"promotionMembers">, status: "ACTIVE" }), "Action impossible")} title="Réintégrer" className="flex items-center gap-[5px] rounded-[7px] border border-border bg-surface-2 px-[9px] py-[6px] text-[12px] font-semibold text-muted hover:text-accent"><RotateCcw className="h-[13px] w-[13px]" /> Réintégrer</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {adding && <AddCadetModal promotionId={promotionId} onClose={() => setAdding(false)} />}
      {grading && <GraduateModal memberId={grading.memberId as Id<"promotionMembers">} name={grading.name} onClose={() => setGrading(null)} />}
      {showInvites && <InvitesModal promotionId={promotionId} invites={data.invites} onClose={() => setShowInvites(false)} canManage={manage} />}
      {showStats && <StatsModal promotionId={promotionId} onClose={() => setShowStats(false)} />}
      {sheetFor && <CadetSheetPanel agentId={sheetFor} onClose={() => setSheetFor(null)} />}
    </div>
  );
}

function AddCadetModal({ promotionId, onClose }: { promotionId: Id<"promotions">; onClose: () => void }) {
  const cadets = useQuery(api.promotions.assignableCadets);
  const add = useMutation(api.promotions.addMember);
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Ajouter un cadet" icon={<Users className="h-[17px] w-[17px]" />} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={selected.length === 0} onClick={async () => {
          setBusy(true);
          for (const a of selected) await toast.guard(add({ promotionId, agentId: a as Id<"agents"> }), "Ajout impossible");
          setBusy(false); onClose();
        }}>Ajouter</Button>
      </>}
    >
      {cadets === undefined ? <SkeletonRows rows={3} /> : cadets.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border px-3 py-[14px] text-center text-[12.5px] text-faint">Aucun cadet disponible. La plupart arrivent via un code d'accès rattaché à la promotion.</div>
      ) : (
        <AgentPicker roster={cadets} selected={selected} onChange={setSelected} placeholder="Rechercher un cadet…" />
      )}
    </Modal>
  );
}

function GraduateModal({ memberId, name, onClose }: { memberId: Id<"promotionMembers">; name: string; onClose: () => void }) {
  const graduate = useMutation(api.promotions.graduate);
  const toast = useToast();
  const [matricule, setMatricule] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`Diplômer ${name}`} icon={<GraduationCap className="h-[17px] w-[17px]" />} onClose={onClose} width={440}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={matricule.length !== 5} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(graduate({ memberId, matricule: Number(matricule) }), "Diplomation impossible");
          setBusy(false);
          if (r !== undefined) { toast.success(`${name} passe Officier 1.`); onClose(); }
        }}>Diplômer</Button>
      </>}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="text-[13px] text-muted">Le cadet passe au grade d'entrée (Officier 1) et reçoit son numéro de badge. Il devient agent de la Station 13.</div>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Numéro de badge</span>
          <input autoFocus value={matricule} onChange={(e) => setMatricule(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} placeholder="5 chiffres" className="h-10 w-[120px] rounded-sm border border-border bg-surface-2 px-3 text-center font-data text-[15px] outline-none focus:border-accent" />
        </label>
      </div>
    </Modal>
  );
}

function InvitesModal({ promotionId, invites, onClose, canManage }: {
  promotionId: Id<"promotions">;
  invites: { _id: string; code: string; usesCount: number; maxUses: number; revoked: boolean; usable: boolean }[];
  onClose: () => void;
  canManage: boolean;
}) {
  const create = useMutation(api.invitations.create);
  const revoke = useMutation(api.invitations.revoke);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Codes d'accès de la promotion" icon={<Ticket className="h-[17px] w-[17px]" />} onClose={onClose} width={500}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
    >
      <div className="flex flex-col gap-[12px]">
        <div className="text-[12.5px] text-muted">Un compte créé avec l'un de ces codes rejoint directement la promotion comme cadet, sans validation.</div>
        {canManage && (
          <Button variant="primary" loading={busy} onClick={async () => {
            setBusy(true);
            const code = await toast.guard(create({ type: "MULTI", promotionId }), "Génération impossible");
            setBusy(false);
            if (code) toast.success(`Code ${code} généré.`);
          }}>
            <Plus className="h-[15px] w-[15px]" /> Générer un code multi-usage
          </Button>
        )}
        {invites.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border px-3 py-[12px] text-center text-[12.5px] text-faint">Aucun code rattaché.</div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {invites.map((i) => (
              <div key={i._id} className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
                <span className="font-data text-[14px] font-bold text-accent">{i.code}</span>
                <button onClick={() => { void navigator.clipboard?.writeText(i.code); toast.success("Code copié."); }} title="Copier" className="text-faint hover:text-text"><Copy className="h-[13px] w-[13px]" /></button>
                <span className="text-[11.5px] text-muted">{i.usesCount}/{i.maxUses}</span>
                <div className="flex-1" />
                <span className="text-[11.5px] font-semibold" style={{ color: i.usable ? "var(--accent)" : "var(--muted)" }}>{i.revoked ? "Révoqué" : i.usable ? "Actif" : "Épuisé"}</span>
                {canManage && !i.revoked && <button onClick={() => void revoke({ id: i._id as Id<"invitations"> })} className="text-[11.5px] font-semibold text-faint hover:text-danger">Révoquer</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatsModal({ promotionId, onClose }: { promotionId: Id<"promotions">; onClose: () => void }) {
  const stats = useQuery(api.promotions.stats, { promotionId });
  return (
    <Modal title="Statistiques de la promotion" icon={<BarChart3 className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
    >
      {stats === undefined ? <SkeletonRows rows={4} /> : (
        <div className="flex flex-col gap-[16px]">
          <div>
            <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Moyenne par catégorie</div>
            {stats.byCategory.length === 0 ? <div className="text-[12.5px] text-faint">Aucune donnée pour l'instant.</div> : (
              <div className="flex flex-col gap-[8px]">
                {stats.byCategory.map((c, i) => {
                  const tint = c.color ?? (c.average >= 70 ? "var(--accent)" : c.average >= 40 ? "var(--warning)" : "var(--danger)");
                  return (
                    <div key={i}>
                      <div className="mb-[3px] flex items-center justify-between text-[12px]"><span className="font-semibold">{c.name}</span><span className="font-data" style={{ color: tint }}>{c.average}%</span></div>
                      <div className="h-[5px] overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${c.average}%`, background: tint }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Classement des cadets</div>
            {stats.perCadet.length === 0 ? <div className="text-[12.5px] text-faint">Aucun cadet.</div> : (
              <div className="flex flex-col gap-[4px]">
                {stats.perCadet.map((c, i) => (
                  <div key={c.agentId} className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
                    <span className="font-data text-[12px] text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{c.name}</span>
                    {c.status === "GRADUATED" && <GraduationCap className="h-[13px] w-[13px] text-accent" />}
                    <span className="font-data text-[13px] font-bold">{c.average !== null ? `${c.average}%` : "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
