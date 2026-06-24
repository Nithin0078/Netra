import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles = [] }) => {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070A13] flex items-center justify-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
        </div>
      </div>
    );
  }

  // Redirect to login if token or user profile is absent
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // If user role is not allowed on this route
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect to their respective dashboards as fallback
    if (user.role === 'citizen') {
      return <Navigate to="/citizen/dashboard" replace />;
    } else if (user.role === 'police') {
      return <Navigate to="/police/dashboard" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
