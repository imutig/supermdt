import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "./convex";
import App from "./App";
import { ToastProvider } from "./providers/toast";
import { DocSenderProvider } from "./components/docs/DocSender";
import "./index.css";

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
