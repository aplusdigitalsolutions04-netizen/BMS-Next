'use client'

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table2, Plus, Trash2, Loader2 } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';
import AdvancedSpreadsheet from './AdvancedSpreadsheet';

interface SheetSummary {
  id: string;
  name: string;
  createdBy: string | null;
  createdOn: string;
  updatedOn: string;
}

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SpreadsheetDashboard() {
  const { state } = useApp();
  const { darkMode } = state;

  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  
  const [sheetToDelete, setSheetToDelete] = useState<SheetSummary | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  useEffect(() => { setCurrentPage(1); }, [sheets.length, pageSize]);
  const paginatedSheets = sheets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  useEffect(() => {
    if (!activeSheetId) {
      fetchSheets();
    }
  }, [activeSheetId]);

  // Background auto-refresh every 5s (only on the workbook list, not while a sheet is open
  // for editing) so a workbook created/renamed by another user shows up without a reload.
  useEffect(() => {
    if (activeSheetId) return;
    const id = setInterval(() => fetchSheets(true), 5000);
    return () => clearInterval(id);
  }, [activeSheetId]);

  async function fetchSheets(isPoll = false) {
    if (!isPoll) setLoading(true);
    try {
      const res = await axios.get('/api/advanced-sheets');
      setSheets(res.data);
    } catch {
      if (!isPoll) toast.error('Failed to load workbooks');
    } finally {
      if (!isPoll) setLoading(false);
    }
  }

  async function createSheet() {
    if (!newName.trim()) { toast.error('Enter a workbook name'); return; }
    setCreating(true);
    try {
      const res = await axios.post('/api/advanced-sheets', {
        name: newName.trim(),
        createdBy: state.currentUser?.fullName || state.currentUser?.username || 'System',
      });
      toast.success('Workbook created');
      setShowNewModal(false);
      setNewName('');
      setActiveSheetId(res.data.id);
    } catch (e) {
      toast.error(axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to create workbook');
    } finally {
      setCreating(false);
    }
  }

  async function deleteSheet() {
    if (!sheetToDelete) return;
    try {
      await axios.delete(`/api/advanced-sheets/${sheetToDelete.id}`);
      toast.success('Workbook deleted');
      setSheets(prev => prev.filter(s => s.id !== sheetToDelete.id));
    } catch {
      toast.error('Failed to delete workbook');
    } finally {
      setSheetToDelete(null);
    }
  }

  if (activeSheetId) {
    return <AdvancedSpreadsheet sheetId={activeSheetId} onBack={() => setActiveSheetId(null)} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>Workbooks (Advanced)</h2>
          <p className={`text-sm ${textSecondary}`}>Excel-compatible spreadsheets with formulas, multi-sheet tabs, and complex formatting.</p>
        </div>
        <button
          onClick={() => { setNewName(''); setShowNewModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-emerald-500/25 transition"
        >
          <Plus size={17} /> New Workbook
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 size={22} className="animate-spin text-emerald-500" />
          <span className={`text-sm ${textSecondary}`}>Loading workbooks...</span>
        </div>
      ) : sheets.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <Table2 size={52} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`font-semibold text-base ${textSecondary}`}>No workbooks yet</p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>Click &quot;New Workbook&quot; to create your first advanced spreadsheet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedSheets.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveSheetId(s.id)}
              className={`${cardBg} rounded-2xl border p-5 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all group relative`}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-emerald-500/20">
                  <Table2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`font-bold text-sm leading-snug ${textPrimary} group-hover:text-emerald-500 transition truncate`} title={s.name}>
                    {s.name}
                  </h4>
                  <p className={`text-xs mt-0.5 ${textSecondary}`}>Updated {formatDate(s.updatedOn)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setSheetToDelete(s); }}
                  className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition ${darkMode ? 'hover:bg-red-900/30 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && sheets.length > 0 && (
        <div className={`${cardBg} rounded-2xl border`}>
          <Pagination
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalItems={sheets.length}
            darkMode={darkMode}
            itemLabel="workbooks"
            pageSizeOptions={[12, 24, 48, 96]}
          />
        </div>
      )}

      {/* New workbook modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !creating && setShowNewModal(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0">
                <Table2 size={18} />
              </div>
              <h3 className={`font-bold text-base ${textPrimary}`}>New Advanced Workbook</h3>
            </div>
            <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Workbook Name</label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSheet()}
              placeholder="e.g. Q3 Financial Projections..."
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition mb-5 ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-emerald-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-emerald-500'
              }`}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNewModal(false)} disabled={creating}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                Cancel
              </button>
              <button onClick={createSheet} disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:shadow-lg transition disabled:opacity-50">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!sheetToDelete}
        onClose={() => setSheetToDelete(null)}
        onConfirm={deleteSheet}
        title="Delete Workbook"
        message="This workbook and all its data will be permanently deleted. Continue?"
        isDanger
      />
    </div>
  );
}
