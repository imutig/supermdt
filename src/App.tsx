import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AppStateProvider, useApp } from "@/providers/app-state";
import { useMe } from "@/hooks/useMe";
import { EntryTransition } from "@/auth/EntryTransition";
import { fmtMatricule } from "@/components/common/AgentTag";
import { AppShell } from "@/components/shell/AppShell";
import { RequirePerm } from "@/components/shell/RequirePerm";
import { Dashboard } from "@/pages/Dashboard";
import { Dossier } from "@/pages/Dossier";
import { Effectif } from "@/pages/Effectif";
import { Organigramme } from "@/pages/Organigramme";
import { Admin } from "@/pages/Admin";
import { Protocoles } from "@/pages/Protocoles";
import { Ressources } from "@/pages/Ressources";
const Carte = lazy(() => import("@/pages/Carte").then((m) => ({ default: m.Carte })));
import { Calendrier } from "@/pages/Calendrier";
import { Plaintes } from "@/pages/Plaintes";
import { Armes } from "@/pages/Armes";
import { Vehicules } from "@/pages/Vehicules";
import { Saisies } from "@/pages/Saisies";
import { Dispatch } from "@/pages/Dispatch";
import { Absences } from "@/pages/Absences";
import { Discipline } from "@/pages/Discipline";
import { Services } from "@/pages/Services";
import { CodePenal } from "@/pages/CodePenal";
import { MandatsPage } from "@/pages/MandatsPage";
import { Rapports } from "@/pages/Rapports";
const RapportEditor = lazy(() => import("@/pages/RapportEditor").then((m) => ({ default: m.RapportEditor })));
import { Contraventions } from "@/pages/Contraventions";
import { Archive } from "@/pages/Archive";
const Configuration = lazy(() => import("@/pages/Configuration").then((m) => ({ default: m.Configuration })));
const Statistiques = lazy(() => import("@/pages/Statistiques").then((m) => ({ default: m.Statistiques })));
import { Profil } from "@/pages/Profil";
import { LoginPage } from "@/auth/LoginPage";
import { Onboarding } from "@/auth/Onboarding";
import { PendingScreen } from "@/auth/PendingScreen";
import { ChangePasswordScreen } from "@/auth/ChangePasswordScreen";
import { Splash } from "@/auth/Splash";

export default function App() {
  return (
    <AppStateProvider>
      <AuthLoading>
        <Splash />
      </AuthLoading>
      <Unauthenticated>
        <LoginPage />
      </Unauthenticated>
      <Authenticated>
        <Gated />
      </Authenticated>
    </AppStateProvider>
  );
}

function Gated() {
  const me = useMe();
  const { entryPending, endEntry } = useApp();
  if (me === undefined) return <Splash />;
  if (me === null) return <Onboarding />;

  const status = me.agent.status;
  if (status === "PENDING") return <PendingScreen />;
  if (status === "INACTIVE" || status === "SUSPENDED") return <PendingScreen suspended />;
  // Mot de passe temporaire : aucun accès au MDT tant qu'il n'est pas remplacé.
  if (me.agent.mustChangePassword) return <ChangePasswordScreen />;

  return (
    <>
      {entryPending && (
        <EntryTransition
          agentName={`${me.agent.prenomRP.charAt(0)}. ${me.agent.nomRP}`}
          agentMat={fmtMatricule(me.agent.matricule) ?? "#--"}
          onDone={endEntry}
        />
      )}
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/citoyen/:id" element={<RequirePerm perm="citoyens.view"><Dossier /></RequirePerm>} />
        <Route path="/effectif" element={<RequirePerm perm="effectif.view"><Effectif /></RequirePerm>} />
        <Route path="/organigramme" element={<RequirePerm perm="effectif.view"><Organigramme /></RequirePerm>} />
        <Route path="/protocoles" element={<RequirePerm perm="protocoles.view"><Protocoles /></RequirePerm>} />
        <Route path="/ressources" element={<RequirePerm perm="formations.view"><Ressources /></RequirePerm>} />
        <Route path="/carte" element={<RequirePerm perm="carte.view"><Carte /></RequirePerm>} />
        <Route path="/calendrier" element={<RequirePerm perm="calendrier.view"><Calendrier /></RequirePerm>} />
        <Route path="/plaintes" element={<RequirePerm perm="plaintes.view"><Plaintes /></RequirePerm>} />
        <Route path="/armes" element={<RequirePerm perm="armes.view"><Armes /></RequirePerm>} />
        <Route path="/vehicules" element={<RequirePerm perm={["vehicules.view", "flotte.view"]}><Vehicules /></RequirePerm>} />
        <Route path="/saisies" element={<RequirePerm perm="saisies.view"><Saisies /></RequirePerm>} />
        <Route path="/dispatch" element={<RequirePerm perm="dispatch.view"><Dispatch /></RequirePerm>} />
        <Route path="/absences" element={<RequirePerm perm="absences.request"><Absences /></RequirePerm>} />
        <Route path="/discipline" element={<RequirePerm perm="discipline.view"><Discipline /></RequirePerm>} />
        <Route path="/services" element={<RequirePerm perm="service.self"><Services /></RequirePerm>} />
        <Route path="/codepenal" element={<RequirePerm perm="codepenal.view"><CodePenal /></RequirePerm>} />
        <Route path="/mandats" element={<RequirePerm perm="mandats.view"><MandatsPage /></RequirePerm>} />
        <Route path="/rapports" element={<RequirePerm perm="rapports.view"><Rapports /></RequirePerm>} />
        <Route path="/rapport/:id" element={<RequirePerm perm="rapports.view"><RapportEditor /></RequirePerm>} />
        <Route path="/contraventions" element={<RequirePerm perm="contraventions.view"><Contraventions /></RequirePerm>} />
        <Route path="/archive" element={<RequirePerm perm="archive.view"><Archive /></RequirePerm>} />
        <Route path="/statistiques" element={<RequirePerm perm="stats.view"><Statistiques /></RequirePerm>} />
        <Route path="/config" element={<RequirePerm perm="rbac.manage"><Configuration /></RequirePerm>} />
        <Route path="/admin" element={<RequirePerm perm="effectif.validate"><Admin /></RequirePerm>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}
