"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion } from "motion/react";
import { useState } from "react";
import { SceneProvider } from "@/components/scene/context";
import type { SceneId } from "@/design-system/scenes";
import { EnvironmentProvider } from "@/environment/environment";
import { liveConnected } from "@/services/live-state";

const loadMotionFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export function Providers({ scene, children }: { scene: SceneId; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, gcTime: 120_000, refetchOnWindowFocus: () => !liveConnected() } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SceneProvider value={scene}>
        <EnvironmentProvider>
          <LazyMotion features={loadMotionFeatures} strict>
            {children}
          </LazyMotion>
        </EnvironmentProvider>
      </SceneProvider>
    </QueryClientProvider>
  );
}
