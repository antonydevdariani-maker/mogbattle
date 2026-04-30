import { ProtectedShell } from "@/components/auth/protected-shell";

export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
