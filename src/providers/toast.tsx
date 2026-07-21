import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  /** Enveloppe une action async : affiche une erreur toast si elle rejette. */
  guard: <T>(p: Promise<T>, errPrefix?: string) => Promise<T | undefined>;
}

const Ctx = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, { color: string; Icon: typeof Info }> = {
  success: { color: "var(--success)", Icon: CheckCircle2 },
  error: { color: "var(--danger)", Icon: XCircle },
  warning: { color: "var(--warning)", Icon: AlertTriangle },
  info: { color: "var(--accent)", Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), kind === "error" ? 6000 : 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
      warning: (m) => push(m, "warning"),
      guard: async (p, errPrefix) => {
        try {
          return await p;
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          // Convex enrobe les erreurs ; on extrait le message lisible.
          const clean = raw.replace(/^\[.*?\]\s*/, "").split("\n")[0];
          push(errPrefix ? `${errPrefix} : ${clean}` : clean, "error");
          return undefined;
        }
      },
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[92vw] flex-col gap-2">
        {toasts.map((t) => {
          const { color, Icon } = STYLES[t.kind];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-[10px] rounded-sm border border-border bg-elev px-[13px] py-[11px] shadow-[0_12px_40px_rgba(0,0,0,.28)]"
              style={{ borderLeft: `3px solid ${color}`, animation: "mdtSlide .22s cubic-bezier(.16,1,.3,1)" }}
            >
              <Icon className="mt-[1px] h-[17px] w-[17px] flex-shrink-0" style={{ color }} />
              <span className="flex-1 text-[13px] leading-[1.4]">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="flex-shrink-0 text-faint hover:text-text"
              >
                <X className="h-[15px] w-[15px]" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}
