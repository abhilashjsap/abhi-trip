import { useState } from "react";
import { signIn, signUp } from "../utils/auth";

export default function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === "signup";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError("Enter a username and password.");
      return;
    }
    if (isSignup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await signUp(trimmedUsername, password);
      } else {
        await signIn(trimmedUsername, password);
      }
      onSignedIn();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError("");
  };

  return (
    <div className="landing gate-landing">
      <div className="landing-header">
        <img className="brand-logo" src="/brand/abhitrip-icon.png" alt="" />
        <span className="brand-mark">AbhiTrip</span>
        <h1>{isSignup ? "Create your account." : "Welcome back."}</h1>
        <p>
          {isSignup
            ? "Pick a username and password to start planning."
            : "Sign in to continue planning your trips."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="trip-form gate-form">
        <div className="form-group">
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {isSignup && (
            <span className="field-hint">At least 8 characters.</span>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting
            ? isSignup
              ? "Creating account..."
              : "Signing in..."
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <button type="button" className="auth-mode-toggle" onClick={toggleMode}>
        {isSignup ? "Already have an account? Sign in" : "Don't have an account? Create one"}
      </button>
    </div>
  );
}
