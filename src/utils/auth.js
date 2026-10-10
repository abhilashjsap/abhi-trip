const TOKEN_KEY = "abhitrip_auth_token";
const USERNAME_KEY = "abhitrip_auth_username";

// Persisted in localStorage (not sessionStorage, unlike the old password
// gate's unlock flag) so a real account stays signed in across browser
// restarts — the expected UX once this is per-person accounts rather than
// one shared password for the session.
export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function isSignedIn() {
  return !!getAuthToken();
}

export function signOut() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    // Storage unavailable — nothing to clear, nothing to do about it either.
  }
}

async function postAuth(path, payload) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the server. Please check your connection and try again.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Something went wrong. Please try again.");
  }

  try {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USERNAME_KEY, data.username);
  } catch {
    // Can't persist the session, but the caller still gets a valid
    // response — just won't survive a reload. Not worth failing over.
  }
  return data;
}

export function signUp(username, password) {
  return postAuth("/api/auth/signup", { username, password });
}

export function signIn(username, password) {
  return postAuth("/api/auth/login", { username, password });
}
