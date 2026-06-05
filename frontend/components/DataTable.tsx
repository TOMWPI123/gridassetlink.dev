"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, PriorityBadge } from "@/components/Badges";
import { displayValue, formatLabel } from "@/lib/api";
import type { JsonRecord } from "@/types";

type Props = { rows: JsonRecord[]; columns: string[]; detailBase?: string; filterField?: string; onExport?: () => void };
const statusLike = new Set(["status", "criticality", "priority"]);

export function DataTable({ rows, columns, detailBase, filterField, onExport }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(columns[0] || "id");
  const [page, setPage] = useState(0);
  const [filterValue, setFilterValue] = useState("");
  const pageSize = 12;
  const filterOptions = useMemo(() => filterField ? Array.from(new Set(rows.map((row) => displayValue(row[filterField])).filter((value) => value !== "-"))).sort() : [], [filterField, rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (filterField && filterValue && displayValue(row[filterField]) !== filterValue) return false;
    return !query || Object.values(row).some((value) => displayValue(value).toLowerCase().includes(query.toLowerCase()));
  }).sort((a, b) => displayValue(a[sortKey]).localeCompare(displayValue(b[sortKey]), undefined, { numeric: true })), [filterField, filterValue, query, rows, sortKey]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div className="panel">
      <div className="panel-header"><div className="toolbar" style={{ flex: 1 }}><input className="input" style={{ maxWidth: 320 }} value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} placeholder="Search table" />{filterField ? <select className="select" style={{ maxWidth: 240 }} value={filterValue} onChange={(e) => setFilterValue(e.target.value)}><option value="">{formatLabel(filterField)}</option>{filterOptions.map((v) => <option key={v}>{v}</option>)}</select> : null}</div><div className="toolbar">{onExport ? <button className="icon-button" title="Export CSV" onClick={onExport}><Download size={16} /></button> : null}<span className="subtle">{filtered.length} rows</span></div></div>
      <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column} onClick={() => setSortKey(column)}>{formatLabel(column)}</th>)}{detailBase ? <th>Open</th> : null}</tr></thead><tbody>{visible.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{renderCell(column, row[column])}</td>)}{detailBase ? <td><Link className="icon-button" title="Open detail" href={`${detailBase}/${row.id}`}><Eye size={16} /></Link></td> : null}</tr>)}</tbody></table></div>
      <div className="panel-header" style={{ borderBottom: 0 }}><span className="subtle">Page {page + 1} of {pageCount}</span><div className="toolbar"><button className="icon-button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={16} /></button><button className="icon-button" disabled={page + 1 >= pageCount} onClick={() => setPage(Math.min(pageCount - 1, page + 1))}><ChevronRight size={16} /></button></div></div>
    </div>
  );
}

function renderCell(column: string, value: unknown) {
  if (column === "priority") return <PriorityBadge value={value} />;
  if (statusLike.has(column) || column.endsWith("_status")) return <Badge value={value} />;
  if (column.includes("cost") && typeof value === "number") return `$${value.toLocaleString()}`;
  return displayValue(value);
}
