import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
      <Link
        href="/"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Back home
      </Link>
    </div>
  );
}
