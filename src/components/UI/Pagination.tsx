'use client'

interface Props {
  currentPage: number;
  setCurrentPage: (updater: number | ((p: number) => number)) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalItems: number;
  darkMode: boolean;
  itemLabel?: string;
  pageSizeOptions?: number[];
}

// Shared "N of M" + Previous/Next + rows-per-page control used by every list/table page in
// the app, so each page doesn't reimplement the same slicing UI. Callers own the actual
// currentPage/pageSize state and do the `.slice(...)` themselves -- this only renders the
// controls and the "Showing X to Y of Z" text.
export default function Pagination({
  currentPage, setCurrentPage, pageSize, setPageSize, totalItems, darkMode,
  itemLabel = 'items', pageSizeOptions = [10, 25, 50, 100],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems === 0) return null;

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t flex-wrap gap-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      <div className={`flex items-center gap-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        <span>
          Showing <span className="font-medium text-blue-500">{(currentPage - 1) * pageSize + 1}</span> to{' '}
          <span className="font-medium text-blue-500">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
          <span className="font-medium text-blue-500">{totalItems}</span> {itemLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className={`px-2 py-1 rounded-lg text-sm outline-none border ${
              darkMode ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
              darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:hover:bg-gray-200'
            }`}
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
              darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:hover:bg-gray-200'
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
