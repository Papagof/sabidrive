"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserSupabaseClient, type SabiDriveSupabaseClient } from "./client";

const SupabaseContext = createContext<SabiDriveSupabaseClient | null>(null);

export interface SupabaseProviderProps {
  url: string;
  anonKey: string;
  children: ReactNode;
}

export function SupabaseProvider({ url, anonKey, children }: SupabaseProviderProps) {
  const client = useMemo(() => createBrowserSupabaseClient(url, anonKey), [url, anonKey]);
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <SupabaseContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SupabaseContext.Provider>
  );
}

export function useSupabaseClient(): SabiDriveSupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error("useSupabaseClient must be used within a SupabaseProvider");
  }
  return client;
}
