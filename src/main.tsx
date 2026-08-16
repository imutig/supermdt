import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "./convex";
import App from "./App";
import { ToastProvider } from "./providers/toast";
import { DocSenderProvider } from "./components/docs/DocSender";
import "./index.css";

// Après un redéploiement, les chunks lazy prennent de nouveaux noms (hash de
// contenu) : un onglet resté ouvert avant la mise à jour tente de charger des
// fichiers qui n'existent plus → « error loading dynamically imported module ».
// On recharge alors la page pour récupérer le build à jour (anti-boucle : au
// plus un rechargement toutes les 10 s).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const now = Date.now();
  const last = Number(sessionStorage.getItem("mdt:preloadReload") || 0);
  if (now - last > 10_000) {
    sessionStorage.setItem("mdt:preloadReload", String(now));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <ToastProvider>
          <DocSenderProvider>
            <App />
          </DocSenderProvider>
        </ToastProvider>
      </BrowserRouter>
    </ConvexAuthProvider>
  </React.StrictMode>,
);
