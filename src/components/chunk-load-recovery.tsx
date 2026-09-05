"use client";

import { useEffect } from "react";

const RELOAD_KEY = "fairlx-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadFailure(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.name} ${value.message}`
      : typeof value === "string"
        ? value
        : "";
  return /ChunkLoadError|Loading chunk .+ failed/i.test(message);
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage can be blocked; still try a single reload.
  }
  window.location.reload();
}

/** Recovers from stale webpack chunks after a Fast Refresh / rebuild. */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
        event.preventDefault();
        reloadOnce();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadFailure(event.reason)) return;
      event.preventDefault();
      reloadOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
