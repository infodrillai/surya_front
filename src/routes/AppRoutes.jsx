import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import CrudPage from '../components/CrudPage';
import { RESOURCES } from '../config/resources';
import { useAuthStore } from '../stores/authStore';
import { Dashboard, SalesDashboard } from '../pages';
import { Guard, staticRoutes } from './routesConfig';

export default function AppRoutes() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isSalesPerson = useAuthStore((s) => s.isSalesPerson);

  return (
    <Routes>
      {/* Home / Dashboard */}
      <Route path="/" element={isSalesPerson && !isAdmin ? <SalesDashboard /> : <Dashboard />} />

      {/* Static application pages */}
      {staticRoutes.map(({ path, element: Component, guarded }) => (
        <Route
          key={path}
          path={path}
          element={guarded ? <Guard path={path}><Component /></Guard> : <Component />}
        />
      ))}

      {/* CRUD Master & Transaction resource pages */}
      {Object.entries(RESOURCES).map(([path, config]) => (
        <Route
          key={path}
          path={path}
          element={<Guard path={path}><CrudPage key={path} config={config} /></Guard>}
        />
      ))}

      {/* Wildcard Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

