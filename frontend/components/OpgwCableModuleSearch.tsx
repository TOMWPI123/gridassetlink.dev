"use client";

import Link from "next/link";
import { ArrowRight, Cable, Search } from "lucide-react";
import { useMemo, useState } from "react";

export type OpgwCableModuleSearchItem = {
  id: string;
  cableName: string;
  lineId: string;
  lineName: string;
  status: string;
  fiberCount: number;
  routeMiles: number;
  spliceClosureCount: number;
};

type Props = {
  modules: OpgwCableModuleSearchItem[];
  currentCableId: string;
};

export function OpgwCableModuleSearch({ modules, currentCableId }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    const ranked = modules
      .map((module) => ({ module, haystack: searchableText(module) }))
      .filter(({ module, haystack }) => !normalizedQuery || haystack.includes(normalizedQuery) || module.fiberCount.toString() === normalizedQuery.replace("f", ""))
      .sort((a, b) => {
        const aCurrent = a.module.id === currentCableId ? -1 : 0;
        const bCurrent = b.module.id === currentCableId ? -1 : 0;
        if (aCurrent !== bCurrent) return aCurrent - bCurrent;
        if (!normalizedQuery) return a.module.id.localeCompare(b.module.id, undefined, { numeric: true });
        const aStarts = startsWithMatch(a.module, normalizedQuery) ? -1 : 0;
        const bStarts = startsWithMatch(b.module, normalizedQuery) ? -1 : 0;
        return aStarts - bStarts || a.module.id.localeCompare(b.module.id, undefined, { numeric: true });
      });
    return ranked.slice(0, 12).map(({ module }) => module);
  }, [currentCableId, modules, normalizedQuery]);

  return (
    <section className="opgw-module-search" aria-label="OPGW cable detail module search">
      <div className="opgw-module-search-header">
        <div>
          <span>OPGW Cable Detail Modules</span>
          <strong>Search and open any cable module</strong>
        </div>
        <em>{results.length.toLocaleString()} shown / {modules.length.toLocaleString()} total</em>
      </div>
      <label className="opgw-module-search-field">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cable ID, cable name, transmission line, status, or 96F..."
        />
      </label>
      <div className="opgw-module-search-results">
        {results.map((module) => (
          <Link
            className={`opgw-module-search-result ${module.id === currentCableId ? "current" : ""}`}
            href={`/opgw/cables/${encodeURIComponent(module.id)}`}
            key={module.id}
          >
            <span className="opgw-module-search-icon"><Cable size={16} /></span>
            <span>
              <strong>{module.cableName}</strong>
              <small>{module.id} / {module.lineName || module.lineId}</small>
            </span>
            <span className="opgw-module-search-meta">
              <em>{module.fiberCount}F</em>
              <em>{module.routeMiles.toFixed(2)} mi</em>
              <em>{module.spliceClosureCount} closures</em>
              <em>{module.status.replaceAll("_", " ")}</em>
            </span>
            <ArrowRight size={15} />
          </Link>
        ))}
        {!results.length ? <p>No OPGW cable modules match that search.</p> : null}
      </div>
    </section>
  );
}

function searchableText(module: OpgwCableModuleSearchItem) {
  return [
    module.id,
    module.cableName,
    module.lineId,
    module.lineName,
    module.status,
    `${module.fiberCount}f`,
    `${module.fiberCount} fiber`,
  ].join(" ").toLowerCase();
}

function startsWithMatch(module: OpgwCableModuleSearchItem, query: string) {
  return [module.id, module.cableName, module.lineId, module.lineName].some((value) => value.toLowerCase().startsWith(query));
}
