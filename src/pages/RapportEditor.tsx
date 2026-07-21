import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X, Search, Trash2, FileText } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useTiptapSync } from "@convex-dev/prosemirror-sync/tiptap";
import { EditorContent, useEditor } from "@tiptap/react";
import { api, type Id } from "@/lib/api";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { RapportDoc } from "@/components/docs/RapportDoc";
import { RichTextEditor, RichTextToolbar, richTextExtensions } from "@/components/common/RichTextEditor";
import { AgentTag } from "@/components/common/AgentTag";
import { ImageGallery } from "@/components/common/ImageGallery";
import { LosSantosMap } from "@/components/carte/LosSantosMap";
import { CasingsEditor, type Casing } from "@/components/dossier/CasingsEditor";
import { LoadingScreen } from "@/components/common/Loader";

const STATUS: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon", color: "var(--muted)" },
  SOUMIS: { label: "Soumis", color: "var(--warning)" },
  VALIDE: { label: "Validé", color: "var(--success)" },
};

export function RapportEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportId = id as Id<"reports">;
  const report = useQuery(api.reports.get, { id: reportId });
  const roster = useQuery(api.agents.roster);
  const { can } = useCan();
  const toast = useToast();

  const setStatus = useMutation(api.reports.setStatus);
  const open = useMutation(api.reports.open);
  const remove = useMutation(api.reports.remove);
  const setLieu = useMutation(api.reports.setLieu);
  const setMapPos = useMutation(api.reports.setMapPos);
  const carte = useQuery(api.carte.get);
  const setRole = useMutation(api.reports.setRole);
  const setGallery = useMutation(api.reports.setGallery);
  const addSuspect = useMutation(api.reports.addSuspect);
  const removeSuspect = useMutation(api.reports.removeSuspect);
  const addContributor = useMutation(api.reports.addContributor);
  const removeContributor = useMutation(api.reports.removeContributor);
  const setVehicles = useMutation(api.reports.setVehicles);
  const setWeapons = useMutation(api.reports.setWeapons);
  const setCasings = useMutation(api.reports.setCasings);
  const [doc, setDoc] = useState(false);

  useEffect(() => {
    if (id) open({ id: reportId }).catch(() => {});
  }, [id, reportId, open]);

  const canValidate = can("rapports.validate");
  const canDelete = can("rapports.delete");

  if (report === undefined) return <LoadingScreen label="Chargement du rapport…" />;
  if (report === null) {
    return (
      <div className="p-[22px_26px] text-[13px] text-muted">
        Rapport introuvable.{" "}
        <span onClick={() => navigate("/rapports")} className="cursor-pointer text-accent hover:underline">Retour</span>
      </div>
    );
  }
  // Le corps du rapport vit dans l'éditeur collaboratif : on lit le texte rendu
  // pour le document officiel, qui reflète ainsi exactement l'écran.
  const bodyText = () => document.querySelector<HTMLElement>(".ProseMirror")?.innerText ?? "";

  const s = STATUS[report.status];
  const editable = report.status !== "VALIDE" && can("rapports.contribute");

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[14px] flex items-center gap-2 text-[12px] text-muted">
        <span onClick={() => navigate("/rapports")} className="cursor-pointer text-accent hover:underline">Rapports</span>
        <span className="text-faint">/</span>
        <span>{report.typeName}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4">
        <div className="flex-1">
          <h1 className="m-0 text-[20px] font-bold tracking-tight">{report.title}</h1>
          <div className="mt-1 text-[12.5px] text-muted">
            {report.typeName} · Lead <AgentTag agent={report.lead} /> ·{" "}
            <span className="font-semibold" style={{ color: s.color }}>{s.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDoc(true)} className="flex items-center gap-[6px] rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-semibold text-muted hover:border-border-strong">
            <FileText className="h-[15px] w-[15px]" /> Document officiel
          </button>
          {report.status === "BROUILLON" && can("rapports.submit") && (
            <button onClick={() => toast.guard(setStatus({ id: reportId, status: "SOUMIS" }), "Action impossible")} className="rounded-sm bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06]">Soumettre</button>
          )}
          {report.status === "SOUMIS" && (
            <>
              <button onClick={() => toast.guard(setStatus({ id: reportId, status: "BROUILLON" }), "Action impossible")} className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-semibold text-muted hover:border-border-strong">Rouvrir</button>
              {canValidate && <button onClick={() => toast.guard(setStatus({ id: reportId, status: "VALIDE" }), "Action impossible")} className="rounded-sm bg-success px-4 py-2 text-[12.5px] font-semibold text-white hover:brightness-[1.06]">Valider</button>}
            </>
          )}
          {report.status === "VALIDE" && canValidate && (
            <button onClick={() => toast.guard(setStatus({ id: reportId, status: "BROUILLON" }), "Action impossible")} className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-semibold text-muted hover:border-border-strong">Déverrouiller</button>
          )}
          {canDelete && (
            <button onClick={async () => { const r = await toast.guard(remove({ id: reportId }), "Suppression impossible"); if (r !== undefined) { toast.success("Rapport archivé."); navigate("/rapports"); } }} className="flex h-[36px] w-[36px] items-center justify-center rounded-sm border border-border bg-surface-2 text-faint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_330px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* Corps du rapport : rédaction collaborative et notes de terrain */}
          <ReportBody reportId={reportId} editable={editable} />

          {/* Galerie */}
          <Section title="Galerie">
            <ImageGallery urls={report.imageUrls} onChange={editable ? (urls) => toast.guard(setGallery({ reportId, imageUrls: urls }), "Mise à jour impossible") : undefined} emptyLabel="Aucune image." />
          </Section>

          {/* Douilles ramassées (item 9) */}
          <Section title="Douilles ramassées">
            <CasingsEditor
              value={report.casings as Casing[]}
              editable={editable}
              onChange={editable ? (v) => toast.guard(setCasings({ reportId, casings: v }), "Mise à jour impossible") : undefined}
            />
          </Section>
        </div>

        {/* Rail droit */}
        <div className="flex flex-col gap-[18px]">
          <Section title="Lieu de l'incident">
            <LieuInput value={report.lieu} editable={editable} onSave={(v) => setLieu({ reportId, lieu: v })} />
            {carte && (
              <div className="mt-2">
                <LosSantosMap
                  imageUrl={carte.imageUrl}
                  markers={carte.locations}
                  pin={report.mapX != null && report.mapY != null ? { x: report.mapX, y: report.mapY } : null}
                  onPick={editable ? (x, y) => setMapPos({ reportId, x, y }) : undefined}
                  height={180}
                />
                {editable && <div className="mt-1 text-[11px] text-faint">Cliquez sur la carte pour situer l'incident.</div>}
              </div>
            )}
          </Section>

          <Section title="Rôles">
            <div className="flex flex-col gap-[10px]">
              <RoleSelect label="Lead opé" value={report.leadId} roster={roster ?? []} editable={editable} onChange={(a) => toast.guard(setRole({ reportId, role: "lead", agentId: a as Id<"agents"> }), "Action impossible")} required />
              <RoleSelect label="Scribe" value={report.scribeId} roster={roster ?? []} editable={editable} onChange={(a) => toast.guard(setRole({ reportId, role: "scribe", agentId: a ? (a as Id<"agents">) : undefined }), "Action impossible")} />
              <RoleSelect label="Négociateur" value={report.negotiatorId} roster={roster ?? []} editable={editable} onChange={(a) => toast.guard(setRole({ reportId, role: "negotiator", agentId: a ? (a as Id<"agents">) : undefined }), "Action impossible")} />
            </div>
          </Section>

          <Section title="Suspects impliqués">
            <Suspects report={report} editable={editable} onAdd={(cid) => addSuspect({ reportId, citizenId: cid })} onRemove={(cid) => removeSuspect({ reportId, citizenId: cid })} />
          </Section>

          <Section title="Agents impliqués" subtitle="Auto + ajout manuel">
            <Involved
              contributors={report.contributors}
              roster={roster ?? []}
              editable={editable}
              onAdd={(aid) => toast.guard(addContributor({ reportId, agentId: aid }), "Ajout impossible")}
              onRemove={(aid) => toast.guard(removeContributor({ reportId, agentId: aid }), "Retrait impossible")}
            />
          </Section>

          <Section title="Véhicules impliqués">
            <LinkPicker
              kind="vehicle"
              selected={report.vehicles}
              editable={editable}
              onChange={(ids) => toast.guard(setVehicles({ reportId, vehicleIds: ids as Id<"vehicles">[] }), "Mise à jour impossible")}
            />
          </Section>

          <Section title="Armes utilisées">
            <LinkPicker
              kind="weapon"
              selected={report.weapons}
              editable={editable}
              onChange={(ids) => toast.guard(setWeapons({ reportId, weaponIds: ids as Id<"weapons">[] }), "Mise à jour impossible")}
            />
          </Section>
        </div>
      </div>

      {doc && <RapportDoc reportId={reportId} body={bodyText()} onClose={() => setDoc(false)} />}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="mb-[10px]">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{title}</div>
        {subtitle && <div className="mt-[2px] text-[11px] text-faint">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// Onglets du corps du rapport. Les notes de chacun restent consultables par
// tous : c'est la matière première dont le Lead a besoin pour rédiger.
function ReportBody({ reportId, editable }: { reportId: Id<"reports">; editable: boolean }) {
  const [tab, setTab] = useState<"details" | "notes">("details");
  const notes = useQuery(api.reports.allNotes, { reportId });
  const count = notes?.length ?? 0;

  const Tab = ({ id, label }: { id: "details" | "notes"; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className="mdt-press rounded-[8px] px-[13px] py-[7px] text-[12.5px] font-semibold"
      style={tab === id
        ? { background: "var(--accent-soft)", color: "var(--accent)" }
        : { color: "var(--muted)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border p-[10px]">
        <Tab id="details" label="Détails" />
        <Tab id="notes" label={count > 0 ? `Notes (${count})` : "Notes"} />
        <div className="flex-1" />
        <span className="pr-2 text-[11.5px] text-faint">
          {tab === "details" ? "Édition collaborative en temps réel" : "Notes de terrain de tous les agents"}
        </span>
      </div>
      <div className="p-[14px]">
        {tab === "details" ? (
          <CollabSection docId={reportId} editable={editable} />
        ) : (
          <CollectiveNotes reportId={reportId} editable={editable} notes={notes} />
        )}
      </div>
    </div>
  );
}

type NoteRow = { _id: string; text: string; updatedAt: number; mine: boolean; author: { matricule: number | null; name: string } };

function CollectiveNotes({
  reportId, editable, notes,
}: {
  reportId: Id<"reports">;
  editable: boolean;
  notes: NoteRow[] | undefined;
}) {
  const others = (notes ?? []).filter((n) => !n.mine);
  return (
    <div className="flex flex-col gap-[16px]">
      <div>
        <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Ma note</div>
        <PersonalNotes reportId={reportId} editable={editable} />
      </div>

      <div>
        <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
          Notes des autres agents
        </div>
        {notes === undefined ? (
          <div className="text-[12.5px] text-faint">Chargement…</div>
        ) : others.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border py-[18px] text-center text-[12.5px] text-faint">
            Aucun autre agent n'a encore pris de notes.
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {others.map((n) => (
              <div key={n._id} className="rounded-sm border border-border bg-surface-2 p-[11px]">
                <div className="mb-[5px] flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold"><AgentTag agent={n.author} /></span>
                  <span className="text-[11px] text-faint">{new Date(n.updatedAt).toLocaleString("fr-FR")}</span>
                </div>
                <RichTextEditor value={n.text} editable={false} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalNotes({ reportId, editable }: { reportId: Id<"reports">; editable: boolean }) {
  const note = useQuery(api.reports.myNote, { reportId });
  const setNote = useMutation(api.reports.setNote);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? note ?? "";

  return (
    <div>
      <RichTextEditor
        value={value}
        editable={editable}
        minHeight={110}
        placeholder="Vos observations de terrain…"
        onChange={(html) => setText(html.slice(0, 6000))}
        onBlur={(html) => { const v = html.slice(0, 6000); if (v !== note) setNote({ reportId, text: v }); }}
      />
    </div>
  );
}

function LieuInput({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  const cur = v ?? value;
  return (
    <input
      value={cur}
      disabled={!editable}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== null && v !== value && onSave(v)}
      placeholder="Ex. Vespucci Beach…"
      className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent disabled:opacity-60"
    />
  );
}

function RoleSelect({
  label,
  value,
  roster,
  editable,
  onChange,
  required,
}: {
  label: string;
  value: string | null;
  roster: { _id: string; prenomRP: string; nomRP: string; matricule?: number | null }[];
  editable: boolean;
  onChange: (agentId: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-[5px] text-[11px] text-muted">{label}</div>
      <select
        value={value ?? ""}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent disabled:opacity-60"
      >
        {!required && <option value="">-</option>}
        {required && !value && <option value="">-</option>}
        {roster.map((a) => (
          <option key={a._id} value={a._id}>
            {a.matricule != null ? `#${String(a.matricule).padStart(5, "0")} ` : ""}{a.prenomRP} {a.nomRP}
          </option>
        ))}
      </select>
    </div>
  );
}

function Suspects({
  report,
  editable,
  onAdd,
  onRemove,
}: {
  report: { suspects: { _id: string; name: string; dob: string }[] };
  editable: boolean;
  onAdd: (cid: Id<"citizens">) => void;
  onRemove: (cid: Id<"citizens">) => void;
}) {
  const [q, setQ] = useState("");
  const results = useQuery(api.citizens.search, q.trim() ? { q } : "skip");
  const held = new Set(report.suspects.map((s) => s._id));

  return (
    <div>
      {report.suspects.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucun suspect.</div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {report.suspects.map((sp) => (
            <div key={sp._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
              <span className="flex-1 text-[13px] font-semibold">{sp.name}</span>
              <span className="font-data text-[10.5px] text-faint">{sp.dob}</span>
              {editable && <button onClick={() => onRemove(sp._id as Id<"citizens">)} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div className="relative mt-2">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
            <Search className="h-[14px] w-[14px] text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un suspect…" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
          </div>
          {results && results.length > 0 && (
            <div className="mt-1 max-h-[160px] overflow-y-auto rounded-sm border border-border bg-surface">
              {results.filter((c) => !held.has(c._id)).map((c) => (
                <button key={c._id} onClick={() => { onAdd(c._id); setQ(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
                  <span className="flex-1 text-[12.5px] font-semibold">{c.prenom} {c.nom}</span>
                  <span className="font-data text-[10.5px] text-muted">{c.dateNaissance ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Involved({
  contributors,
  roster,
  editable,
  onAdd,
  onRemove,
}: {
  contributors: { matricule: number | null; name: string; agentId: string; manual: boolean }[];
  roster: { _id: string; prenomRP: string; nomRP: string; matricule?: number | null }[];
  editable: boolean;
  onAdd: (agentId: Id<"agents">) => void;
  onRemove: (agentId: Id<"agents">) => void;
}) {
  const [q, setQ] = useState("");
  const held = new Set(contributors.map((c) => c.agentId));
  const matches = q.trim()
    ? roster.filter((a) => !held.has(a._id) && `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(q.trim().toLowerCase()))
    : [];

  return (
    <div>
      {contributors.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucun.</div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {contributors.map((c) => (
            <div key={c.agentId} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
              <span className="flex-1 text-[13px]"><AgentTag agent={c} /></span>
              {!c.manual && <span className="rounded-[4px] border border-border px-[5px] py-px text-[9px] font-bold uppercase tracking-[0.06em] text-faint">Auto</span>}
              {editable && <button onClick={() => onRemove(c.agentId as Id<"agents">)} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div className="relative mt-2">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
            <Search className="h-[14px] w-[14px] text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un agent…" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none" />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 max-h-[160px] overflow-y-auto rounded-sm border border-border bg-surface">
              {matches.map((a) => (
                <button key={a._id} onClick={() => { onAdd(a._id as Id<"agents">); setQ(""); }} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
                  {a.matricule != null && <span className="font-data text-[10.5px] text-accent">#{String(a.matricule).padStart(5, "0")}</span>}
                  <span className="flex-1 text-[12.5px] font-semibold">{a.prenomRP} {a.nomRP}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Rattachement véhicule / arme par RECHERCHE (plaque, n° de série) plutôt qu'une liste déroulante.
function LinkPicker({ kind, selected, editable, onChange }: {
  kind: "vehicle" | "weapon";
  selected: { _id: string; label: string }[];
  editable: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const vehRes = useQuery(api.vehicles.search, kind === "vehicle" && term ? { q: term } : "skip");
  const wpnRes = useQuery(api.weapons.list, kind === "weapon" && term ? { q: term } : "skip");

  const held = new Set(selected.map((s) => s._id));
  const results =
    kind === "vehicle"
      ? (vehRes ?? []).filter((v) => !held.has(v._id)).map((v) => ({ _id: v._id as string, main: v.plaque, sub: [v.modele, v.ownerName].filter(Boolean).join(" · ") }))
      : (wpnRes ?? []).filter((w) => !held.has(w._id)).map((w) => ({ _id: w._id as string, main: w.serial, sub: [w.typeName, w.modele, w.ownerName].filter(Boolean).join(" · ") }));

  const add = (id: string) => { onChange([...selected.map((s) => s._id), id]); setQ(""); };
  const remove = (id: string) => onChange(selected.filter((s) => s._id !== id).map((s) => s._id));

  return (
    <div>
      {selected.length === 0 ? (
        <div className="mb-2 text-[12.5px] text-faint">{kind === "vehicle" ? "Aucun véhicule." : "Aucune arme."}</div>
      ) : (
        <div className="mb-2 flex flex-col gap-[6px]">
          {selected.map((s) => (
            <div key={s._id} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{s.label}</span>
              {editable && <button onClick={() => remove(s._id)} className="text-faint hover:text-danger"><X className="h-[14px] w-[14px]" /></button>}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2">
            <Search className="h-[14px] w-[14px] text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={kind === "vehicle" ? "Rechercher une plaque…" : "Rechercher un n° de série…"}
              className="h-9 flex-1 bg-transparent text-[12.5px] outline-none"
            />
          </div>
          {term && results.length > 0 && (
            <div className="mt-1 max-h-[170px] overflow-y-auto rounded-sm border border-border bg-surface">
              {results.slice(0, 8).map((r) => (
                <button key={r._id} onClick={() => add(r._id)} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2">
                  <span className="font-data text-[12.5px] font-semibold">{r.main}</span>
                  {r.sub && <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{r.sub}</span>}
                </button>
              ))}
            </div>
          )}
          {term && results.length === 0 && (vehRes !== undefined || wpnRes !== undefined) && (
            <div className="mt-1 rounded-sm border border-border bg-surface px-3 py-2 text-[12px] text-faint">Aucun résultat.</div>
          )}
        </div>
      )}
    </div>
  );
}

// Une section collaborative (un document prosemirror synchronisé par clé reportId:sectionKey).
function CollabSection({ docId, editable }: { docId: string; editable: boolean }) {
  const sync = useTiptapSync(api.prosemirror, docId);
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-2">
      {sync.isLoading ? (
        <div className="p-6 text-center text-[13px] text-faint">Chargement…</div>
      ) : sync.initialContent === null ? (
        <div className="p-6 text-center">
          <button
            onClick={() => sync.create({ type: "doc", content: [{ type: "paragraph" }] })}
            disabled={!editable}
            className="rounded-sm bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            Démarrer la rédaction
          </button>
        </div>
      ) : (
        <CollabEditor extension={sync.extension} initialContent={sync.initialContent} editable={editable} />
      )}
    </div>
  );
}

function CollabEditor({ extension, initialContent, editable }: { extension: unknown; initialContent: unknown; editable: boolean }) {
  const editor = useEditor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensions: [...richTextExtensions("Rédigez le rapport…"), extension as any],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: initialContent as any,
    editable,
    editorProps: { attributes: { class: "prose-mdt px-3 py-3 text-[13.5px] leading-[1.55] outline-none", style: "min-height:220px" } },
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  if (!editor) return null;
  return (
    <div className="rounded-sm border border-border bg-surface-2">
      {editable && <RichTextToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
