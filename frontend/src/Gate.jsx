"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth";

export default function Gate({ page, children }) {
  const { user, token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !token || !user) return;
    const isParent = user.role === "parent";
    const allowed = isParent ? page === "overview" || page === "advisor" : page !== "overview" && page !== "advisor";
    if (!allowed) router.replace(isParent ? "/overview" : "/dashboard");
  }, [ready, token, user, page, router]);

  if (!ready || !token || !user) return null;
  const isParent = user.role === "parent";
  const allowed = isParent ? page === "overview" || page === "advisor" : page !== "overview" && page !== "advisor";
  if (!allowed) return null;
  return children;
}