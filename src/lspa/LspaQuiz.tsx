import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Clock, Target, PenLine, Radio, Award, XCircle, Tags, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { useToast } from "@/providers/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";

// Section Quiz de l'académie. Deux publics sur la même route : l'instructeur y
// voit son catalogue, le cadet n'y voit que ce qui le concerne (une session
// ouverte). Le second cas arrive avec le lot « sessions live ».
export function LspaQuiz() {
  const { can, ready } = useCan();
  if (!ready) return <div className="p-[22px_26px]"><SkeletonRows rows={4} /></div>;
  return can("lspa.quiz.view") ? <Catalogue /> : <VueCadet />;
}

// Vue du cadet : une session à rejoindre (ou à reprendre) et ses résultats.
function VueCadet() {
  const data = useQuery(api.quizSession.forMe);
  const navigate = useNavigate();

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Quiz</h1>
        <div className="mt-[3px] text-[13px] text-muted">Vos épreuves de formation.</div>
      </div>

      {data === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={3} /></div>
      ) : data.openSessions.length === 0 && data.results.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucune session en cours" message="Un quiz apparaîtra ici dès qu'un instructeur en ouvrira un." />
        </div>
      ) : (
        <div className="flex flex-col gap-[20px]">
          {data.openSessions.length > 0 && (
            <section>
              <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Sessions ouvertes</h2>
              <div className="flex flex-col gap-[10px]">
                {data.openSessions.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => navigate(`/lspa/session/${s._id}`)}
                    className="mdt-press flex items-center gap-[13px] rounded-card border p-[15px_17px] text-left"
                    style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))", background: "var(--accent-soft)" }}
                  >
                    <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] bg-surface text-accent">
                      <Radio className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-bold">{s.title}</div>
                      <div className="mt-[2px] text-[12px] text-muted">
                        {s.submitted ? "Copie rendue, en attente des résultats"
                          : s.status === "RUNNING" ? (s.joined ? "Épreuve en cours, reprenez votre copie" : "Épreuve en cours")
                          : s.joined ? "En salle d'attente" : "Session ouverte, rejoignez-la"}
                      </div>
                    </div>
                    <span className="flex-shrink-0 rounded-[7px] px-[9px] py-[4px] text-[11px] font-bold uppercase tracking-[0.06em] text-accent" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
                      {s.submitted ? "Rendu" : s.status === "RUNNING" ? "En cours" : "Ouverte"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {data.results.length > 0 && (
            <section>
              <h2 className="mb-[9px] text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Mes résultats</h2>
              <div className="flex flex-col gap-[8px]">
                {data.results.map((r) => {
                  // passed peut être null : quiz sans seuil de réussite.
                  const tint = r.passed === null ? "var(--accent)" : r.passed ? "var(--accent)" : "var(--danger)";
                  return (
                    <button
                      key={r.sessionId}
                      onClick={() => navigate(`/lspa/session/${r.sessionId}`)}
                      className="mdt-press flex items-center gap-[12px] rounded-card border border-border bg-surface p-[13px_16px] text-left hover:border-border-strong"
                    >
                      <span className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>
                        {r.passed === false ? <XCircle className="h-[16px] w-[16px]" /> : <Award className="h-[16px] w-[16px]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{r.title}</div>
                        <div className="text-[12px] text-muted">{r.score} / {r.maxPoints} points</div>
                      </div>
                      <span className="flex-shrink-0 text-[12.5px] font-bold" style={{ color: tint }}>
                        {r.passed === null ? `${r.score}/${r.maxPoints}` : r.passed ? "Réussi" : "Non validé"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Catalogue() {
  const quizzes = useQuery(api.quiz.list);
  const navigate = useNavigate();
  const { can } = useCan();
  const [creating, setCreating] = useState(false);
  const [managingCats, setManagingCats] = useState(false);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Quiz</h1>
          <div className="mt-[3px] text-[13px] text-muted">
            Les épreuves de la promotion. Un quiz se prépare ici, puis se fait passer en ouvrant une session.
          </div>
        </div>
        {can("lspa.quiz.edit") && (
          <Button onClick={() => setManagingCats(true)}>
            <Tags className="h-[15px] w-[15px]" />
            Catégories
          </Button>
        )}
        {can("lspa.quiz.create") && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-[15px] w-[15px]" />
            Nouveau quiz
          </Button>
        )}
      </div>

      {creating && <CreateQuizModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/lspa/quiz/${id}`)} />}
      {managingCats && <CategoriesModal onClose={() => setManagingCats(false)} />}

      {quizzes === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={4} /></div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState title="Aucun quiz" message="Créez une première épreuve pour la promotion." />
        </div>
      ) : (
        <div className="mdt-stagger grid grid-cols-1 gap-[12px] lg:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q) => (
            <button
              key={q._id}
              onClick={() => navigate(`/lspa/quiz/${q._id}`)}
              className="mdt-press flex flex-col rounded-card border border-border bg-surface p-[15px] text-left hover:border-border-strong"
            >
              <div className="mb-[9px] flex items-start gap-[10px]">
                <span className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-faint">
                  <ClipboardList className="h-[16px] w-[16px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold leading-tight">{q.title}</div>
                  {q.category && (
                    <span
                      className="mt-[4px] inline-block rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${q.category.color ?? "var(--accent)"} 14%, transparent)`, color: q.category.color ?? "var(--accent)" }}
                    >
                      {q.category.name}
                    </span>
                  )}
                  {q.description && <div className="mt-[3px] line-clamp-2 text-[12px] text-muted">{q.description}</div>}
                </div>
                <StatusChip status={q.status} />
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-x-[13px] gap-y-[4px] text-[11.5px] text-muted">
                <Meta icon={<ClipboardList className="h-[12px] w-[12px]" />}>
                  {q.questionCount} question{q.questionCount > 1 ? "s" : ""} · {q.totalPoints} pt{q.totalPoints > 1 ? "s" : ""}
                </Meta>
                <Meta icon={<Target className="h-[12px] w-[12px]" />}>{q.passPercent !== null ? `${q.passPercent} % pour valider` : "Sans seuil"}</Meta>
                {q.durationSeconds && (
                  <Meta icon={<Clock className="h-[12px] w-[12px]" />}>{Math.round(q.durationSeconds / 60)} min</Meta>
                )}
                {q.manualGrading && (
                  <Meta icon={<PenLine className="h-[12px] w-[12px]" />}>Correction manuelle</Meta>
                )}
                {q.openSessions > 0 && (
                  <span className="flex items-center gap-[5px] font-semibold text-accent">
                    <Radio className="h-[12px] w-[12px]" />
                    Session ouverte
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="flex items-center gap-[5px]">{icon}{children}</span>;
}

// Création d'un quiz : titre et description, le reste (barème, temps, questions)
// se règle ensuite sur la page dédiée. Passe par une modale, jamais par un champ
// greffé sur la liste.
function CreateQuizModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: Id<"quizzes">) => void }) {
  const create = useMutation(api.quiz.create);
  const categories = useQuery(api.quiz.listCategories);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    const id = await toast.guard(create({
      title: clean,
      description: description.trim() || undefined,
      categoryId: categoryId ? (categoryId as Id<"quizCategories">) : undefined,
    }), "Création impossible");
    setBusy(false);
    if (id) { onClose(); onCreated(id); }
  }

  return (
    <Modal
      title="Nouveau quiz"
      icon={<ClipboardList className="h-[17px] w-[17px]" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!title.trim()} onClick={() => void submit()}>Créer le quiz</Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px]">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Titre</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Code pénal · module 1"
            className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13.5px] outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Facultative. Résumé de l'épreuve."
            className="w-full rounded-sm border border-border bg-surface-2 p-3 text-[13px] outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Catégorie</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent"
          >
            <option value="">Sans catégorie</option>
            {(categories ?? []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </label>
        <div className="text-[11.5px] text-faint">
          Le barème, le temps et les questions se règlent ensuite sur la page du quiz.
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// Gestion des catégories : liste éditable, création et suppression. Une catégorie
// supprimée détache ses quiz sans les effacer.
function CategoriesModal({ onClose }: { onClose: () => void }) {
  const categories = useQuery(api.quiz.listCategories);
  const save = useMutation(api.quiz.saveCategory);
  const remove = useMutation(api.quiz.removeCategory);
  const toast = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#49a24a");

  return (
    <Modal title="Catégories de quiz" icon={<Tags className="h-[17px] w-[17px]" />} onClose={onClose} width={480}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
    >
      <div className="flex flex-col gap-[14px]">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const r = await toast.guard(save({ name: name.trim(), color }), "Création impossible");
            if (r) { setName(""); toast.success("Catégorie ajoutée."); }
          }}
          className="flex items-end gap-[8px]"
        >
          <label className="flex flex-1 flex-col gap-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Nouvelle catégorie</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Code pénal" className="h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
          </label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Couleur" className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-sm border border-border bg-surface-2" />
          <Button variant="primary" onClick={() => {}} disabled={!name.trim()}>Ajouter</Button>
        </form>

        {categories === undefined ? (
          <SkeletonRows rows={3} />
        ) : categories.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border px-3 py-[14px] text-center text-[12.5px] text-faint">Aucune catégorie pour l'instant.</div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {categories.map((c) => (
              <CategoryRow key={c._id} c={c} onSave={save} onRemove={remove} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CategoryRow({
  c, onSave, onRemove,
}: {
  c: { _id: Id<"quizCategories">; name: string; color: string | null };
  onSave: (a: { categoryId: Id<"quizCategories">; name: string; color?: string }) => Promise<unknown>;
  onRemove: (a: { categoryId: Id<"quizCategories"> }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-[9px] rounded-sm border border-border bg-surface-2 px-[10px] py-[7px]">
      <input
        type="color"
        defaultValue={c.color ?? "#49a24a"}
        onChange={(e) => void onSave({ categoryId: c._id, name: c.name, color: e.target.value })}
        className="h-[24px] w-[24px] flex-shrink-0 cursor-pointer rounded-[5px] border border-border"
        title="Couleur"
      />
      <input
        defaultValue={c.name}
        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) void onSave({ categoryId: c._id, name: e.target.value, color: c.color ?? undefined }); }}
        className="min-w-0 flex-1 border-none bg-transparent text-[13px] font-semibold text-text outline-none"
      />
      {confirm ? (
        <>
          <button onClick={() => setConfirm(false)} className="text-[11.5px] font-semibold text-muted">Annuler</button>
          <button onClick={async () => { await toast.guard(onRemove({ categoryId: c._id }), "Suppression impossible"); }} className="text-[11.5px] font-semibold text-danger">Confirmer</button>
        </>
      ) : (
        <button onClick={() => setConfirm(true)} title="Supprimer" className="flex-shrink-0 text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "var(--faint)" },
  PUBLISHED: { label: "Prêt", color: "var(--accent)" },
  ARCHIVED: { label: "Archivé", color: "var(--muted)" },
};

export function StatusChip({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, color: "var(--muted)" };
  return (
    <span
      className="flex-shrink-0 rounded-[6px] px-[7px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em]"
      style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}
    >
      {s.label}
    </span>
  );
}
