import { ChevronLeft, ChevronRight } from "lucide-react";

// Pagination compacte réutilisable.
export function Pagination({ page, pages, total, onPage, label = "éléments" }: { page: number; pages: number; total?: number; onPage: (p: number) => void; label?: string }) {
  if (pages <= 1) return null;
  const btn = "mdt-press flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong disabled:opacity-40 disabled:hover:border-border";
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-[10px]">
      {total != null && <span className="text-[11.5px] text-faint">{total} {label}</span>}
      <div className="flex-1" />
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className={btn}><ChevronLeft className="h-4 w-4" /></button>
      <span className="font-data text-[12px] text-muted">Page {page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className={btn}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

// Bouton "Charger plus" pour la pagination serveur (curseur Convex usePaginatedQuery).
export function LoadMore({ status, onLoadMore, count, label = "éléments" }: { status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"; onLoadMore: () => void; count: number; label?: string }) {
  if (status === "LoadingFirstPage") return null;
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-[10px]">
      <span className="text-[11.5px] text-faint">{count} {label}{status === "Exhausted" ? "" : "+"}</span>
      <div className="flex-1" />
      {status === "CanLoadMore" && (
        <button onClick={onLoadMore} className="mdt-press rounded-sm border border-border bg-surface-2 px-[14px] py-[7px] text-[12.5px] font-semibold text-muted hover:border-border-strong">Charger plus</button>
      )}
      {status === "LoadingMore" && <span className="text-[12px] text-faint">Chargement…</span>}
    </div>
  );
}

// Petit hook utilitaire pour paginer un tableau côté client.
export function usePaged<T>(items: T[], perPage: number, page: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const safe = Math.min(page, pages);
  return { pages, slice: items.slice((safe - 1) * perPage, safe * perPage), safePage: safe };
}
