"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

export interface DockItem {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface DockProps {
  className?: string;
  items: DockItem[];
}

interface DockIconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

const DockIconButton = React.forwardRef<HTMLButtonElement, DockIconButtonProps>(
  ({ icon: Icon, label, onClick, active, className }, ref) => {
    return (
      <motion.button
        ref={ref}
        type="button"
        whileHover={{ scale: 1.12, y: -3 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative group rounded-xl p-2 sm:p-3 transition-colors",
          "hover:bg-secondary/80",
          active &&
            "bg-primary/15 text-primary shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_25%,transparent)] ring-1 ring-primary/40",
          !active && "text-foreground",
          className
        )}
      >
        <Icon className="size-4 sm:size-5" />
        <span
          className={cn(
            "pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2",
            "rounded-md px-2 py-1 text-xs font-medium",
            "bg-popover text-popover-foreground shadow-md ring-1 ring-border",
            "opacity-0 transition-opacity group-hover:opacity-100",
            "whitespace-nowrap"
          )}
        >
          {label}
        </span>
      </motion.button>
    );
  }
);
DockIconButton.displayName = "DockIconButton";

const Dock = React.forwardRef<HTMLDivElement, DockProps>(({ items, className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex w-full items-center justify-center p-1", className)}
    >
      <motion.div
        className="relative flex w-full max-w-md items-center justify-center"
        initial={{ y: 0 }}
        animate={{ y: [0, -3, 0, 3, 0] }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <motion.div
          layout
          className={cn(
            "flex items-center gap-0.5 rounded-2xl border p-1.5",
            "backdrop-blur-xl shadow-lg",
            "bg-card/85 border-border/80",
            "ring-1 ring-primary/10",
            "transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/5"
          )}
        >
          {items.map((item) => (
            <DockIconButton key={item.label} {...item} />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
});
Dock.displayName = "Dock";

export { Dock };
