import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Lock, FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { CASE_STATUS, PRIORITY, SUBDIV_LABEL, Pill, Field, inputCls, selectCls, dtShort } from "./ui";
import { AgentPicker } from "./pickers";

export function CasesSection({ divisionId, canWrite, onOpen }: {
  divisionId: Id<"divisions">; canWrite: boolean; onOpen: (id: Id<"dbCases">) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [subDivision, setSubDivision] = useState<string>("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const cases = useQuery(api.detective.listCases, {
    divisionId,
    status: (status || undefined) as any,
    subDivision: (subDivision || undefined) as any,
    q: q.trim() || undefined,
  });

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une enquête (n° ou titre)…" className={`${inputCls} pl-9`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">Tous statuts</option>
          {Object.entries(CASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={subDivision} onChange={(e) => setSubDivision(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">GND + HRD</option>
          <option value="GND">GND</option>
          <option value="HRD">HRD</option>
        </select>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle enquête</Button>}
      </div>

      {cases === undefined ? <SkeletonRows rows={5} /> : cases.length === 0 ? (
        <EmptyState title="Aucune enquête" message="Ouvrez une enquête pour commencer." />
      ) : (
        <div className="flex flex-col gap-[8px]">
          {cases.map((c) => (
            <button key={c._id} onClick={() => onOpen(c._id)}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-[12px_14px] text-left hover:border-border-strong">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-faint"><FolderOpen className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-data text-[12px] text-faint">#{c.number}</span>
                  <span className="truncate text-[14px] font-semibold">{c.title}</span>
                  {c.confidential && <Lock className="h-3.5 w-3.5 text-danger" />}
                </div>
                <div className="mt-[3px] flex items-center gap-2 text-[11.5px] text-muted">
                  {c.subDivision && <span className="rounded-[4px] border border-border px-1.5 py-px text-[10px] font-bold">{c.subDivision}</span>}
                  {c.lead ? <span>Réf. {c.lead.name}</span> : <span className="text-faint">Sans référent</span>}
                  <span>· {dtShort(c.at)}</span>
                </div>
              </div>
              <Pill {...PRIORITY[c.priority]} />
              <Pill {...CASE_STATUS[c.status]} />
            </button>
          ))}
        </div>
      )}

      {creating && <CreateCasePanel divisionId={divisionId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}

function CreateCasePanel({ divisionId, onClose, onCreated }: {
  divisionId: Id<"divisions">; onClose: () => void; onCreated: (id: Id<"dbCases">) => void;
}) {
  const create = useMutation(api.detective.createCase);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [subDivision, setSubDivision] = useState<string>("");
  const [priority, setPriority] = useState("MEDIUM");
  const [confidential, setConfidential] = useState(false);
  const [lead, setLead] = useState<{ agentId: Id<"agents">; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("Titre requis."); return; }
    setBusy(true);
    const id = await toast.guard(create({
      divisionId, title: title.trim(),
      subDivision: (subDivision || undefined) as any,
      priority: priority as any, confidential,
      leadAgentId: lead?.agentId,
    }), "Création impossible");
    setBusy(false);
    if (id) { toast.success("Enquête ouverte."); onCreated(id as Id<"dbCases">); }
  };

  return (
    <Modal title="Nouvelle enquête" onClose={onClose} width={480}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} onClick={submit}>Ouvrir l'enquête</Button></div>}>
      <div className="flex flex-col gap-[14px]">
        <Field label="Titre"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ex. Braquage bijouterie Vinewood" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label="Sous-division">
            <select value={subDivision} onChange={(e) => setSubDivision(e.target.value)} className={selectCls}>
              <option value="">—</option>
              <option value="GND">GND — {SUBDIV_LABEL.GND}</option>
              <option value="HRD">HRD — {SUBDIV_LABEL.HRD}</option>
            </select>
          </Field>
          <Field label="Priorité">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Détective référent (Lead)">
          {lead ? (
            <div className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]">
              <span>{lead.name}</span>
              <button onClick={() => setLead(null)} className="text-[12px] text-danger hover:underline">Retirer</button>
            </div>
          ) : <AgentPicker divisionId={divisionId} onPick={setLead} />}
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          <span>Enquête confidentielle <span className="text-faint">(réservée aux habilités « éléments sensibles »)</span></span>
        </label>
      </div>
    </Modal>
  );
}
