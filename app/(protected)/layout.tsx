import { ProtectedShell } from "@/components/auth/protected-shell";

export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
