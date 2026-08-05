import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  RefreshCw,
  Database as DatabaseIcon,
  Clock,
  Filter,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eraser
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
  kingdom: string;
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

interface FilterOptions {
  domain: string[];
  kingdom: string[];
  phylum: string[];
  class: string[];
  order: string[];
  family: string[];
  genus: string[];
  organism_name: string[];
}

type SortOrder = "asc" | "desc";

export default function App() {
  const [data, setData] = useState<Organism[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    domain: [],
    kingdom: [],
    phylum: [],
    class: [],
    order: [],
    family: [],
    genus: [],
    organism_name: [],
  });

  // Filters & Sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filter, setFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<keyof Organism, string>>>({});
  const [sortBy, setSortBy] = useState<keyof Organism>("organism_name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Downloader State
  const MAX_DOWNLOAD_QUEUE = 100000;
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadFiles, setDownloadFiles] = useState<string[]>([]);
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [activeTab, setActiveTab] = useState<"wget" | "curl" | "powershell">("wget");

  // Metadata State
  const [isMetadataVisible, setIsMetadataVisible] = useState(false);
  const [metadataContent, setMetadataContent] = useState<any>(null);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataType, setMetadataType] = useState<"project" | "biosample" | null>(null);
  const [metadataId, setMetadataId] = useState("");
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const openTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMetadataHover = (type: "project" | "biosample", id: string) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    
    openTimerRef.current = setTimeout(async () => {
      // If it's already the same content and visible, don't re-fetch
      if (metadataId === id && metadataType === type && isMetadataVisible) return;

      setMetadataTitle(`${type === "project" ? "BioProject" : "BioSample"}: ${id}`);
      setMetadataType(type);
      setMetadataId(id);
      setIsMetadataLoading(true);
      setIsMetadataVisible(true);
      setMetadataContent(null);

      try {
        const response = await fetch(`/api/proxy/metadata?type=${type}&id=${id}`);
        if (!response.ok) throw new Error("Failed to fetch metadata");
        const data = await response.json();
        setMetadataContent(data);
      } catch (err) {
        console.error("Metadata fetch error:", err);
      } finally {
        setIsMetadataLoading(false);
      }
    }, 1000);
  };

  const handleMetadataLeave = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsMetadataVisible(false);
    }, 1000);
  };

  const resetAll = () => {
    setFilter("");
    setColumnFilters({});
    setPage(1);
    setSortBy("organism_name");
    setSortOrder("asc");
  };

  const startDownloadAll = async () => {
    setIsPreparingDownload(true);
    try {
      const queryParams = new URLSearchParams({
        filter: filter
      });
      Object.entries(columnFilters).forEach(([key, value]) => {
        if (value) queryParams.append(`filter_${key}`, value as string);
      });

      const response = await fetch(`/api/organisms/files?${queryParams.toString()}`);
      const files = await response.json();

      if (files.length > MAX_DOWNLOAD_QUEUE) {
        alert(`Too many files. Limit is ${MAX_DOWNLOAD_QUEUE}.`);
        return;
      }

      setDownloadFiles(files);
      setIsDownloadModalOpen(true);
    } catch (err) {
      console.error("Failed to fetch file list:", err);
      alert("Failed to prepare file list.");
    } finally {
      setIsPreparingDownload(false);
    }
  };

  const getFullUrl = (fileName: string) => {
    const prefixStr = fileName.replace('.gz', '');
    if (prefixStr.length === 6) {
      const p1 = prefixStr.substring(0, 2);
      const p2 = prefixStr.substring(2, 4);
      return `https://ddbj.nig.ac.jp/public/ddbj_database/wgs/${p1}/${p2}/${fileName}`;
    } else {
      const p1 = prefixStr.substring(0, 2);
      return `https://ddbj.nig.ac.jp/public/ddbj_database/wgs/${p1}/${fileName}`;
    }
  };

  const generateCommands = () => {
    if (activeTab === "wget") {
      return downloadFiles.map(f => `wget ${getFullUrl(f)}`).join("\n");
    } else if (activeTab === "curl") {
      return downloadFiles.map(f => `curl -O ${getFullUrl(f)}`).join("\n");
    } else {
      return downloadFiles.map(f => `Invoke-WebRequest -Uri "${getFullUrl(f)}" -OutFile "${f}"`).join("\n");
    }
  };

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
      const response = await fetch(`/api/organisms?${params}`);
      if (!response.ok) throw new Error("Failed to fetch data");
      const result = await response.json();
      setData(result.data);
      setPagination(result.pagination);
      setLastUpdated(result.lastUpdated);
      if (result.filters) {
        setFilterOptions(result.filters);
      }
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
    { key: "kingdom", label: "Kingdom" },
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
            
            {(filter || Object.values(columnFilters).some(v => v)) && (
              <button 
                onClick={resetAll}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 rounded-xl transition-all text-xs font-bold border border-zinc-200 shadow-sm active:scale-95"
                title="Clear all filters and search"
              >
                <Eraser className="w-4 h-4" />
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Taxonomic Filters */}
        <div className="bg-white border border-zinc-200 rounded-2xl mb-8 shadow-sm overflow-hidden">
          <button 
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="w-full p-6 flex items-center justify-between hover:bg-zinc-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider">Taxonomic Filters</h2>
              {Object.values(columnFilters).some(v => v) && !isFiltersExpanded && (
                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                  Active
                </span>
              )}
            </div>
            <motion.div
              animate={{ rotate: isFiltersExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            </motion.div>
          </button>

          <AnimatePresence>
            {isFiltersExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <div className="px-6 pb-6">
                  <div className="flex flex-col gap-4">
                    {(['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'organism_name'] as const).map((tax, index, array) => {
                      const parentKey = index > 0 ? array[index - 1] : null;
                      const isVisible = !parentKey || columnFilters[parentKey];
                      
                      if (!isVisible) return null;

                      return (
                        <motion.div 
                          key={tax} 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-4"
                        >
                          {index > 0 && (
                            <div className="flex flex-col items-center ml-4 mr-2">
                              <div className="w-px h-4 bg-zinc-200" />
                              <ChevronRight className="w-3 h-3 text-zinc-300 rotate-90" />
                            </div>
                          )}
                          <div className="flex-1 max-w-md space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-[8px]">
                                {index + 1}
                              </span>
                              {tax.replace('_', ' ')}
                            </label>
                            <div className="relative group">
                              <select
                                value={columnFilters[tax] || ""}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  setColumnFilters(prev => {
                                    const next = { ...prev, [tax]: newValue };
                                    const levels = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'organism_name'];
                                    const currentIndex = levels.indexOf(tax);
                                    for (let i = currentIndex + 1; i < levels.length; i++) {
                                      delete next[levels[i] as keyof Organism];
                                    }
                                    return next;
                                  });
                                  setPage(1);
                                }}
                                className="w-full pl-3 pr-8 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer hover:bg-zinc-100"
                              >
                                <option value="">Select {tax.replace('_', ' ').charAt(0).toUpperCase() + tax.replace('_', ' ').slice(1)}</option>
                                {filterOptions[tax].map((val) => (
                                  <option key={val} value={val}>{val}</option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover:text-emerald-500 transition-colors">
                                <ChevronRight className="w-3 h-3 rotate-90" />
                              </div>
                            </div>
                          </div>
                          {columnFilters[tax] && (
                            <div className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                              Selected
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  {Object.values(columnFilters).some(v => v) && (
                    <div className="mt-6 pt-6 border-t border-zinc-100 flex justify-end">
                      <button
                        onClick={() => {
                          setColumnFilters({});
                          setPage(1);
                        }}
                        className="text-xs font-bold text-zinc-400 hover:text-emerald-600 transition-colors flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

          <div className="flex items-center gap-3">
            <button
              onClick={startDownloadAll}
              disabled={isPreparingDownload || (pagination?.total || 0) === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              {isPreparingDownload ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Get Download Commands ({(pagination?.total || 0).toLocaleString()})
            </button>
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
                        {['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'organism_name'].includes(col.key) && (
                          <Filter className="w-2.5 h-2.5 ml-1 text-zinc-300 group-hover:text-emerald-400 transition-colors" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-white border-b border-zinc-100">
                  {columns.map(col => (
                    <th key={`filter-${col.key}`} className="px-2 py-2">
                      {['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'organism_name'].includes(col.key) ? (
                        <select
                          className="w-full px-2 py-1 text-[10px] border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500 font-normal appearance-none bg-white cursor-pointer"
                          value={columnFilters[col.key] || ""}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const taxKey = col.key;
                            setColumnFilters(prev => {
                              const next = { ...prev, [taxKey]: newValue };
                              const levels = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'organism_name'];
                              const currentIndex = levels.indexOf(taxKey);
                              if (currentIndex !== -1) {
                                for (let i = currentIndex + 1; i < levels.length; i++) {
                                  delete next[levels[i] as keyof Organism];
                                }
                              }
                              return next;
                            });
                            setPage(1);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">All</option>
                          {filterOptions[col.key as keyof FilterOptions]?.map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      ) : (
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
                      )}
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
                          <span
                            onMouseEnter={() => handleMetadataHover("project", row.bioproject)}
                            onMouseLeave={handleMetadataLeave}
                            className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-help flex items-center gap-1 text-xs"
                          >
                            {row.bioproject}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          <span
                            onMouseEnter={() => handleMetadataHover("biosample", row.biosample)}
                            onMouseLeave={handleMetadataLeave}
                            className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-help flex items-center gap-1 text-xs"
                          >
                            {row.biosample}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{row.sra}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.domain}</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{row.kingdom}</td>
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

          <div className="flex items-center gap-3">
            <button
              onClick={startDownloadAll}
              disabled={isPreparingDownload || (pagination?.total || 0) === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              {isPreparingDownload ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Get Download Commands ({(pagination?.total || 0).toLocaleString()})
            </button>
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

      {/* Download Commands Modal */}
      <AnimatePresence>
        {isDownloadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <Download className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-800">Download Commands</h3>
                    <p className="text-xs text-zinc-400 font-medium">Copy commands to download {downloadFiles.length.toLocaleString()} files</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl mb-6">
                  {(['wget', 'curl', 'powershell'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        activeTab === tab 
                          ? "bg-white text-emerald-600 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-700"
                      }`}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <textarea
                    readOnly
                    value={generateCommands()}
                    className="w-full h-80 p-4 bg-zinc-900 text-zinc-300 font-mono text-xs rounded-2xl border border-zinc-800 focus:outline-none resize-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateCommands());
                      alert("Commands copied to clipboard!");
                    }}
                    className="absolute top-4 right-4 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold rounded-lg border border-zinc-700 transition-colors"
                  >
                    Copy All
                  </button>
                </div>

                <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-[11px] text-amber-800 leading-relaxed">
                    <p className="font-bold mb-1">Instructions:</p>
                    {activeTab === 'wget' && <p>Paste these commands into your terminal. Ensure wget is installed.</p>}
                    {activeTab === 'curl' && <p>Paste these commands into your terminal. Ensure curl is installed.</p>}
                    {activeTab === 'powershell' && <p>Paste these commands into a PowerShell window.</p>}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="px-6 py-2.5 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-zinc-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Metadata Hover Window */}
      <AnimatePresence>
        {isMetadataVisible && (
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl pointer-events-none p-4">
            <motion.div
              onMouseEnter={() => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }}
              onMouseLeave={handleMetadataLeave}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white rounded-3xl shadow-2xl h-full overflow-hidden flex flex-col border border-zinc-200 pointer-events-auto"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <DatabaseIcon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-800">{metadataTitle}</h3>
                    <p className="text-xs text-zinc-400 font-medium">Metadata summary from DDBJ</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMetadataVisible(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-zinc-50 border-b border-zinc-100">
                {isMetadataLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-zinc-500 font-medium text-xs">Fetching metadata...</p>
                  </div>
                ) : metadataContent ? (
                  <div className="space-y-4">
                    {(() => {
                      const data = Array.isArray(metadataContent) ? metadataContent[0] : metadataContent;
                      
                      const formatValue = (val: any): string => {
                        if (val === null || val === undefined) return "N/A";
                        if (typeof val === 'string') return val;
                        if (typeof val === 'number') return String(val);
                        if (Array.isArray(val)) {
                          return val.map(v => formatValue(v)).join(", ");
                        }
                        if (typeof val === 'object') {
                          if (val.name) return val.name;
                          if (val.label) return val.label;
                          if (val.description) return val.description;
                          if (val.value) return val.value;
                          if (val.organization) return formatValue(val.organization);
                          if (val.scientificName) return val.scientificName;
                          return JSON.stringify(val);
                        }
                        return String(val);
                      };
                      
                      if (metadataType === "project") {
                        const fields = [
                          { label: "Title", value: data.title },
                          { label: "Organization", value: data.organization },
                          { label: "Description", value: data.description },
                        ];

                        return (
                          <div className="grid grid-cols-1 gap-3">
                            {fields.map((f, i) => f.value && (
                              <div key={i} className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{f.label}</div>
                                <div className="text-sm text-zinc-800 leading-normal whitespace-pre-wrap">{formatValue(f.value)}</div>
                              </div>
                            ))}
                          </div>
                        );
                      } else if (metadataType === "biosample") {
                        const fields = [
                          { label: "Organism", value: data.organism },
                          { label: "Title", value: data.title },
                          { label: "Description", value: data.description },
                        ];

                        return (
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-1 gap-3">
                              {fields.map((f, i) => f.value && (
                                <div key={i} className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{f.label}</div>
                                  <div className="text-sm text-zinc-800 leading-normal whitespace-pre-wrap">{formatValue(f.value)}</div>
                                </div>
                              ))}
                            </div>
                            {data.attributes && (
                              <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 border-b border-zinc-100 pb-1">Attributes</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                  {Array.isArray(data.attributes) ? (
                                    data.attributes.map((attr: any, idx: number) => (
                                      <div key={idx} className="p-2 bg-zinc-50 rounded-lg border border-zinc-100 flex flex-col justify-center min-h-[44px]">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase truncate" title={formatValue(attr.attribute_name)}>{formatValue(attr.attribute_name)}</span>
                                        <span className="text-sm text-zinc-700 font-medium break-all">{formatValue(attr.content)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    Object.entries(data.attributes).map(([k, v]) => (
                                      <div key={k} className="p-2 bg-zinc-50 rounded-lg border border-zinc-100 flex flex-col justify-center min-h-[44px]">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase truncate" title={k}>{k}</span>
                                        <span className="text-sm text-zinc-700 font-medium break-all">{formatValue(v)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return Object.entries(data).map(([key, value]) => (
                        <div key={key} className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{key.replace(/_/g, ' ')}</div>
                          <div className="text-sm text-zinc-800 break-words">
                            {typeof value === 'object' && value !== null ? (
                              <pre className="text-xs font-mono bg-zinc-50 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(value, null, 2)}
                              </pre>
                            ) : (
                              String(value)
                            )}
                          </div>
                        </div>
                      ));
                    })()}

                    <div className="pt-2 flex justify-center">
                      <a 
                        href={`https://ddbj.nig.ac.jp/search/entry/${metadataType === "project" ? "bioproject" : "biosample"}/${metadataId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm bg-emerald-50 px-6 py-3 rounded-2xl transition-all border border-emerald-100 hover:shadow-md"
                        onMouseEnter={() => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }}
                      >
                        Show full information at DDBJ
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-zinc-400">
                    <AlertCircle className="w-8 h-8 text-rose-300 mx-auto mb-4" />
                    <p className="italic mb-2 font-medium">No metadata could be retrieved.</p>
                  </div>
                )}
              </div>

              <div className="p-4 flex justify-end flex-shrink-0 bg-white">
                <button
                  onClick={() => setIsMetadataVisible(false)}
                  className="px-6 py-2.5 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-zinc-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
