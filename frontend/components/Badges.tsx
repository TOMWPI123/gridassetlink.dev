"use client";

import { displayValue } from "@/lib/api";

export function Badge({ value }: { value: unknown }) {
  const text = displayValue(value);
  return <span className={`badge ${text.toLowerCase().replaceAll(" ", "_")}`}>{text}</span>;
}

export function PriorityBadge({ value }: { value: unknown }) {
  const text = displayValue(value);
  return <span className={`badge ${text.toLowerCase()}`}>{text}</span>;
}
