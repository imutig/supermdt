import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Clock, Target, PenLine, Radio } from "lucide-react";
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

function VueCadet() {
  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Quiz</h1>
        <div className="mt-[3px] text-[13px] text-muted">Vos épreuves de formation.</div>
      </div>
      <div className="rounded-card border border-border bg-surface">
        <EmptyState
          title="Aucune session en cours"
          message="Un quiz apparaîtra ici dès qu'un instructeur en ouvrira un."
        />
      </div>
    </div>
  );
}

function Catalogue() {
  const quizzes = useQuery(api.quiz.list);
  const navigate = useNavigate();
  const { can } = useCan();
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Quiz</h1>
          <div className="mt-[3px] text-[13px] text-muted">
            Les épreuves de la promotion. Un quiz se prépare ici, puis se fait passer en ouvrant une session.
          </div>
        </div>
        {can("lspa.quiz.create") && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-[15px] w-[15px]" />
            Nouveau quiz
          </Button>
        )}
      </div>

      {creating && <CreateQuizModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/lspa/quiz/${id}`)} />}

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
                  {q.description && <div className="mt-[3px] line-clamp-2 text-[12px] text-muted">{q.description}</div>}
                </div>
                <StatusChip status={q.status} />
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-x-[13px] gap-y-[4px] text-[11.5px] text-muted">
                <Meta icon={<ClipboardList className="h-[12px] w-[12px]" />}>
                  {q.questionCount} question{q.questionCount > 1 ? "s" : ""} · {q.totalPoints} pt{q.totalPoints > 1 ? "s" : ""}
                </Meta>
                <Meta icon={<Target className="h-[12px] w-[12px]" />}>{q.passPercent} % pour valider</Meta>
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
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    const id = await toast.guard(create({ title: clean, description: description.trim() || undefined }), "Création impossible");
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
        <div className="text-[11.5px] text-faint">
          Le barème, le temps et les questions se règlent ensuite sur la page du quiz.
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
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
