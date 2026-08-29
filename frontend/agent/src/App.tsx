import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { Chat } from "./pages/Chat";
import { Notifications } from "./pages/Notifications";
import { Email } from "./pages/Email";
import { Support } from "./pages/Support";
import { Projects } from "./pages/Projects";
import { Layout } from "./components/Layout";
import { api } from "./api/client";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!api.isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/email" element={<Email />} />
          <Route path="/support" element={<Support />} />
          <Route path="/projects" element={<Projects />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
