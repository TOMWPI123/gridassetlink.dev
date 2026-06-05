"use client";

import { Layers3, Map, MapPinned } from "lucide-react";
import type { DashboardMapMode } from "@/lib/types/assets";

type DashboardMapModeToggleProps = {
  value: DashboardMapMode;
  onChange: (mode: DashboardMapMode) => void;
};

const modes: Array<{ value: DashboardMapMode; label: string; Icon: typeof Map }> = [
  { value: "iso-ne-diagram", label: "ISO-NE Diagram", Icon: Map },
  { value: "street-level", label: "Street-Level Map", Icon: MapPinned },
  { value: "hybrid", label: "Hybrid Dashboard", Icon: Layers3 },
];

export function DashboardMapModeToggle({ value, onChange }: DashboardMapModeToggleProps) {
  return (
    <div className="dashboard-map-mode-toggle" role="group" aria-label="Dashboard map mode">
      {modes.map(({ value: mode, label, Icon }) => (
        <button className={value === mode ? "active" : ""} type="button" key={mode} onClick={() => onChange(mode)}>
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
