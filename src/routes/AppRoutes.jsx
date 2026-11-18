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
  const isStoreExecutive = useAuthStore((s) => s.isStoreExecutive);
  const isPuOperator = useAuthStore((s) => s.isPuOperator);
  const isBeltOperator = useAuthStore((s) => s.isBeltOperator);

  // Home route element based on user role
  const homeElement = isAdmin
    ? <Dashboard />
    : isStoreExecutive
    ? <Navigate to="/store" replace />
    : isPuOperator
    ? <Navigate to="/batch" replace />
    : isBeltOperator
    ? <Navigate to="/belt-batch" replace />
    : isSalesPerson
    ? <SalesDashboard />
    : <Dashboard />;

  return (
    <Routes>
      {/* Home / Dashboard */}
      <Route path="/" element={homeElement} />

      {/* Legacy / merged paths redirect to Product Master */}
      <Route path="/competitor-company" element={<Navigate to="/product" replace />} />
      <Route path="/product-code-mapping" element={<Navigate to="/product" replace />} />
      <Route path="/quotation-currency" element={<Navigate to="/currency" replace />} />

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

