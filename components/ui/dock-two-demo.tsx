"use client";

import { Dock } from "@/components/ui/dock-two";
import { Heart, Home, Music, Plus, Search, Settings, User } from "lucide-react";

/** Standalone demo — not used in app routes */
export function DockDemo() {
  const items = [
    { icon: Home, label: "Home" },
    { icon: Search, label: "Search" },
    { icon: Music, label: "Music" },
    { icon: Heart, label: "Favorites" },
    { icon: Plus, label: "Add New" },
    { icon: User, label: "Profile" },
    { icon: Settings, label: "Settings" },
  ];

  return <Dock items={items} />;
}
