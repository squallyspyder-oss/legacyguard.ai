"use client";

import { SessionProvider } from "next-auth/react";
import { AppProvider } from "@/lib/app-context";
import React from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppProvider>
        {children}
      </AppProvider>
    </SessionProvider>
  );
}
