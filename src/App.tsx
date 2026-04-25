/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Patients } from "./pages/Patients";
import { Workspace } from "./pages/Workspace";
import { SnomedBrowser } from "./pages/SnomedBrowser";
import { PharmaBrowser } from "./pages/PharmaBrowser";
import { HomePage } from "./pages/HomePage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { SuperAdminDashboard } from "./pages/SuperAdminDashboard";
import { SystemModuleManagement } from "./pages/SystemModuleManagement";
import { MedicationScraper } from "./pages/MedicationScraper";
import { RoleManagement } from "./pages/RoleManagement";
import { CorporateFare } from "./pages/CorporateFare";
import { UserManagement } from "./pages/UserManagement";
import { LoginPage } from "./pages/LoginPage";
import { ModuleLandingPage } from "./pages/ModuleLandingPage";
import { ModuleWorkspacePage } from "./pages/ModuleWorkspacePage";
import { ActionHub } from "./pages/ActionHub";
import { ActionHubResults } from "./pages/ActionHubResults";
import { ActionHubAdmin } from "./pages/ActionHubAdmin";
import { ARHConversations } from "./pages/ARHConversations";
import { NotificationCenterPage } from "./pages/NotificationCenterPage";
import { isAuthenticated } from "./lib/authSession";
import { GlobalNotificationWidget } from "./components/GlobalNotificationWidget";

/** Guard: redirect to /login if not authenticated */
function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalNotificationWidget />
      <Routes>
        {/* Public — Login Gate */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/super-admin" element={<RequireAuth><SuperAdminDashboard /></RequireAuth>} />
        <Route path="/super-admin/modules" element={<RequireAuth><SystemModuleManagement /></RequireAuth>} />
        <Route path="/super-admin/roles" element={<RequireAuth><RoleManagement /></RequireAuth>} />
        <Route path="/super-admin/corporate" element={<RequireAuth><CorporateFare /></RequireAuth>} />
        <Route path="/super-admin/users" element={<RequireAuth><UserManagement /></RequireAuth>} />

        {/* Action Routing Hub */}
        <Route path="/action-hub" element={<RequireAuth><ActionHub /></RequireAuth>} />
        <Route path="/action-hub/results" element={<RequireAuth><ActionHubResults /></RequireAuth>} />
        <Route path="/action-hub/admin" element={<RequireAuth><ActionHubAdmin /></RequireAuth>} />
        <Route path="/action-hub/conversations" element={<RequireAuth><ARHConversations /></RequireAuth>} />

        <Route path="/notifications" element={<RequireAuth><NotificationCenterPage /></RequireAuth>} />


        {/* Dynamic module landing pages — generated for any parent module with sub-nodes */}
        <Route path="/module/:moduleId" element={<RequireAuth><ModuleLandingPage /></RequireAuth>} />

        {/* Dynamic module workspace — rendered for any leaf module (no children) */}
        <Route path="/module-page/:moduleId" element={<RequireAuth><ModuleWorkspacePage /></RequireAuth>} />

        {/* Existing modules using standard Layout */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/patients" element={<Patients />} />
          <Route path="/workspace" element={<Navigate to="/patients" replace />} />
          <Route path="/workspace/:id" element={<Workspace />} />
          <Route path="/sessions" element={<div className="p-8 text-center text-slate-500">MTM Sessions (Coming Soon)</div>} />
          <Route path="/labs" element={<div className="p-8 text-center text-slate-500">Labs &amp; Trends (Coming Soon)</div>} />
          <Route path="/reports" element={<div className="p-8 text-center text-slate-500">Reports (Coming Soon)</div>} />
          <Route path="/tasks" element={<div className="p-8 text-center text-slate-500">Tasks &amp; Follow-ups (Coming Soon)</div>} />
          <Route path="/snomed" element={<SnomedBrowser />} />
          <Route path="/pharma" element={<PharmaBrowser />} />
          <Route path="/medication-scraper" element={<MedicationScraper />} />
        </Route>

        {/* Catch-all → login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
