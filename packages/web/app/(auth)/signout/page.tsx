"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";
import Image from "next/image";

export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: "/" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary">
      <Image
        src="/img/rb_newlion2024_4_RS.png"
        alt=""
        width={64}
        height={64}
        className="ember-lion-glow opacity-80"
      />
      <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">
        Signing out…
      </p>
    </div>
  );
}
