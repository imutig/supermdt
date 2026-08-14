import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// Primitives de formulaire partagées : une seule source de vérité pour le style
// des champs (hauteur, bordure, focus accent) au lieu de le recopier dans chaque
// modale. `FIELD_CLASS` reste exporté pour les cas qui composent leur propre input.
export const FIELD_CLASS =
  "h-[46px] w-full rounded-[10px] border border-border bg-surface-2 px-[14px] text-[13px] text-text outline-none focus:border-accent";

function cx(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD_CLASS, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_CLASS, className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "min-h-[92px] w-full resize-y rounded-[10px] border border-border bg-surface-2 px-[14px] py-[10px] text-[13px] text-text outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

// Libellé + champ. Reprend le petit label majuscule tracké utilisé partout.
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">{label}</div>
      {children}
    </div>
  );
}
