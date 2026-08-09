import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/common/Button";
import { inputCls } from "./ui";

// Boîtes de dialogue du Detective Bureau : confirmation + saisie, centrées, en
// remplacement des alert()/confirm()/prompt() natifs du navigateur.

type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
type PromptOpts = { title: string; label?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string; multiline?: boolean };

type DialogsApi = {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
};
const Ctx = createContext<DialogsApi | null>(null);

export function useDialogs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialogs hors DialogsProvider");
  return c;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOpts & { resolve: (v: string | null) => void }) | null>(null);
  const [text, setText] = useState("");

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((resolve) => { setText(o.defaultValue ?? ""); setPromptState({ ...o, resolve }); }), []);

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {confirmState && (
        <Overlay onClose={() => { confirmState.resolve(false); setConfirmState(null); }}>
          <div className="text-[15px] font-bold">{confirmState.title}</div>
          {confirmState.message && <div className="mt-[6px] text-[13px] text-muted">{confirmState.message}</div>}
          <div className="mt-[16px] flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>Annuler</Button>
            <Button variant={confirmState.danger ? "danger" : "primary"} onClick={() => { confirmState.resolve(true); setConfirmState(null); }}>{confirmState.confirmLabel ?? "Confirmer"}</Button>
          </div>
        </Overlay>
      )}
      {promptState && (
        <Overlay onClose={() => { promptState.resolve(null); setPromptState(null); }}>
          <div className="text-[15px] font-bold">{promptState.title}</div>
          {promptState.label && <div className="mb-[6px] mt-[8px] text-[11.5px] font-semibold text-muted">{promptState.label}</div>}
          {promptState.multiline
            ? <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={promptState.placeholder} rows={3} className={`${inputCls} mt-[8px] h-auto py-2`} />
            : <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={promptState.placeholder}
                onKeyDown={(e) => { if (e.key === "Enter") { promptState.resolve(text.trim() || null); setPromptState(null); } }}
                className={`${inputCls} mt-[8px]`} />}
          <div className="mt-[16px] flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { promptState.resolve(null); setPromptState(null); }}>Annuler</Button>
            <Button variant="primary" onClick={() => { promptState.resolve(text.trim() || null); setPromptState(null); }}>{promptState.confirmLabel ?? "Valider"}</Button>
          </div>
        </Overlay>
      )}
    </Ctx.Provider>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "var(--scrim)", backdropFilter: "blur(4px)", animation: "mdtFade .12s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[380px] max-w-[94vw] rounded-card border border-border-strong bg-elev p-[18px] shadow-[0_24px_70px_rgba(0,0,0,.4)]" style={{ animation: "mdtPop .18s cubic-bezier(.16,1,.3,1)" }}>
        {children}
      </div>
    </div>
  );
}
