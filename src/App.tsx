import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  RefreshCw,
  Database as DatabaseIcon,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Organism {
  id: string;
  organism_name: string;
  file_name: string;
  accession: string;
  div: string;
  submitted: string;
  updated: string;
  bioproject: string;
  biosample: string;
  sra: string;
  domain: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
}

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortOrder = "asc" | "desc";

export default function App() {
  const [data, setData] = useState<Organism[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Filters & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filter, setFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<keyof Organism, string>>>({});
  const [sortBy, setSortBy] = useState<keyof Organism>("organism_name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
        filter
      };

      // Add column filters
      Object.entries(columnFilters).forEach(([key, value]) => {
        if (value) {
          queryParams[`filter_${key}`] = value as string;
        }
      });

      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/wgs/api/organisms?${params}`);
      if (!response.ok) throw new Error("Failed to fetch data");
      const result = await response.json();
      setData(result.data);
      setPagination(result.pagination);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } catch (err) {
      setError("Error loading data. Please try again later.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, filter, columnFilters]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      fetchData();
    }, 1000); // Debounce filter changes
    return () => clearTimeout(timer);
  }, [fetchData, page, limit, sortBy, sortOrder, filter, columnFilters]);

  const handleSort = (column: keyof Organism) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const getFileLink = (fileName: string) => {
    const base = "https://ddbj.nig.ac.jp/public/ddbj_database/wgs/";
    const cleanName = fileName.replace(".gz", "");
    const len = cleanName.length;

    if (len === 4) {
      return `${base}${cleanName.substring(0, 2)}/${fileName}`;
    } else if (len === 6) {
      return `${base}${cleanName.substring(0, 2)}/${cleanName.substring(2, 4)}/${fileName}`;
    }
    return `${base}${fileName}`;
  };

  const getBioProjectLink = (projectid: string) => {
    const base = "https://ddbj.nig.ac.jp/search/entry/bioproject/";
    return `${base}${projectid}`;
  };

  const getBioSampleLink = (sampleid: string) => {
    const base = "https://ddbj.nig.ac.jp/search/entry/biosample/";
    return `${base}${sampleid}`;
  };

  const renderSortIcon = (column: keyof Organism) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortOrder === "asc" ? 
      <ArrowUp className="w-3 h-3 ml-1 text-emerald-500" /> : 
      <ArrowDown className="w-3 h-3 ml-1 text-emerald-500" />;
  };

  const columns: { key: keyof Organism; label: string }[] = [
    { key: "id", label: "ID" },
    { key: "organism_name", label: "Organism Name" },
    { key: "file_name", label: "File" },
    { key: "accession", label: "Accession" },
    { key: "div", label: "DIV" },
    { key: "submitted", label: "Submitted" },
    { key: "updated", label: "Updated" },
    { key: "bioproject", label: "BioProject" },
    { key: "biosample", label: "BioSample" },
    { key: "sra", label: "SRA" },
    { key: "domain", label: "Domain" },
    { key: "phylum", label: "Phylum" },
    { key: "class", label: "Class" },
    { key: "order", label: "Order" },
    { key: "family", label: "Family" },
    { key: "genus", label: "Genus" }
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
              <DatabaseIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">DDBJ WGS Browser</h1>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Updating..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Filter by name, file, accession..."
                className="pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                  if (e.target.value) {
                    setSortBy("id");
                    setSortOrder("asc");
                  }
                }}
              />
            </div>
            <button 
              onClick={() => fetchData()}
              className="p-2 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span>Show</span>
            <select 
              className="bg-white border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100, 250, 500].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span>entries</span>
            {pagination && (
              <span className="ml-4 font-medium text-zinc-400">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total.toLocaleString()} records
              </span>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center px-4 py-1 bg-white border border-zinc-200 rounded-lg text-sm font-medium">
              Page {page} of {pagination?.totalPages || 1}
            </div>

            <button
              disabled={page === pagination?.totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              disabled={page === pagination?.totalPages || loading}
              onClick={() => setPage(pagination?.totalPages || 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  {columns.map(col => (
                    <th 
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:bg-zinc-100 transition-colors"
                    >
                      <div className="flex items-center">
                        {col.label}
                        {renderSortIcon(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-white border-b border-zinc-100">
                  {columns.map(col => (
                    <th key={`filter-${col.key}`} className="px-2 py-2">
                      <input
                        type="text"
                        placeholder={`Filter ${col.label}...`}
                        className="w-full px-2 py-1 text-[10px] border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500 font-normal"
                        value={columnFilters[col.key] || ""}
                        onChange={(e) => {
                          setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }));
                          setPage(1);
                          if (e.target.value) {
                            setSortBy("id");
                            setSortOrder("asc");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <tr key="loading">
                      <td colSpan={columns.length} className="px-4 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                          <p className="text-zinc-500 font-medium">Loading records...</p>
                        </div>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr key="empty">
                      <td colSpan={columns.length} className="px-4 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Search className="w-8 h-8 text-zinc-300" />
                          <p className="text-zinc-500 font-medium">No records found matching your filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    data.map((row, idx) => (
                      <motion.tr 
                        key={`${row.id}-${idx}`}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.01 }}
                        className="hover:bg-zinc-50 transition-colors group"
                      >
                        <td className="px-4 py-2 text-sm text-zinc-400 font-mono">{row.id}</td>
                        <td className="px-4 py-1 text-xs font-medium text-zinc-900">{row.organism_name}</td>
                        <td className="px-4 py-2 text-sm">
                          <a 
                            href={getFileLink(row.file_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 font-mono"
                          >
                            {row.file_name}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>
                        <td className="px-4 py-1 text-sm font-mono text-zinc-600">{row.accession}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-xs font-medium">
                            {row.div}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.submitted}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.updated}</td>
                        <td className="px-4 py-2 text-sm text-zinc-600">
                          <a
                            href={getBioProjectLink(row.bioproject)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 text-xs"
                          >
                            {row.bioproject}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          <a
                            href={getBioSampleLink(row.biosample)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 text-xs"
                          >
                            {row.biosample}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{row.sra}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.domain}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.phylum}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.class}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.order}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.family}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.genus}</td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span>Show</span>
            <select 
              className="bg-white border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100, 250, 500].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span>entries</span>
            {pagination && (
              <span className="ml-4 font-medium text-zinc-400">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total.toLocaleString()} records
              </span>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center px-4 py-1 bg-white border border-zinc-200 rounded-lg text-sm font-medium">
              Page {page} of {pagination?.totalPages || 1}
            </div>

            <button
              disabled={page === pagination?.totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              disabled={page === pagination?.totalPages || loading}
              onClick={() => setPage(pagination?.totalPages || 1)}
              className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-[1600px] mx-auto px-6 py-12 border-t border-zinc-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-zinc-400 text-sm">
          <p>WGS Organism List</p>
          <div className="flex items-center gap-6">
            <a href="https://ddbj.nig.ac.jp/public/ddbj_database/wgs/" className="hover:text-zinc-600 transition-colors">WGS list</a>
            <a href="https://github.com" className="hover:text-zinc-600 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
