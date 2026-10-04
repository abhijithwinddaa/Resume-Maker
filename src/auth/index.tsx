/**
 * The app's single entry point to authentication. Components import auth
 * hooks and components from here, never from @clerk/clerk-react directly, so
 * local development can run without Clerk (see devAuth.ts).
 */
import * as Clerk from "@clerk/clerk-react";
import type { ReactNode } from "react";
import {
  LOCAL_DEV_AUTH,
  LOCAL_DEV_TOKEN,
  LOCAL_DEV_USER,
  LOCAL_DEV_USER_ID,
} from "./devAuth";

export { LOCAL_DEV_AUTH } from "./devAuth";

type Children = { children?: ReactNode };

const localUser = {
  user: LOCAL_DEV_USER,
  isLoaded: true,
  isSignedIn: true,
};

const localAuth = {
  isLoaded: true,
  isSignedIn: true,
  userId: LOCAL_DEV_USER_ID,
  getToken: async () => LOCAL_DEV_TOKEN,
  signOut: async () => {},
};

const localClerk = {
  loaded: true,
  status: "ready",
  openSignIn: () => {},
  signOut: async () => {},
};

function Render({ children }: Children) {
  return <>{children}</>;
}

function RenderNothing(_props: Children) {
  return null;
}

/** Stands in for Clerk's avatar menu so it's obvious no real account is in use. */
function LocalUserBadge(_props: { afterSignOutUrl?: string }) {
  return (
    <span
      className="local-dev-badge"
      title="Local development: signed in as a test user without Clerk. Set VITE_DEV_AUTH=clerk to use real sign-in."
    >
      Local dev
    </span>
  );
}

// Every export keeps Clerk's exact type, so call sites are identical in both
// modes. The local stand-ins implement the subset of each API the app uses.
export const useUser: typeof Clerk.useUser = LOCAL_DEV_AUTH
  ? ((() => localUser) as unknown as typeof Clerk.useUser)
  : Clerk.useUser;

export const useAuth: typeof Clerk.useAuth = LOCAL_DEV_AUTH
  ? ((() => localAuth) as unknown as typeof Clerk.useAuth)
  : Clerk.useAuth;

export const useClerk: typeof Clerk.useClerk = LOCAL_DEV_AUTH
  ? ((() => localClerk) as unknown as typeof Clerk.useClerk)
  : Clerk.useClerk;

export const SignedIn: typeof Clerk.SignedIn = LOCAL_DEV_AUTH
  ? (Render as unknown as typeof Clerk.SignedIn)
  : Clerk.SignedIn;

export const SignedOut: typeof Clerk.SignedOut = LOCAL_DEV_AUTH
  ? (RenderNothing as unknown as typeof Clerk.SignedOut)
  : Clerk.SignedOut;

export const ClerkFailed: typeof Clerk.ClerkFailed = LOCAL_DEV_AUTH
  ? (RenderNothing as unknown as typeof Clerk.ClerkFailed)
  : Clerk.ClerkFailed;

export const UserButton: typeof Clerk.UserButton = LOCAL_DEV_AUTH
  ? (LocalUserBadge as unknown as typeof Clerk.UserButton)
  : Clerk.UserButton;

/** Wraps the app in Clerk, or in nothing at all during local development. */
export function AuthProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  if (LOCAL_DEV_AUTH) return <>{children}</>;
  return (
    <Clerk.ClerkProvider publishableKey={publishableKey}>
      {children}
    </Clerk.ClerkProvider>
  );
}
