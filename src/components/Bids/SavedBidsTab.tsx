'use client'

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search, Trash2, FileText, Loader2, Check,
  FolderOpen, X, Download, SlidersHorizontal, UserCircle, Tag,
  Eye, EyeOff, FileCode2, Plus, Table2, GripVertical,
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import { pdfUrl, formatDate, sanitizeHtml, renderMdParts, mdToHtml, getBidTheme } from './utils';
import type { SavedBid } from './types';

interface Props {
  savedBids: SavedBid[];
  setSavedBids: React.Dispatch<React.SetStateAction<SavedBid[]>>;
  loadingBids: boolean;
  fetchSavedBids: () => Promise<void>;
  canSeeAssignee: boolean;
  setPdfPreview: (p: { url: string; name: string } | null) => void;
  openGenerateDocFromSavedBid: (bid: SavedBid) => void;
}

export default function SavedBidsTab({
  savedBids,
  setSavedBids,
  loadingBids,
  fetchSavedBids,
  canSeeAssignee,
  setPdfPreview,
  openGenerateDocFromSavedBid,
}: Props) {
  const { state } = useApp();
  const { darkMode } = state;
  const { cardBg, textPrimary, textSecondary, divider } = getBidTheme(darkMode);

  const [search, setSearch]                   = useState('');
  const [categoryFilter, setCategoryFilter]   = useState('');
  const [currentPage, setCurrentPage]         = useState(1);
  const [pageSize, setPageSize]               = useState(10);
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [hiddenColumns, setHiddenColumns]     = useState<Set<string>>(new Set());
  const columnFilterRef                       = useRef<HTMLDivElement>(null);

  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [expandedHtml, setExpandedHtml] = useState<Record<string, { overview: string; detail: string; offered: string }>>({});
  const [bidToDelete, setBidToDelete]   = useState<string | null>(null);
  const [assignMenu, setAssignMenu]     = useState<string | null>(null);
  const [assigningBid, setAssigningBid] = useState<string | null>(null);
  const [bidStatusOptions, setBidStatusOptions] = useState<{ code: string; value: string }[]>([]);

  useEffect(() => {
    axios.get('/api/master')
      .then(res => {
        const group = (res.data || []).find((g: { code: string }) => g.code === 'BID_STATUS');
        setBidStatusOptions(group?.masterData || []);
      })
      .catch(() => setBidStatusOptions([]));
  }, []);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  // Manual "Add Bid" — spreadsheet-style grid entry (no PDF / AI needed)
  const DEFAULT_MANUAL_ROWS = [
    'Bid Number', 'Category', 'Department', 'Ministry', 'Bid End Date', 'Bid End Time',
    'EMD Required', 'EMD Amount', 'EPBG Required', 'EPBG Amount', 'RA Required', 'RA Type',
    'Bid Address', 'Terms & Conditions',
  ];
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualBasics, setManualBasics] = useState({ title: '', gemOrderId: '', categoryCode: '', assignedTo: '' });
  const [manualRows, setManualRows] = useState<{ name: string; value: string }[]>([]);
  const [savingManual, setSavingManual] = useState(false);
  const [manualGemDuplicate, setManualGemDuplicate] = useState(false);

  function openManualModal() {
    setManualBasics({ title: '', gemOrderId: '', categoryCode: '', assignedTo: '' });
    setManualRows(DEFAULT_MANUAL_ROWS.map(name => ({ name, value: '' })));
    setManualGemDuplicate(false);
    setShowManualModal(true);
  }

  function updateManualRow(index: number, field: 'name' | 'value', val: string) {
    setManualRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: val } : r));
  }

  function addManualRow() {
    setManualRows(prev => [...prev, { name: '', value: '' }]);
  }

  function removeManualRow(index: number) {
    setManualRows(prev => prev.filter((_, i) => i !== index));
  }

  async function checkManualGemDuplicate(id: string) {
    if (!id.trim()) { setManualGemDuplicate(false); return; }
    try {
      const res = await axios.get(`/api/bids/check?gemOrderId=${encodeURIComponent(id.trim())}`);
      setManualGemDuplicate(Boolean(res.data.exists));
    } catch {
      setManualGemDuplicate(false);
    }
  }

  async function handleManualSave() {
    if (manualGemDuplicate) { toast.error('This GEM Order ID is already saved'); return; }
    const filledRows = manualRows.filter(r => r.name.trim());
    if (!manualBasics.title.trim() && !manualBasics.gemOrderId.trim()) {
      toast.error('Enter a Bid Title or GEM Order ID');
      return;
    }
    if (filledRows.length === 0) {
      toast.error('Add at least one bid detail row');
      return;
    }

    setSavingManual(true);
    try {
      const parameters = filledRows.map(r => ({ name: r.name.trim(), value: r.value.trim() || null }));
      const tableRows = filledRows
        .map(r => `| ${r.name.trim().replace(/\|/g, '\\|')} | ${(r.value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ') || '-'} |`)
        .join('\n');
      const extractedSummary = `## Bid Details (Manually Entered)\n\n| Field | Value |\n|---|---|\n${tableRows}`;

      await axios.post('/api/bids', {
        title: manualBasics.title.trim() || manualBasics.gemOrderId.trim(),
        gemOrderId: manualBasics.gemOrderId.trim() || null,
        fileName: 'Manual Entry',
        filePath: '',
        uploadedBy: manualBasics.assignedTo || state.currentUser?.fullName || state.currentUser?.username || 'System',
        extractedSummary,
        parameters,
        offeredProduct: null,
        categoryCode: manualBasics.categoryCode || null,
        buyerTerms: null,
        bidStatus: null
      });
      toast.success('Bid added successfully!');
      setShowManualModal(false);
      await fetchSavedBids();
    } catch {
      toast.error('Failed to save bid');
    } finally {
      setSavingManual(false);
    }
  }

  useEffect(() => { setCurrentPage(1); }, [search, categoryFilter, pageSize]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnFilterRef.current && !columnFilterRef.current.contains(e.target as Node)) {
        setShowColumnFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const measure = () => setPanelWidth(tableScrollRef.current?.clientWidth || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expandedId, savedBids.length]);

  const filteredBids = savedBids.filter(b => {
    if (categoryFilter && b.categoryCode !== categoryFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      (b.gemOrderId || '').toLowerCase().includes(q) ||
      b.fileName.toLowerCase().includes(q) ||
      (b.parameters || []).some(p =>
        p.parameterName.toLowerCase().includes(q) ||
        (p.parameterValue || '').toLowerCase().includes(q)
      )
    );
  });

  const allParameterKeys = Array.from(new Set(
    filteredBids.flatMap(b => (b.parameters || []).map(p => p.parameterName))
  ));
  const visibleParameterKeys = allParameterKeys.filter(k => !hiddenColumns.has(k));

  const totalPages = Math.ceil(filteredBids.length / pageSize);
  const paginatedBids = filteredBids.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function exportToExcel() {
    if (filteredBids.length === 0) { toast.error('No bids available to export'); return; }
    const XLSX = await import('xlsx');
    const rows = filteredBids.map((b, i) => {
      const base: Record<string, string | number> = {
        'S.No': i + 1,
        'Title': b.title,
        'GEM Order ID': b.gemOrderId || '',
        'File Name': b.fileName,
        ...(canSeeAssignee ? { 'Assigned To': b.uploadedBy || '' } : {}),
        'Date': formatDate(b.createdOn),
      };
      allParameterKeys.forEach(key => {
        const param = b.parameters?.find(p => p.parameterName === key);
        base[key] = param?.parameterValue || '';
      });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saved Bids');
    XLSX.writeFile(wb, `saved_bids_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${filteredBids.length} bids exported!`);
  }

  async function handleDelete() {
    if (!bidToDelete) return;
    await axios.delete(`/api/bids/${bidToDelete}`);
    setSavedBids(prev => prev.filter(b => b.id !== bidToDelete));
    if (expandedId === bidToDelete) setExpandedId(null);
    setExpandedHtml(prev => { const n = { ...prev }; delete n[bidToDelete]; return n; });
    toast.success('Bid deleted');
  }

  async function handleAssignBid(bidId: string, userName: string | null) {
    setAssigningBid(bidId);
    setAssignMenu(null);
    try {
      await axios.patch(`/api/bids/${bidId}`, { uploadedBy: userName });
      setSavedBids(prev => prev.map(b => b.id === bidId ? { ...b, uploadedBy: userName } : b));
      toast.success(userName ? `Assigned to ${userName}` : 'Unassigned');
    } catch {
      toast.error('Failed to assign bid');
    } finally {
      setAssigningBid(null);
    }
  }

  async function handleStatusChange(bidId: string, newStatus: string) {
    try {
      await axios.patch(`/api/bids/${bidId}`, { bidStatus: newStatus });
      setSavedBids(prev => prev.map(b => b.id === bidId ? { ...b, bidStatus: newStatus } : b));
      toast.success('Bid status updated');
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function toggleExpand(bid: SavedBid) {
    if (expandedId === bid.id) { setExpandedId(null); return; }
    setExpandedId(bid.id);
    if (!expandedHtml[bid.id]) {
      let summary = bid.extractedSummary;
      if (!summary) {
        try {
          const res = await axios.get(`/api/bids/${bid.id}`);
          summary = res.data.extractedSummary;
          setSavedBids(prev => prev.map(b => b.id === bid.id ? { ...b, extractedSummary: summary } : b));
        } catch { }
      }
      if (summary) {
        const parts = await renderMdParts(summary);
        let offered = '';
        if (bid.offeredProduct) {
          const src = bid.offeredProduct.includes('|---|')
            ? bid.offeredProduct
            : bid.offeredProduct.replace(/\n/g, '  \n');
          offered = await mdToHtml(src);
        }
        setExpandedHtml(prev => ({ ...prev, [bid.id]: { ...parts, offered } }));
      }
    }
  }

  return (
    <div className="space-y-4">

      {/* Search + Column Filter */}
      <div className={`${cardBg} rounded-2xl border p-4 flex flex-col gap-3`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <Search size={15} className={textSecondary} />
            <input
              type="text"
              placeholder="Search by title, GEM Order ID, file name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`bg-transparent outline-none w-full text-sm ${
                darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900'
              }`}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X size={14} className={textSecondary} />
              </button>
            )}
          </div>

          {state.bidCategories.length > 0 && (
            <div className="relative flex-shrink-0">
              <Tag size={13} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${categoryFilter ? 'text-blue-500' : textSecondary}`} />
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className={`pl-7 pr-7 py-2.5 rounded-xl border text-xs font-medium outline-none transition appearance-none cursor-pointer ${
                  categoryFilter
                    ? darkMode ? 'bg-blue-900/30 border-blue-600 text-blue-300' : 'bg-blue-50 border-blue-400 text-blue-700'
                    : darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                <option value="">All Categories</option>
                {state.bidCategories.filter(c => c.isActive !== false).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div ref={columnFilterRef} className="relative flex-shrink-0">
            <button
              onClick={() => setShowColumnFilter(v => !v)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                showColumnFilter || hiddenColumns.size > 0
                  ? darkMode ? 'bg-blue-600 border-blue-500 text-white' : 'bg-blue-500 border-blue-500 text-white'
                  : darkMode ? 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <SlidersHorizontal size={15} />
              Columns
              {hiddenColumns.size > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  darkMode ? 'bg-blue-800 text-blue-200' : 'bg-blue-100 text-blue-700'
                }`}>
                  {allParameterKeys.length - hiddenColumns.size}/{allParameterKeys.length}
                </span>
              )}
            </button>

            {showColumnFilter && allParameterKeys.length > 0 && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" style={{ animationDuration: '0.2s' }} onClick={() => setShowColumnFilter(false)} />
                <div className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-zoom-in ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}>
                  <div className={`flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0 ${
                    darkMode ? 'border-gray-700 bg-gray-800/80' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Show / Hide Columns</span>
                    <button
                      onClick={() => setShowColumnFilter(false)}
                      className={`p-1.5 rounded-lg transition ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className={`flex items-center gap-2 px-5 py-2.5 border-b flex-shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <button onClick={() => setHiddenColumns(new Set())} className="text-[11px] font-semibold text-blue-500 hover:text-blue-400 transition">Show All</button>
                    <span className={`text-xs ${textSecondary}`}>·</span>
                    <button onClick={() => setHiddenColumns(new Set(allParameterKeys))}
                      className={`text-[11px] font-semibold transition ${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                      Hide All
                    </button>
                    <span className={`text-[11px] ml-auto ${textSecondary}`}>
                      {allParameterKeys.length - hiddenColumns.size}/{allParameterKeys.length} visible
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3 overflow-y-auto">
                    {allParameterKeys.map(key => {
                      const isVisible = !hiddenColumns.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => setHiddenColumns(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            return next;
                          })}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition ${
                            darkMode
                              ? isVisible ? 'bg-gray-700/50 text-white' : 'text-gray-500 hover:bg-gray-700/30'
                              : isVisible ? 'bg-blue-50 text-gray-900' : 'text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition ${
                            isVisible ? 'bg-blue-500 border-blue-500' : darkMode ? 'border-gray-600 bg-transparent' : 'border-gray-300 bg-transparent'
                          }`}>
                            {isVisible && <Check size={10} color="#fff" strokeWidth={3} />}
                          </span>
                          <span className="truncate font-medium">{key}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={`px-5 py-3 border-t flex-shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-100 bg-gray-50'}`}>
                    <button
                      onClick={() => setShowColumnFilter(false)}
                      className="w-full py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/25 transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <span className={`text-sm font-medium flex-shrink-0 ${textSecondary}`}>
            {filteredBids.length} bid{filteredBids.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={openManualModal}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition flex-shrink-0"
          >
            <Plus size={15} /> Add Bid Manually
          </button>
          <button
            onClick={exportToExcel}
            disabled={filteredBids.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-emerald-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Download size={15} /> Excel Export
          </button>
        </div>
      </div>

      {/* List */}
      {loadingBids ? (
        <div className={`${cardBg} rounded-2xl border p-14 flex justify-center`}>
          <Loader2 size={26} className="animate-spin text-blue-500" />
        </div>

      ) : filteredBids.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <FolderOpen size={52} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`font-semibold text-base ${textSecondary}`}>
            {search ? 'No matching bids' : 'No saved bids yet'}
          </p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            {search ? 'Try different search terms' : 'Analyse a PDF in the AI Analyser tab, then click Save Bid'}
          </p>
        </div>

      ) : (
        <div className="flex flex-col gap-4">
          <div ref={tableScrollRef} className={`${cardBg} rounded-2xl border overflow-x-auto`}>
            <table className={`text-sm text-left border-collapse`}>
              <thead className={`${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <tr>
                  <th className={`px-3 py-2.5 font-medium text-xs ${textPrimary} border-b border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} w-12 text-center`}>#</th>
                  <th className={`px-3 py-2.5 font-medium text-xs ${textPrimary} border-b border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} min-w-[180px] max-w-[220px]`}>Bid Details</th>
                  <th className={`px-3 py-2.5 font-medium text-xs ${textPrimary} border-b border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} w-[240px] text-center`}>Status</th>
                  {visibleParameterKeys.map(key => (
                    <th key={key} className={`px-3 py-2.5 font-medium text-xs ${textPrimary} border-b border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} min-w-[200px] max-w-[280px] align-top whitespace-nowrap`}>
                      {key}
                    </th>
                  ))}
                  <th className={`px-4 py-3 font-medium ${textPrimary} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {paginatedBids.map((bid, index) => (
                  <React.Fragment key={bid.id}>
                    <tr className={`${darkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-colors`}>
                      <td className={`px-4 py-3 border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} text-center font-medium ${textSecondary}`}>
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>
                      <td className={`px-4 py-3 border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <button onClick={() => toggleExpand(bid)} className="text-left w-full group/title" title="Click to view summary">
                          <p className={`font-semibold group-hover/title:text-blue-500 transition-colors ${expandedId === bid.id ? 'text-blue-500' : textPrimary}`}>
                            {bid.title}
                          </p>
                          {bid.gemOrderId && (
                            <p className={`text-xs font-mono font-semibold mt-1 group-hover/title:underline ${expandedId === bid.id ? 'text-blue-400' : 'text-blue-500'}`}>
                              {bid.gemOrderId}
                            </p>
                          )}
                        </button>
                        <p className={`text-xs ${textSecondary} mt-1`}>{formatDate(bid.createdOn)}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {bid.categoryCode && (() => {
                            const cat = state.bidCategories.find(c => c.id === bid.categoryCode);
                            return cat ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600'
                              }`}>
                                <Tag size={9} /> {cat.name}
                              </span>
                            ) : null;
                          })()}
                          {canSeeAssignee && bid.uploadedBy && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              darkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                            }`}>
                              👤 {bid.uploadedBy}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} min-w-[240px] text-center`}>
                        <div className="relative inline-block w-full">
                          <select
                            value={bid.bidStatus || ''}
                            onChange={(e) => handleStatusChange(bid.id, e.target.value)}
                            className={`w-full appearance-none px-2 py-1.5 pr-6 rounded-lg text-[11px] font-bold outline-none transition cursor-pointer border whitespace-nowrap ${
                              bid.bidStatus === 'BID_RA_AWARDED'
                                ? darkMode ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : darkMode ? 'bg-gray-800 text-gray-300 border-gray-600' : 'bg-white text-gray-600 border-gray-300'
                            }`}
                          >
                            <option value="" disabled>Select Status</option>
                            {(bidStatusOptions.length > 0 ? bidStatusOptions : [
                              { code: 'EVAL_SINGLE_PACKET', value: 'Evaluation :- IN Single Packet Bid' },
                              { code: 'FIN_EVAL_TWO_PACKET', value: 'Financial Evaluation:- IN Two Packet Bid' },
                              { code: 'TECH_EVALUATED', value: 'Technical Evaluated' },
                              { code: 'BID_RA_AWARDED', value: 'Bid /RA Awarded' },
                            ]).map(opt => (
                              <option key={opt.code} value={opt.code}>{opt.value}</option>
                            ))}
                          </select>
                          <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 ${
                            bid.bidStatus === 'BID_RA_AWARDED'
                              ? darkMode ? 'text-emerald-500' : 'text-emerald-600'
                              : textSecondary
                          }`}>
                            <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                          </div>
                        </div>
                      </td>
                      {visibleParameterKeys.map(key => {
                        const param = bid.parameters?.find(p => p.parameterName === key);
                        return (
                          <td key={key} className={`px-3 py-2.5 border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'} min-w-[200px] max-w-[280px] align-top`}>
                            <div className={`text-xs leading-relaxed break-words ${textSecondary} whitespace-pre-wrap h-[110px] overflow-y-auto pr-1`}>
                              {param?.parameterValue || '-'}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`px-4 py-3 text-center`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => toggleExpand(bid)}
                            className={`p-1.5 rounded-lg transition ${
                              expandedId === bid.id
                                ? darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-50'
                                : darkMode ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-900/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                            }`}
                            title={expandedId === bid.id ? 'Hide Summary' : 'View Summary'}
                          >
                            {expandedId === bid.id ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            onClick={() => openGenerateDocFromSavedBid(bid)}
                            className={`p-1.5 rounded-lg transition ${
                              darkMode ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-900/20' : 'text-violet-600 hover:text-violet-700 hover:bg-violet-50'
                            }`}
                            title="Generate Terms & Conditions document"
                          >
                            <FileCode2 size={15} />
                          </button>

                          {canSeeAssignee && (
                            <div className="relative">
                              <button
                                onClick={() => setAssignMenu(assignMenu === bid.id ? null : bid.id)}
                                disabled={assigningBid === bid.id}
                                className={`p-1.5 rounded-lg transition ${
                                  bid.uploadedBy
                                    ? darkMode ? 'text-indigo-400 hover:bg-indigo-900/30' : 'text-indigo-600 hover:bg-indigo-50'
                                    : darkMode ? 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-900/20' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                                }`}
                                title={bid.uploadedBy ? `Assigned: ${bid.uploadedBy}` : 'Assign to user'}
                              >
                                {assigningBid === bid.id ? <Loader2 size={15} className="animate-spin" /> : <UserCircle size={15} />}
                              </button>
                              {assignMenu === bid.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setAssignMenu(null)} />
                                  <div className={`absolute right-0 top-9 w-48 rounded-xl shadow-xl border z-30 py-1 overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                    <p className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b ${darkMode ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'}`}>
                                      Assign To
                                    </p>
                                    <button
                                      onClick={() => handleAssignBid(bid.id, null)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition ${
                                        !bid.uploadedBy
                                          ? darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-700'
                                          : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50'
                                      }`}
                                    >
                                      <span className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] text-gray-600 flex-shrink-0">—</span>
                                      Unassigned
                                    </button>
                                    <div className={`max-h-44 overflow-y-auto`}>
                                      {state.users.filter(u => u.isActive !== false).map(u => (
                                        <button
                                          key={u.id}
                                          onClick={() => handleAssignBid(bid.id, u.fullName || u.username)}
                                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition ${
                                            bid.uploadedBy === (u.fullName || u.username)
                                              ? darkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                              : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                                          }`}
                                        >
                                          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                                            {(u.fullName || u.username).charAt(0).toUpperCase()}
                                          </span>
                                          <span className="truncate">{u.fullName || u.username}</span>
                                          {bid.uploadedBy === (u.fullName || u.username) && <Check size={11} className="ml-auto flex-shrink-0 text-indigo-500" />}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {bid.filePath && (
                            <button
                              onClick={() => setPdfPreview({ url: pdfUrl(bid.filePath), name: bid.fileName })}
                              className={`p-1.5 rounded-lg transition ${
                                darkMode ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                              }`}
                              title="View uploaded PDF"
                            >
                              <FileText size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => setBidToDelete(bid.id)}
                            className={`p-1.5 rounded-lg transition ${
                              darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title="Delete this bid"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === bid.id && (
                      <tr className={`${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <td colSpan={allParameterKeys.length + 4} className="p-0">
                          <div
                            className="sticky left-0"
                            style={{ width: panelWidth ? `${panelWidth}px` : '100%' }}
                          >
                            <div className={`px-6 py-4 border-y ${divider} flex items-center justify-between gap-4 ${darkMode ? 'bg-gray-900/40' : 'bg-gray-100'}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                                  <FileText size={17} className="text-blue-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold truncate ${textPrimary}`}>{bid.title}</p>
                                  {bid.gemOrderId && <p className="text-xs font-mono font-semibold text-blue-500">{bid.gemOrderId}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {bid.filePath && (
                                  <button
                                    onClick={() => setPdfPreview({ url: pdfUrl(bid.filePath), name: bid.fileName })}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                      darkMode ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'
                                    }`}
                                  >
                                    <FileText size={13} /> View PDF
                                  </button>
                                )}
                                <button
                                  onClick={() => setExpandedId(null)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                    darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  <X size={13} /> Close
                                </button>
                              </div>
                            </div>

                            {/* BID LIFECYCLE STEPPER */}
                            <div className={`px-8 py-6 border-b ${divider} ${darkMode ? 'bg-gray-800/50' : 'bg-white'}`}>
                              <p className={`text-sm font-bold mb-6 ${textPrimary}`}>Bid Progress</p>
                              <div className="relative flex justify-between items-start w-full max-w-3xl mx-auto px-4">
                                {/* Background Line */}
                                <div className={`absolute top-3.5 left-10 right-10 h-1.5 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                                
                                {/* Active Line */}
                                <div className="absolute top-3.5 left-10 h-1.5 rounded-full bg-emerald-500 transition-all duration-500" 
                                  style={{ width: bid.bidStatus === 'WON' || bid.bidStatus === 'LOST' ? 'calc(100% - 5rem)' : bid.uploadedBy ? 'calc(50% - 2.5rem)' : '0%' }} 
                                />

                                {/* Step 1: Saved */}
                                <div className="relative flex flex-col items-center gap-2 z-10 w-32">
                                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md ring-4 ring-white dark:ring-gray-800">
                                    <Check size={16} strokeWidth={3} />
                                  </div>
                                  <div className="text-center">
                                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Analysed</div>
                                    <div className={`text-[10px] font-medium mt-0.5 ${textSecondary}`}>Saved successfully</div>
                                  </div>
                                </div>
                                
                                {/* Step 2: Assigned */}
                                <div className="relative flex flex-col items-center gap-2 z-10 w-32">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white dark:ring-gray-800 transition-colors duration-500 ${
                                    bid.uploadedBy 
                                      ? 'bg-emerald-500 text-white' 
                                      : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500')
                                  }`}>
                                    {bid.uploadedBy ? <Check size={16} strokeWidth={3} /> : '2'}
                                  </div>
                                  <div className="text-center">
                                    <div className={`text-xs font-bold ${bid.uploadedBy ? 'text-emerald-600 dark:text-emerald-400' : textPrimary}`}>Assigned</div>
                                    <div className={`text-[10px] font-medium mt-0.5 ${textSecondary}`}>
                                      {bid.uploadedBy ? `To ${bid.uploadedBy}` : 'Pending assignment'}
                                    </div>
                                  </div>
                                </div>

                                {/* Step 3: Actioned */}
                                <div className="relative flex flex-col items-center gap-2 z-10 w-32">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white dark:ring-gray-800 transition-colors duration-500 ${
                                    bid.bidStatus === 'WON' ? 'bg-emerald-500 text-white'
                                    : bid.bidStatus === 'LOST' ? 'bg-red-500 text-white'
                                    : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500')
                                  }`}>
                                    {bid.bidStatus === 'WON' ? <Check size={16} strokeWidth={3} /> : bid.bidStatus === 'LOST' ? <X size={16} strokeWidth={3} /> : '3'}
                                  </div>
                                  <div className="text-center">
                                    <div className={`text-xs font-bold ${
                                      bid.bidStatus === 'WON' ? 'text-emerald-600 dark:text-emerald-400'
                                      : bid.bidStatus === 'LOST' ? 'text-red-600 dark:text-red-400'
                                      : textPrimary
                                    }`}>
                                      {bid.bidStatus === 'WON' ? 'Bid Won' : bid.bidStatus === 'LOST' ? 'Bid Lost' : 'Result'}
                                    </div>
                                    <div className={`text-[10px] font-medium mt-0.5 ${textSecondary}`}>
                                      {bid.bidStatus === 'WON' ? 'Success!' : bid.bidStatus === 'LOST' ? 'Not selected' : 'Awaiting outcome'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {expandedHtml[bid.id] ? (
                              <div className={`px-8 py-6 border-b ${divider} ${darkMode ? 'dark' : ''}`}>
                                {bid.offeredProduct && (
                                  <div className={`mb-6 p-4 rounded-xl border ${darkMode ? 'bg-blue-900/20 border-blue-800/50' : 'bg-blue-50 border-blue-100'}`}>
                                    <h4 className={`text-sm font-bold mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>Your Offered Product Details</h4>
                                    {expandedHtml[bid.id]?.offered ? (
                                      <div className="bid-markdown" dangerouslySetInnerHTML={{ __html: sanitizeHtml(expandedHtml[bid.id].offered) }} />
                                    ) : (
                                      <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{bid.offeredProduct}</p>
                                    )}
                                  </div>
                                )}
                                {expandedHtml[bid.id].overview && (
                                  <div className="bid-markdown mb-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(expandedHtml[bid.id].overview) }} />
                                )}
                                {expandedHtml[bid.id].detail && (
                                  <div className="bid-markdown" dangerouslySetInnerHTML={{ __html: sanitizeHtml(expandedHtml[bid.id].detail) }} />
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-8 py-6">
                                <Loader2 size={18} className="animate-spin text-blue-500" />
                                <span className={`text-sm ${textSecondary}`}>Rendering analysis...</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {filteredBids.length > 0 && (
            <div className={`flex items-center justify-between px-4 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`flex items-center gap-3 text-sm ${textSecondary}`}>
                <span>
                  Showing <span className="font-medium text-blue-500">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-medium text-blue-500">{Math.min(currentPage * pageSize, filteredBids.length)}</span> of{' '}
                  <span className="font-medium text-blue-500">{filteredBids.length}</span> bids
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
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
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
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!bidToDelete}
        onClose={() => setBidToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Saved Bid"
        message="Are you sure you want to delete this saved bid? This cannot be undone."
        isDanger
      />

      {/* ============ ADD BID MANUALLY — spreadsheet-style entry ============ */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" style={{ animationDuration: '0.2s' }}
            onClick={() => !savingManual && setShowManualModal(false)} />
          <div className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-zoom-in ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            {/* Header */}
            <div className="relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-700" />
              <div className="relative flex items-center gap-4 px-6 py-5">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm border border-white/25 flex items-center justify-center flex-shrink-0">
                  <Table2 size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-white">Add Bid Manually</h3>
                  <p className="text-xs text-blue-100/70 mt-0.5">Fill in the details like a spreadsheet — no PDF or AI needed</p>
                </div>
                <button onClick={() => !savingManual && setShowManualModal(false)} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Basic fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Bid Title</label>
                  <input
                    type="text"
                    value={manualBasics.title}
                    onChange={e => setManualBasics(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Office Chairs Supply — GeM Bid"
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>GEM Order ID / Tender Number</label>
                  <input
                    type="text"
                    value={manualBasics.gemOrderId}
                    onChange={e => { setManualBasics(p => ({ ...p, gemOrderId: e.target.value })); setManualGemDuplicate(false); }}
                    onBlur={e => checkManualGemDuplicate(e.target.value)}
                    placeholder="e.g. GEM/2026/B/7402383"
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition font-mono ${
                      manualGemDuplicate
                        ? 'border-red-400 bg-red-50 dark:bg-red-900/10 text-red-600'
                        : darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                    }`}
                  />
                  {manualGemDuplicate && <p className="text-xs text-red-500 mt-1">This GEM Order ID is already saved</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Category</label>
                  <select
                    value={manualBasics.categoryCode}
                    onChange={e => setManualBasics(p => ({ ...p, categoryCode: e.target.value }))}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">— Select Category —</option>
                    {state.bidCategories.filter(c => c.isActive !== false).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {canSeeAssignee && (
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Assign To</label>
                    <select
                      value={manualBasics.assignedTo}
                      onChange={e => setManualBasics(p => ({ ...p, assignedTo: e.target.value }))}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
                        darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="">— Unassigned —</option>
                      {state.users.filter(u => u.isActive !== false).map(u => (
                        <option key={u.id} value={u.fullName || u.username}>{u.fullName || u.username}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Spreadsheet-style grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-semibold ${textSecondary}`}>Bid Details Grid</label>
                  <span className={`text-[11px] ${textSecondary}`}>
                    {manualRows.filter(r => r.name.trim() && r.value.trim()).length} of {manualRows.filter(r => r.name.trim()).length} rows filled in
                  </span>
                </div>
                <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className={darkMode ? 'bg-gray-900/50' : 'bg-gray-100'}>
                        <th className={`w-8 border-b ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}></th>
                        <th className={`text-left px-3 py-2 text-xs font-bold uppercase tracking-wide w-1/3 border-b border-r ${darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'}`}>
                          Parameter
                        </th>
                        <th className={`text-left px-3 py-2 text-xs font-bold uppercase tracking-wide border-b ${darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'}`}>
                          Value
                        </th>
                        <th className={`w-10 border-b ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualRows.map((row, i) => (
                        <tr key={i} className={`${darkMode ? 'hover:bg-gray-700/40' : 'hover:bg-blue-50/40'} transition-colors`}>
                          <td className={`text-center border-b ${darkMode ? 'border-gray-700 text-gray-600' : 'border-gray-200 text-gray-300'}`}>
                            <GripVertical size={13} className="mx-auto" />
                          </td>
                          <td className={`border-b border-r p-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <input
                              type="text"
                              value={row.name}
                              onChange={e => updateManualRow(i, 'name', e.target.value)}
                              placeholder="e.g. Bid End Date"
                              className={`w-full px-3 py-2 bg-transparent outline-none text-sm font-medium focus:ring-2 focus:ring-inset focus:ring-blue-500/40 ${
                                darkMode ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-300'
                              }`}
                            />
                          </td>
                          <td className={`border-b p-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <input
                              type="text"
                              value={row.value}
                              onChange={e => updateManualRow(i, 'value', e.target.value)}
                              placeholder="Enter value..."
                              className={`w-full px-3 py-2 bg-transparent outline-none text-sm focus:ring-2 focus:ring-inset focus:ring-blue-500/40 ${
                                darkMode ? 'text-gray-300 placeholder-gray-600' : 'text-gray-700 placeholder-gray-300'
                              }`}
                            />
                          </td>
                          <td className={`text-center border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <button
                              onClick={() => removeManualRow(i)}
                              className={`p-1.5 rounded-lg transition ${darkMode ? 'text-gray-600 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                              title="Remove row"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={addManualRow}
                    className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-t ${
                      darkMode ? 'border-gray-600 text-blue-400 hover:bg-gray-700/60' : 'border-gray-300 text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    <Plus size={13} /> Add Row
                  </button>
                </div>
                <p className={`text-[11px] mt-1.5 ${textSecondary}`}>
                  Tip: keep a row named &quot;Terms &amp; Conditions&quot; if you want to generate a T&amp;C document from this bid later.
                </p>
              </div>
            </div>

            <div className={`flex gap-3 px-6 py-4 border-t flex-shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
              <button onClick={() => setShowManualModal(false)} disabled={savingManual}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Cancel
              </button>
              <button onClick={handleManualSave} disabled={savingManual}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg ${
                  savingManual ? 'bg-blue-400 cursor-not-allowed text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/30 text-white'
                }`}>
                {savingManual ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {savingManual ? 'Saving...' : 'Save Bid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
