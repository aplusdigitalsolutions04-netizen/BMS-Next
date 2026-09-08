'use client'

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ShieldCheck, ShieldX, Clock, FileText, Loader2, Hash, User, AlertTriangle, X, Eye,
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import Pagination from '../UI/Pagination';
import toast from 'react-hot-toast';
import type { FirmDocument } from '../../types';

const APPROVAL_WINDOW_HOURS = 48;

function hoursRemaining(uploadDate: string): number {
  const uploaded = new Date(uploadDate).getTime();
  const deadline = uploaded + APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;
  return (deadline - Date.now()) / (1000 * 60 * 60);
}

function formatRemaining(hours: number): string {
  if (hours <= 0) return 'Removing shortly';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m left`;
  return `${Math.round(hours)}h left`;
}

export default function ApprovalsManagement() {
  const { state, dispatch } = useApp();
  const { darkMode, documents, firms } = state;

  const [actionModal, setActionModal] = useState<{ doc: FirmDocument; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Re-render every minute so the countdown stays fresh
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const pending = documents
    .filter(d => !d.isDeleted && d.approvalStatus === 'PENDING' && d.bidDocumentId)
    .sort((a, b) => (a.uploadDate || '').localeCompare(b.uploadDate || ''));

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setCurrentPage(1); }, [pending.length, pageSize]);
  const paginatedPending = pending.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleAction() {
    if (!actionModal) return;
    const { doc, action } = actionModal;
    setProcessingId(doc.id);
    try {
      await axios.patch(`/api/documents/${doc.id}/approve`, {
        action,
        note: note.trim() || undefined,
        reviewedBy: state.currentUser?.fullName || state.currentUser?.username || 'Manager',
      });
      const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
      dispatch({ type: 'UPDATE_DOCUMENT', payload: { ...doc, approvalStatus: newStatus, approvalNote: note.trim() || null } });
      toast.success(`Document ${action === 'approve' ? 'approved' : 'rejected'}`);
      setActionModal(null);
      setNote('');
    } catch {
      toast.error('Failed to process approval');
    } finally {
      setProcessingId(null);
    }
  }

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-2xl font-bold ${textPrimary}`}>Document Approvals</h2>
        <p className={`text-sm ${textSecondary}`}>
          Documents uploaded against a bid need approval within {APPROVAL_WINDOW_HOURS} hours or they&apos;re automatically removed
        </p>
      </div>

      {pending.length === 0 ? (
        <div className={`${cardBg} rounded-2xl border p-16 text-center`}>
          <ShieldCheck size={52} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`font-semibold text-base ${textSecondary}`}>Nothing waiting for approval</p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            All bid documents are either approved or none are pending right now
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedPending.map(doc => {
            const firm = firms.find(f => f.id === doc.firmId);
            const remaining = hoursRemaining(doc.uploadDate);
            const urgent = remaining <= 1;
            return (
              <div key={doc.id} className={`${cardBg} rounded-2xl border p-5 relative overflow-hidden ${
                urgent ? (darkMode ? 'border-red-500/60' : 'border-red-400') : ''
              }`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
                  }`}>
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate ${textPrimary}`} title={doc.title}>{doc.title}</p>
                    {doc.gemOrderId && (
                      <p className="text-xs font-mono text-blue-500 flex items-center gap-1 mt-0.5">
                        <Hash size={10} />{doc.gemOrderId}
                      </p>
                    )}
                  </div>
                </div>

                <div className={`space-y-1.5 text-xs ${textSecondary} mb-4`}>
                  {firm && <p className="truncate">Firm: {firm.name}</p>}
                  <p className="flex items-center gap-1.5"><User size={12} /> {doc.uploadedBy || 'Unknown'}</p>
                  <p className={`flex items-center gap-1.5 font-semibold ${urgent ? 'text-red-500' : darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                    <Clock size={12} /> {formatRemaining(remaining)}
                    {urgent && <AlertTriangle size={12} />}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(doc.filePath || '', '_blank', 'noopener,noreferrer')}
                    disabled={!doc.filePath}
                    title={doc.filePath ? 'View document' : 'No file attached'}
                    className={`flex items-center justify-center p-2 rounded-xl border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                      darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => { setActionModal({ doc, action: 'approve' }); setNote(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                  >
                    <ShieldCheck size={13} /> Approve
                  </button>
                  <button
                    onClick={() => { setActionModal({ doc, action: 'reject' }); setNote(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition"
                  >
                    <ShieldX size={13} /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className={`${cardBg} rounded-2xl border`}>
          <Pagination
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalItems={pending.length}
            darkMode={darkMode}
            itemLabel="documents"
            pageSizeOptions={[12, 24, 48, 96]}
          />
        </div>
      )}

      {/* Approve / Reject modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!processingId) { setActionModal(null); setNote(''); } }} />
          <div className={`relative rounded-2xl border shadow-2xl w-full max-w-md p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <button onClick={() => { if (!processingId) { setActionModal(null); setNote(''); } }}
              className={`absolute top-4 right-4 p-1.5 rounded-lg ${darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
              <X size={16} />
            </button>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              actionModal.action === 'approve' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
            }`}>
              {actionModal.action === 'approve' ? <ShieldCheck size={22} /> : <ShieldX size={22} />}
            </div>
            <h3 className={`text-lg font-bold text-center mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {actionModal.action === 'approve' ? 'Approve Document' : 'Reject Document'}
            </h3>
            <p className={`text-sm text-center mb-4 ${textSecondary}`}>&ldquo;{actionModal.doc.title}&rdquo;</p>
            <div className="mb-5">
              <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Note <span className={`font-normal ${textSecondary}`}>(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={actionModal.action === 'approve' ? 'Add an approval note...' : 'Reason for rejection...'}
                rows={3}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none transition ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                }`}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setActionModal(null); setNote(''); }}
                disabled={!!processingId}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition disabled:opacity-40 ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >Cancel</button>
              <button
                onClick={handleAction}
                disabled={!!processingId}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40 ${
                  actionModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processingId ? <Loader2 size={14} className="animate-spin" /> : actionModal.action === 'approve' ? <ShieldCheck size={14} /> : <ShieldX size={14} />}
                {processingId ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
