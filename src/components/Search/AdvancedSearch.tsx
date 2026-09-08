'use client'

import { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { formatFileSize, getFileIcon } from '../../utils/helpers';
import Badge from '../UI/Badge';
import { Search, Filter, X, Eye, Download, FileText, Building2, Gavel } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

type SearchType = 'all' | 'documents' | 'bids' | 'firms';

interface SavedBid {
  id: string;
  gemOrderId?: string;
  title: string;
  fileName: string;
  filePath: string;
  uploadedBy?: string;
  extractedSummary?: string;
  offeredProduct?: string;
  createdOn: string;
  parameters?: { parameterName: string; parameterValue?: string }[];
}

export default function AdvancedSearch() {
  const { state } = useApp();
  const { darkMode, documents, firms, categories, departments, statuses, tags: allTags, globalSearch } = state;

  const [query, setQuery] = useState(globalSearch || '');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [firmId, setFirmId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expiryFrom, setExpiryFrom] = useState('');
  const [expiryTo, setExpiryTo] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [bids, setBids] = useState<SavedBid[]>([]);

  useEffect(() => { if (globalSearch) setQuery(globalSearch); }, [globalSearch]);

  useEffect(() => {
    axios.get('/api/bids').then(r => setBids(r.data)).catch(() => {});
  }, []);

  const q = query.toLowerCase();

  const docResults = (searchType === 'all' || searchType === 'documents') ? documents.filter(d => {
    if (d.isDeleted) return false;
    if (q) {
      const firm = firms.find(f => f.id === d.firmId);
      const cat = categories.find(c => c.id === d.categoryId);
      const dept = departments.find(dep => dep.id === d.departmentId);
      const docTags = allTags.filter(t => d.tags.includes(t.id)).map(t => t.name.toLowerCase()).join(' ');
      const match =
        d.title.toLowerCase().includes(q) ||
        d.documentNumber.toLowerCase().includes(q) ||
        (d.keywords || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        firm?.name.toLowerCase().includes(q) ||
        firm?.firmCode.toLowerCase().includes(q) ||
        cat?.name.toLowerCase().includes(q) ||
        dept?.name.toLowerCase().includes(q) ||
        docTags.includes(q) ||
        (d.uploadedBy || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (firmId && d.firmId !== firmId) return false;
    if (categoryId && d.categoryId !== categoryId) return false;
    if (departmentId && d.departmentId !== departmentId) return false;
    if (status === 'active' && (d.isArchived || d.statusId === 'EXPIRED')) return false;
    if (status === 'expired' && d.statusId !== 'EXPIRED') return false;
    if (status === 'archived' && !d.isArchived) return false;
    if (dateFrom && d.uploadDate < dateFrom) return false;
    if (dateTo && d.uploadDate > dateTo) return false;
    if (expiryFrom && d.expiryDate && d.expiryDate < expiryFrom) return false;
    if (expiryTo && d.expiryDate && d.expiryDate > expiryTo) return false;
    if (selectedTags.length > 0 && !selectedTags.some(t => d.tags.includes(t))) return false;
    return true;
  }) : [];

  const bidResults = (searchType === 'all' || searchType === 'bids') ? bids.filter(b => {
    if (!q) return true;
    const paramText = (b.parameters || []).map(p => `${p.parameterName} ${p.parameterValue || ''}`).join(' ').toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      (b.gemOrderId || '').toLowerCase().includes(q) ||
      b.fileName.toLowerCase().includes(q) ||
      (b.extractedSummary || '').toLowerCase().includes(q) ||
      (b.offeredProduct || '').toLowerCase().includes(q) ||
      (b.uploadedBy || '').toLowerCase().includes(q) ||
      paramText.includes(q)
    );
  }) : [];

  const firmResults = (searchType === 'all' || searchType === 'firms') ? firms.filter(f => {
    if (f.isDeleted) return false;
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      f.firmCode.toLowerCase().includes(q) ||
      (f.panNumber || '').toLowerCase().includes(q) ||
      (f.gstNumber || '').toLowerCase().includes(q) ||
      (f.cinNumber || '').toLowerCase().includes(q) ||
      (f.gemSellerId || '').toLowerCase().includes(q) ||
      (f.contactPerson || '').toLowerCase().includes(q) ||
      (f.email || '').toLowerCase().includes(q) ||
      (f.mobile || '').toLowerCase().includes(q) ||
      (f.remarks || '').toLowerCase().includes(q)
    );
  }) : [];

  const totalResults = docResults.length + bidResults.length + firmResults.length;

  function clearAll() {
    setQuery(''); setFirmId(''); setCategoryId(''); setDepartmentId('');
    setStatus(''); setDateFrom(''); setDateTo(''); setExpiryFrom('');
    setExpiryTo(''); setSelectedTags([]); setSearchType('all');
  }

  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
  }`;
  const labelClass = `block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  const typeOptions: { key: SearchType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalResults },
    { key: 'documents', label: 'Documents', count: docResults.length },
    { key: 'bids', label: 'Bids', count: bidResults.length },
    { key: 'firms', label: 'Firms', count: firmResults.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-bold ${textPrimary}`}>Advanced Search</h2>
        <p className={`text-sm ${textSecondary}`}>Search across documents, bids, firms, keywords, tags and more</p>
      </div>

      {/* Search Bar */}
      <div className={`${cardBg} rounded-2xl border p-4 space-y-4`}>
        <div className="flex gap-3">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl flex-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <Search size={20} className="opacity-50 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search by name, number, keywords, tags, GEM ID, PAN, GST, summary..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={`bg-transparent outline-none w-full text-sm ${darkMode ? 'text-white placeholder-gray-500' : ''}`}
            />
            {query && <button onClick={() => setQuery('')}><X size={16} className={textSecondary} /></button>}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition ${
              showFilters ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Filter size={16} /> Filters
          </button>
        </div>

        {/* Type Tabs */}
        <div className="flex gap-2 flex-wrap">
          {typeOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSearchType(opt.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                searchType === opt.key
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${searchType === opt.key ? 'bg-blue-500' : darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className={`pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            {(searchType === 'all' || searchType === 'documents') && (
              <>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textSecondary}`}>Document Filters</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Firm</label>
                    <select className={inputClass} value={firmId} onChange={e => setFirmId(e.target.value)}>
                      <option value="">All Firms</option>
                      {firms.filter(f => !f.isDeleted).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Category</label>
                    <select className={inputClass} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                      <option value="">All Categories</option>
                      {categories.filter(c => !c.isDeleted).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Department</label>
                    <select className={inputClass} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
                      <option value="">All Departments</option>
                      {departments.filter(d => !d.isDeleted).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>
                      <option value="">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Upload From</label>
                    <input type="date" className={inputClass} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Upload To</label>
                    <input type="date" className={inputClass} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Expiry From</label>
                    <input type="date" className={inputClass} value={expiryFrom} onChange={e => setExpiryFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Expiry To</label>
                    <input type="date" className={inputClass} value={expiryTo} onChange={e => setExpiryTo(e.target.value)} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={labelClass}>Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.filter(t => !t.isDeleted).map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedTags(prev => prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                          selectedTags.includes(tag.id) ? 'text-white border-transparent' : darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-600'
                        }`}
                        style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={clearAll} className="text-sm text-red-500 hover:text-red-600">Clear All Filters</button>
            </div>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className={`text-sm font-medium ${textSecondary}`}>{totalResults} result(s) found</div>

      {/* Document Results */}
      {docResults.length > 0 && (
        <div className="space-y-3">
          {searchType === 'all' && (
            <div className={`flex items-center gap-2 text-sm font-semibold ${textPrimary}`}>
              <FileText size={16} className="text-blue-500" /> Documents ({docResults.length})
            </div>
          )}
          {docResults.map(doc => {
            const firm = firms.find(f => f.id === doc.firmId);
            const category = categories.find(c => c.id === doc.categoryId);
            const statusObj = statuses.find(s => s.id === doc.statusId);
            const docTags = allTags.filter(t => doc.tags.includes(t.id));
            return (
              <div key={doc.id} className={`${cardBg} rounded-2xl border p-5 hover:shadow-lg transition`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <span className="text-3xl flex-shrink-0">{getFileIcon(doc.fileType)}</span>
                    <div className="min-w-0">
                      <h4 className={`font-semibold ${textPrimary}`}>{doc.title}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-mono text-xs text-blue-500">{doc.documentNumber}</span>
                        {statusObj && <Badge text={statusObj.name} color={statusObj.color} />}
                        {doc.isArchived && <Badge text="Archived" color="#6b7280" />}
                      </div>
                      {doc.description && <p className={`text-sm mt-2 ${textSecondary}`}>{doc.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                        {firm && <span className={textSecondary}>🏢 {firm.name}</span>}
                        {category && <span className={textSecondary}>📁 {category.name}</span>}
                        <span className={textSecondary}>📅 {doc.uploadDate}</span>
                        <span className={textSecondary}>💾 {formatFileSize(doc.fileSize)}</span>
                      </div>
                      {doc.keywords && <p className={`text-xs mt-1 ${textSecondary}`}>🔑 {doc.keywords}</p>}
                      {docTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {docTags.map(t => <Badge key={t.id} text={t.name} color={t.color} variant="outline" />)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => doc.filePath ? window.open(doc.filePath, '_blank') : toast.error('No file uploaded')}
                      className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => doc.filePath ? window.open(`/api/documents/${doc.id}/download`, '_blank') : toast.error('No file uploaded')}
                      className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-500'}`}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bid Results */}
      {bidResults.length > 0 && (
        <div className="space-y-3">
          {searchType === 'all' && (
            <div className={`flex items-center gap-2 text-sm font-semibold ${textPrimary}`}>
              <Gavel size={16} className="text-purple-500" /> Bids ({bidResults.length})
            </div>
          )}
          {bidResults.map(bid => (
            <div key={bid.id} className={`${cardBg} rounded-2xl border p-5 hover:shadow-lg transition`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`font-semibold ${textPrimary}`}>{bid.title}</h4>
                    {bid.gemOrderId && (
                      <span className="font-mono text-xs text-purple-500 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">
                        GEM: {bid.gemOrderId}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <span className={textSecondary}>📄 {bid.fileName}</span>
                    {bid.uploadedBy && <span className={textSecondary}>👤 {bid.uploadedBy}</span>}
                    <span className={textSecondary}>📅 {new Date(bid.createdOn).toLocaleDateString()}</span>
                  </div>
                  {bid.offeredProduct && (
                    <p className={`text-sm mt-2 ${textSecondary}`}>
                      <span className="font-medium">Product:</span> {bid.offeredProduct}
                    </p>
                  )}
                  {bid.extractedSummary && (
                    <p className={`text-xs mt-1 line-clamp-2 ${textSecondary}`}>{bid.extractedSummary.replace(/<[^>]+>/g, '').slice(0, 200)}...</p>
                  )}
                  {bid.parameters && bid.parameters.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {bid.parameters.slice(0, 5).map((p, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded border ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                          {p.parameterName}: {p.parameterValue || '-'}
                        </span>
                      ))}
                      {bid.parameters.length > 5 && <span className={`text-xs ${textSecondary}`}>+{bid.parameters.length - 5} more</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => bid.filePath ? window.open(`/api/documents/${bid.id}/download`, '_blank') : toast.error('No file')}
                  className={`p-2 rounded-lg flex-shrink-0 ${darkMode ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-500'}`}
                  title="Download"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Firm Results */}
      {firmResults.length > 0 && (
        <div className="space-y-3">
          {searchType === 'all' && (
            <div className={`flex items-center gap-2 text-sm font-semibold ${textPrimary}`}>
              <Building2 size={16} className="text-green-500" /> Firms ({firmResults.length})
            </div>
          )}
          {firmResults.map(firm => (
            <div key={firm.id} className={`${cardBg} rounded-2xl border p-5 hover:shadow-lg transition`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`font-semibold ${textPrimary}`}>{firm.name}</h4>
                    <span className="font-mono text-xs text-blue-500">{firm.firmCode}</span>
                    <Badge text={firm.isActive ? 'Active' : 'Inactive'} color={firm.isActive ? '#10b981' : '#6b7280'} />
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    {firm.panNumber && <span className={textSecondary}>PAN: {firm.panNumber}</span>}
                    {firm.gstNumber && <span className={textSecondary}>GST: {firm.gstNumber}</span>}
                    {firm.cinNumber && <span className={textSecondary}>CIN: {firm.cinNumber}</span>}
                    {firm.gemSellerId && <span className={textSecondary}>GEM: {firm.gemSellerId}</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs">
                    {firm.contactPerson && <span className={textSecondary}>👤 {firm.contactPerson}</span>}
                    {firm.email && <span className={textSecondary}>✉️ {firm.email}</span>}
                    {firm.mobile && <span className={textSecondary}>📱 {firm.mobile}</span>}
                  </div>
                  <p className={`text-xs mt-1 ${textSecondary}`}>📌 {firm.firmType}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {totalResults === 0 && (
        <div className={`${cardBg} rounded-2xl border p-12 text-center`}>
          <Search size={48} className={`mx-auto ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-lg font-medium mt-4 ${textSecondary}`}>
            {query ? 'No results found' : 'Start typing to search'}
          </p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {query
              ? 'Try different keywords — you can search by firm name, GEM ID, PAN, GST, keywords, tags, parameters...'
              : 'Search across all documents, bids, and firms at once'}
          </p>
        </div>
      )}
    </div>
  );
}
