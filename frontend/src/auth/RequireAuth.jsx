import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function RequireAuth({ children }) {
  const { session, signedOut } = useAuth();
  const location = useLocation();
  if (!session && signedOut) return <Navigate to="/" replace />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
