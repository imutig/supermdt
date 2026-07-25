import { useParams } from "react-router-dom";
import type { Id } from "convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { LoadingScreen } from "@/components/common/Loader";
import { InstructorConsole } from "./InstructorConsole";
import { CadetPlay } from "./CadetPlay";

// Une seule route pour une session ; le rôle décide de la vue. Un pilote de
// session voit la console de supervision, tout autre agent la passe comme cadet.
export function SessionScreen() {
  const { id } = useParams<{ id: string }>();
  const { can, ready } = useCan();
  if (!ready || !id) return <LoadingScreen label="Chargement…" />;
  const sessionId = id as Id<"quizSessions">;
  return can("lspa.session.manage")
    ? <InstructorConsole sessionId={sessionId} />
    : <CadetPlay sessionId={sessionId} />;
}
