import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui-styles.css";
// применяют сохранённые стиль интерфейса и логотип до первой отрисовки
import "./lib/uiStyle";
import "./lib/appPrefs";
import "./lib/playerAppearance";
import App from "./App";
import { AuthProvider } from "./lib/auth/AuthContext";
import { AuthGate } from "./components/AuthGate";
// запускает слежение за связью и режим «нет интернета»
import "./lib/resilience";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* SW недоступен (нет https или файл не отдаётся) — приложение работает и без него */
    });
  });
}
