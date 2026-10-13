"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { bmFetch } from "./bm-fetch";

/**
 * Backend calls for signed-in screens. Use this (not `bmFetch` directly) so that a
 * 401/403 or revoked Firebase session from any call signs the Broker out with a notice.
 * Errors are always rethrown so callers can still handle transient failures.
 */
export function useBmFetch() {
  const { user, reportApiError } = useAuth();
  return useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      if (!user) throw new Error("useBmFetch requires a signed-in user");
      try {
        return await bmFetch(user, path, init);
      } catch (error) {
        reportApiError(error);
        throw error;
      }
    },
    [user, reportApiError],
  );
}
