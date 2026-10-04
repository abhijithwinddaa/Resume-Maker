/**
 * Local development without signing in.
 *
 * `npm run dev` signs you in as a fixed local user instead of going through
 * Clerk; set VITE_DEV_AUTH=clerk to test the real sign-in flow locally.
 *
 * Production cannot reach this: `import.meta.env.DEV` is false in a build, so
 * the bundler drops the local branch entirely, and the server only accepts
 * LOCAL_DEV_TOKEN from the Vite dev server (see requestAuth).
 */

export const LOCAL_DEV_AUTH =
  import.meta.env.DEV &&
  import.meta.env.MODE !== "test" &&
  import.meta.env.VITE_DEV_AUTH !== "clerk";

export const LOCAL_DEV_TOKEN = "local-dev-token";

export const LOCAL_DEV_USER_ID = "local_dev_user";

export const LOCAL_DEV_USER = {
  id: LOCAL_DEV_USER_ID,
  firstName: "Local",
  lastName: "Developer",
  fullName: "Local Developer",
  imageUrl: "",
  primaryEmailAddress: { emailAddress: "dev@localhost" },
  emailAddresses: [{ emailAddress: "dev@localhost" }],
};
