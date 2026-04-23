import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar />
      <main className="flex-1 ml-20 flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
