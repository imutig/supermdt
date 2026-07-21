import type { ReactNode } from "react";
import { Clover } from "@/components/common/Clover";

// Boîte à outils visuelle des pages Ressources (hardcodées, item Ressources).

export function Hero({ title, accent, subtitle, tag = "Ressources" }: { title: string; accent?: string; subtitle?: string; tag?: string }) {
  return (
    <div className="mb-6 mdt-reveal">
      <div className="mb-[10px] inline-flex items-center gap-[8px] text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
        <Clover size={14} /> {tag}
      </div>
      <h1 className="m-0 text-[25px] font-extrabold tracking-tight">
        {title}
        {accent && <span className="text-accent"> {accent}</span>}
      </h1>
      {subtitle && <p className="mt-2 max-w-[760px] text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}

export function Grid({ children, min = 260, className = "" }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={`mdt-stagger grid gap-[16px] ${className}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, color = "var(--accent)" }: { children: ReactNode; color?: string }) {
  return (
    <div className="mb-[12px] mt-2 flex items-center gap-[10px]">
      <span className="h-[16px] w-[3px] rounded-full" style={{ background: color }} />
      <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color }}>{children}</h2>
    </div>
  );
}

// Carte "unité" : emblème (icône), sigle, intitulé anglais en italique, description.
export function UnitCard({ icon, code, en, color = "var(--accent)", children, footer }: { icon: ReactNode; code: string; en?: string; color?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mdt-lift group flex flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="h-[4px] w-full" style={{ background: color }} />
      <div className="flex flex-1 flex-col items-center px-[16px] pb-[16px] pt-[18px] text-center">
        <div className="mb-[12px] flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 transition-transform group-hover:scale-105" style={{ borderColor: color, color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
          {icon}
        </div>
        <div className="text-[18px] font-extrabold leading-none" style={{ color }}>{code}</div>
        {en && <div className="mt-[3px] text-[12px] font-semibold italic text-faint">{en}</div>}
        <div className="mt-[10px] text-[12.5px] leading-relaxed text-muted">{children}</div>
        {footer && <div className="mt-[12px] w-full">{footer}</div>}
      </div>
    </div>
  );
}

export function Pill({ children, color = "var(--accent)" }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em]" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {children}
    </span>
  );
}

export function Callout({ children, color = "var(--accent)", title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <div className="rounded-card border p-4" style={{ borderColor: `color-mix(in srgb, ${color} 40%, var(--border))`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}>
      {title && <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color }}>{title}</div>}
      <div className="text-[13px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

// Bloc "radio" façon terminal sombre (pour les calls radio).
export function RadioBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-[#2a2f3a] bg-[#0b0d11] px-[16px] py-[13px] font-data text-[12.5px] leading-relaxed text-[#c9d2e0] shadow-inner">
      {children}
    </div>
  );
}

// Bulle d'explication (colonne de droite des calls).
export function Explain({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="rounded-card border border-border bg-surface-2 p-4">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Ce qu'on comprend</div>
      <div className="flex flex-col gap-[7px]">
        {items.map(([k, v], i) => (
          <div key={i} className="flex gap-2 text-[12.5px]">
            <span className="text-muted">{k}</span>
            <span className="flex-1 text-right font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ligne de définition (lexique).
export function DefRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border py-[9px] last:border-0">
      <span className="w-[110px] flex-shrink-0 font-data text-[12.5px] font-bold text-accent">{term}</span>
      <span className="flex-1 text-[13px] text-muted">{children}</span>
    </div>
  );
}
