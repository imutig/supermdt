import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "./useMe";

// Prise / fin de service réelle (basée sur les serviceSessions).
export function useService() {
  const me = useMe();
  const start = useMutation(api.service.start);
  const end = useMutation(api.service.end);
  const onDuty = !!me?.onDuty;
  const toggle = () => {
    (onDuty ? end({}) : start({})).catch(() => {});
  };
  return { onDuty, toggle, dutySince: me?.dutySince ?? null };
}
