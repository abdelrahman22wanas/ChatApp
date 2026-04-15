import { SignIn, SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-react";
import App from "./App";

function AuthenticatedChat() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  if (!isLoaded || !user) {
    return <div className="auth-loading">Loading your account...</div>;
  }

  const fallbackName = user.primaryEmailAddress?.emailAddress?.split("@")[0] || "user";
  const displayName = user.username || user.fullName || fallbackName;

  return (
    <App
      authRequired
      authUser={{
        id: user.id,
        name: displayName
      }}
      getToken={getToken}
    />
  );
}

export default function AuthApp() {
  return (
    <>
      <SignedOut>
        <div className="auth-screen">
          <div className="auth-card-web">
            <h1>ChatApp</h1>
            <p>Sign in to continue to rooms.</p>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <AuthenticatedChat />
      </SignedIn>
    </>
  );
}
