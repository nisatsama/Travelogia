import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./Signup.css";

const Signup = () => {
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.username.trim().length < 2) {
      return setError("Username must be at least 2 characters.");
    }
    if (formData.password.length < 8) {
      return setError("Password must be at least 8 characters long.");
    }
    if (!/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password)) {
      return setError("Password must include at least one letter and one number.");
    }
    if (formData.password !== formData.confirmPassword) {
      return setError("Passwords do not match.");
    }

    setLoading(true);

    try {
      await signup({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });

      navigate("/login", {
        state: { message: "Account created! Please sign in to continue." },
      });
    } catch (err) {
      setError(
        getErrorMessage(err, "Registration failed. Email might already exist."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-background-decorations">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
      </div>

      <div className="signup-card">
        <div className="signup-header">
          <h2>Create Account</h2>
          <p>Join Travelogia by signing up for a new account below</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSignup} className="signup-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              placeholder="johndoe"
              value={formData.username}
              onChange={handleChange}
              autoComplete="name"
              required
            />
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
            <label htmlFor="password">Password (8+ chars, letter &amp; number)</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="signup-btn" disabled={loading}>
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>

        <div className="signup-footer">
          <p>
            Already have an account?{" "}
            <Link className="login-link" to="/login">
              Sign In
            </Link>
          </p>
          <p style={{ marginTop: "8px" }}>
            <Link className="login-link" to="/">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
