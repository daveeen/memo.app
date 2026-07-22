import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import "./memo.css";

export const links: Route.LinksFunction = () => [
  // vite-plugin-pwa's automatic HTML injection (manifest link + SW register
  // script) never runs here — it patches a static index.html template via
  // Vite's transformIndexHtml, but React Router 7's SPA build renders the
  // document from this Layout component instead, so nothing was ever
  // injected (confirmed: build/client/index.html had neither tag). Added
  // manually; SW registration is manual too, see App()'s effect below.
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Shown while the initial JS bundle loads/hydrates (ssr:false means there's no
// server-rendered HTML to show in that gap) — just the brand mark on the app's
// own background instead of a blank white flash.
export function HydrateFallback() {
  return (
    <div
      style={{
        maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "radial-gradient(120% 70% at 50% 36%,#F0E7D6 0%,#E4D8C2 60%,#DCCFB6 100%)",
      }}
    >
      <div
        style={{
          width: 72, height: 72, borderRadius: 22,
          background: "linear-gradient(150deg,#2C2A31,#141319)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 16px 34px rgba(20,18,26,.35)",
        }}
      >
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 20 L8 8 L14 20 L20 4 L26 20 L32 8 L38 20" stroke="#F4EDDB" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export default function App() {
  // Memo has no per-route responsive layout of its own (every screen is a fixed
  // mobile-width column). Without this wrapper the app stretches edge-to-edge on
  // any desktop browser window, which is also what made it hard to test locally.
  // translateZ(0) gives fixed-position descendants (tab bar, transport bar) a
  // containing block scoped to this column instead of the full viewport. That makes
  // the column's own height the reference for their bottom:0 — so the column must be
  // EXACTLY viewport-height and scroll internally, never grow with content. With
  // minHeight:100vh it grew, and on a long page (Songs) the tab bar landed at the
  // bottom of the document instead of the screen. Every route root already expects
  // this: they're all flex:1 + .m-scroll.
  // Same automatic-injection gap as the manifest <link> above — vite-plugin-pwa
  // never got a chance to inject its registration script into this build, so
  // the generated sw.js was sitting unused. Only makes sense against a real
  // production build (dev has no generated service worker at this URL).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", transform: "translateZ(0)", boxShadow: "0 0 60px rgba(0,0,0,.08)" }}>
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
