import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const Login = () => {
  const { login, claimInitialAdmin, sessionExpired, setSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "user",
  });

  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [canClaimAdmin, setCanClaimAdmin] = useState(false);
  const [bootstrapData, setBootstrapData] = useState({
    username: "",
    email: "",
    password: "",
    setupSecret: "",
  });

  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(location.state?.message || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/auth/admin-bootstrap-status");
        if (active) {
          setCanClaimAdmin(Boolean(res.data?.canClaimInitialAdmin));
        }
      } catch {
        // ignore status check failure
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    setFormData((prevData) => ({
      ...prevData,
      [e.target.name]: e.target.value,
    }));
  };

  const handleBootstrapChange = (e) => {
    setBootstrapData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setSessionExpired(false);
    setLoading(true);

    try {
      const loggedInUser = await login(formData);
      const from = location.state?.from;
      if (loggedInUser.role === "admin") {
        navigate(from && from !== "/login" ? from : "/admin-profile");
      } else {
        navigate(from && from !== "/login" ? from : "/profile");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Invalid email or password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAdmin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await claimInitialAdmin(bootstrapData);
      navigate("/admin-profile");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to initialize admin account."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background Decorations */}
      <div className="login-background-decorations">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
      </div>

      {/* Login Card */}
      <div className="login-card">
        <div className="login-header">
          <h2>{bootstrapMode ? "Initial Admin Setup" : "Welcome Back ✈️"}</h2>
          <p>
            {bootstrapMode
              ? "Claim the first administrator account for this Travelogia workspace"
              : "Please enter your details to sign in"}
          </p>
        </div>

        {sessionExpired && (
          <div className="error-message">
            Your session expired. Please sign in again.
          </div>
        )}
        {infoMessage && (
          <div
            className="error-message"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.2)",
              borderColor: "rgba(34, 197, 94, 0.45)",
              color: "#dcfce7",
            }}
          >
            {infoMessage}
          </div>
        )}
        {error && <div className="error-message">{error}</div>}

        {!bootstrapMode ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="role">Login As</label>

              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="user">Traveler</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="input-group">
              <label htmlFor="email">Email Address</label>

              <input
                type="email"
                id="email"
                name="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>

              <input
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleClaimAdmin} className="login-form">
            <div className="input-group">
              <label htmlFor="admin-username">Admin Name</label>
              <input
                type="text"
                id="admin-username"
                name="username"
                placeholder="Site Administrator"
                value={bootstrapData.username}
                onChange={handleBootstrapChange}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="admin-email">Admin Email</label>
              <input
                type="email"
                id="admin-email"
                name="email"
                placeholder="admin@yourdomain.com"
                value={bootstrapData.email}
                onChange={handleBootstrapChange}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="admin-password">Strong Password (8+ chars, letter + number)</label>
              <input
                type="password"
                id="admin-password"
                name="password"
                placeholder="••••••••"
                value={bootstrapData.password}
                onChange={handleBootstrapChange}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="setupSecret">Setup Secret (if configured on server)</label>
              <input
                type="password"
                id="setupSecret"
                name="setupSecret"
                placeholder="Optional in local dev"
                value={bootstrapData.setupSecret}
                onChange={handleBootstrapChange}
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Setting Up Admin..." : "Claim Initial Admin"}
            </button>
          </form>
        )}

        <div className="login-footer">
          {canClaimAdmin && formData.role === "admin" && !bootstrapMode && (
            <p style={{ marginBottom: "10px" }}>
              No admin exists yet.{" "}
              <button
                type="button"
                className="signup-link"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  padding: 0,
                }}
                onClick={() => {
                  setError("");
                  setBootstrapMode(true);
                }}
              >
                Claim initial admin account
              </button>
            </p>
          )}
          {bootstrapMode && (
            <p style={{ marginBottom: "10px" }}>
              <button
                type="button"
                className="signup-link"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  padding: 0,
                }}
                onClick={() => {
                  setError("");
                  setBootstrapMode(false);
                }}
              >
                Back to Sign In
              </button>
            </p>
          )}
          <p>
            New user?{" "}
            <Link className="signup-link" to="/signup">
              Create an account
            </Link>
          </p>
          <p style={{ marginTop: "8px" }}>
            <Link className="signup-link" to="/">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
