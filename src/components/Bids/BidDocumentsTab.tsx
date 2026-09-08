'use client'

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  UploadCloud, FileText, Loader2, Paperclip, Eye, X, Hash, Download,
  Sparkles, Edit3, Save, Bold, Italic, Underline, AlignLeft,
  AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, Type, ImagePlus,
  ChevronLeft, Trash2, Clock, ShieldCheck, Search,
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import { formatDate, getBidTheme } from './utils';
import type { SavedBid } from './types';
import ConfirmModal from '../UI/ConfirmModal';
import Pagination from '../UI/Pagination';

const FONT_FAMILIES = [
  'Arial', 'Times New Roman', 'Georgia', 'Verdana',
  'Segoe UI', 'Courier New', 'Helvetica', 'Calibri',
];
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
const APPROVAL_WINDOW_HOURS = 48;

interface BidDoc {
  id: string;
  title: string;
  firmId: string | null;
  createdOn: string;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  filePath: string | null;
  uploadedBy: string | null;
  uploadDate: string | null;
  firmName: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

function hoursRemaining(uploadDate: string): number {
  const uploaded = new Date(uploadDate).getTime();
  const deadline = uploaded + APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;
  return (deadline - Date.now()) / (1000 * 60 * 60);
}

interface Props {
  savedBids: SavedBid[];
  loadingBids: boolean;
  openGenerateDocFromSavedBid: (bid: SavedBid) => void;
  docsRefreshTrigger: number;
}

export default function BidDocumentsTab({ savedBids, loadingBids, openGenerateDocFromSavedBid, docsRefreshTrigger }: Props) {
  const { state } = useApp();
  const { darkMode } = state;
  const { cardBg, textPrimary, textSecondary, inputClass } = getBidTheme(darkMode);

  const [searchQuery, setSearchQuery]             = useState('');
  const [bidDocTarget, setBidDocTarget]           = useState<SavedBid | null>(null);
  const [bidDocFile, setBidDocFile]               = useState<File | null>(null);
  const [bidDocTitle, setBidDocTitle]             = useState('');
  const [uploadingBidDoc, setUploadingBidDoc]     = useState(false);
  const [bidDocs, setBidDocs]                     = useState<Record<string, BidDoc[]>>({});
  const [showBidUploadModal, setShowBidUploadModal] = useState(false);
  const bidDocFileRef = useRef<HTMLInputElement>(null);

  // Edit / Delete for generated (T&C) documents
  const [editingDoc, setEditingDoc] = useState<BidDoc | null>(null);
  const [docToDelete, setDocToDelete] = useState<BidDoc | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [docPageCount, setDocPageCount] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState('12');
  const [textColor, setTextColor] = useState('#000000');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const insertImgRef = useRef<HTMLInputElement>(null);

  async function fetchBidDocs(bidId: string) {
    try {
      const res = await axios.get(`/api/bids/${bidId}/documents`);
      setBidDocs(prev => ({ ...prev, [bidId]: res.data }));
    } catch { }
  }

  // Refetch the currently open bid's documents whenever a new one is generated elsewhere
  useEffect(() => {
    if (bidDocTarget) fetchBidDocs(bidDocTarget.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsRefreshTrigger]);

  async function handleBidDocUpload(): Promise<boolean> {
    if (!bidDocTarget) return false;
    if (!bidDocFile) { toast.error('Please select a file'); return false; }
    if (!bidDocTitle.trim()) { toast.error('Please enter a document title'); return false; }

    setUploadingBidDoc(true);
    try {
      const fd = new FormData();
      fd.append('title', bidDocTitle.trim());
      fd.append('documentNumber', `BID-${Date.now()}`);
      fd.append('bidDocumentId', bidDocTarget.id);
      fd.append('file', bidDocFile);
      fd.append('uploadedBy', state.currentUser?.fullName || 'system');

      await axios.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded successfully!');
      setBidDocFile(null);
      setBidDocTitle('');
      if (bidDocFileRef.current) bidDocFileRef.current.value = '';
      await fetchBidDocs(bidDocTarget.id);
      return true;
    } catch {
      toast.error('Upload failed');
      return false;
    } finally {
      setUploadingBidDoc(false);
    }
  }

  const filteredBids = savedBids.filter(bid => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return bid.title.toLowerCase().includes(q) || (bid.gemOrderId ?? '').toLowerCase().includes(q);
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, pageSize]);
  const paginatedBids = filteredBids.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function isGenerated(doc: BidDoc) {
    return !!doc.fileName?.startsWith('generated_');
  }

  function fileUrl(doc: BidDoc) {
    return doc.filePath || `/uploads/${doc.fileName}`;
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return '';
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleDeleteDoc() {
    if (!docToDelete || !bidDocTarget) return;
    try {
      await axios.delete(`/api/documents/${docToDelete.id}`);
      toast.success('Document deleted');
      await fetchBidDocs(bidDocTarget.id);
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDocToDelete(null);
    }
  }

  /* ---- WYSIWYG editor helpers (for generated T&C documents) ---- */
  function getIDoc() {
    return iframeRef.current?.contentDocument ?? null;
  }

  function execCmd(cmd: string, value?: string) {
    const doc = getIDoc();
    if (!doc) return;
    doc.execCommand(cmd, false, value);
    iframeRef.current?.contentWindow?.focus();
  }

  function applyFontFamily(family: string) {
    setFontFamily(family);
    execCmd('fontName', family);
  }

  function applyFontSize(pt: string) {
    setFontSize(pt);
    const doc = getIDoc();
    if (!doc) return;
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    try {
      const range = sel.getRangeAt(0);
      const frag = range.extractContents();
      const span = doc.createElement('span');
      span.style.fontSize = pt + 'pt';
      span.appendChild(frag);
      range.insertNode(span);
      const nr = doc.createRange();
      nr.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nr);
    } catch {
      execCmd('fontSize', '3');
    }
  }

  function applyColor(color: string) {
    setTextColor(color);
    execCmd('foreColor', color);
  }

  function insertImage(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const doc = getIDoc();
      if (!doc) return;
      doc.execCommand('insertImage', false, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleIframeLoad() {
    const doc = getIDoc();
    if (!doc) return;
    doc.designMode = 'on';
    setIframeReady(true);

    // The document's own pagination script splits content into .a4pg pages on its window
    // 'load' event, which can still be finishing (large content / images) right as this
    // iframe's load fires -- so poll briefly instead of counting only once immediately.
    let attempts = 0;
    const countPages = () => {
      const count = doc.querySelectorAll('.a4pg').length;
      setDocPageCount(count);
      attempts++;
      if (count <= 1 && attempts < 10) setTimeout(countPages, 200);
    };
    countPages();
  }

  function openEditor(doc: BidDoc) {
    setIframeReady(false);
    setDocPageCount(0);
    setEditingDoc(doc);
  }

  function closeEditor() {
    setEditingDoc(null);
    setIframeReady(false);
  }

  async function saveEdited() {
    const doc = getIDoc();
    if (!doc || !editingDoc) return;
    setSavingEdit(true);
    try {
      const scripts = doc.querySelectorAll('script');
      scripts.forEach(s => s.remove());
      const srcEl = doc.getElementById('src');
      if (srcEl) srcEl.remove();
      const hdrTpl = doc.getElementById('hdr-tpl');
      if (hdrTpl) hdrTpl.remove();
      const ftrL = doc.getElementById('ftr-l');
      if (ftrL) ftrL.remove();
      const ftrR = doc.getElementById('ftr-r');
      if (ftrR) ftrR.remove();

      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      await axios.put('/api/documents/file', {
        fileName: editingDoc.fileName,
        content: html,
      });
      toast.success('Document saved successfully');
    } catch {
      toast.error('Failed to save document');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* LEVEL 1 — Bid Cards Grid */}
      {!bidDocTarget && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold ${textPrimary}`}>Bid Documents</h2>
              <p className={`text-sm ${textSecondary}`}>Generated T&amp;C documents and uploaded files, organised per bid</p>
            </div>
          </div>

          {!loadingBids && savedBids.length > 0 && (
            <div className="relative max-w-md">
              <Search size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search bids by title or GEM order ID..."
                className={`w-full pl-10 pr-9 py-2.5 rounded-xl border text-sm outline-none transition ${
                  darkMode ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500 focus:border-emerald-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-400'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {loadingBids ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 size={22} className="animate-spin text-blue-500" />
              <span className={`text-sm ${textSecondary}`}>Loading bids...</span>
            </div>
          ) : savedBids.length === 0 ? (
            <div className={`${cardBg} rounded-2xl border p-12 text-center`}>
              <Paperclip size={48} className={`mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-lg font-medium ${textPrimary}`}>No saved bids found</p>
              <p className={`text-sm mt-1 ${textSecondary}`}>Analyse a bid PDF from the AI Analyser tab and save it first</p>
            </div>
          ) : filteredBids.length === 0 ? (
            <div className={`${cardBg} rounded-2xl border p-12 text-center`}>
              <Search size={48} className={`mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-lg font-medium ${textPrimary}`}>No bids match your search</p>
              <p className={`text-sm mt-1 ${textSecondary}`}>Try a different title or GEM order ID</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedBids.map(bid => {
                const docCount = bidDocs[bid.id]?.length ?? null;
                return (
                  <div
                    key={bid.id}
                    onClick={() => { setBidDocTarget(bid); setBidDocTitle(''); setBidDocFile(null); fetchBidDocs(bid.id); }}
                    className={`${cardBg} rounded-2xl border p-5 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all group`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg shadow-emerald-500/20">
                        <Paperclip size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`font-bold text-sm leading-snug ${textPrimary} group-hover:text-emerald-500 transition truncate`} title={bid.title}>
                          {bid.title}
                        </h4>
                        {bid.gemOrderId && (
                          <p className={`text-xs font-mono mt-0.5 text-blue-500`}>{bid.gemOrderId}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-4">
                      <div className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                        <FileText size={13} className="text-emerald-500" />
                        <span className="font-semibold">{docCount ?? '—'}</span> docs
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                        <Hash size={12} />
                        {formatDate(bid.createdOn)}
                      </div>
                    </div>

                    <div className={`flex items-center justify-end mt-4 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <span className={`flex items-center gap-1 text-xs font-semibold text-emerald-500 opacity-0 group-hover:opacity-100 transition`}>
                        Open <Download size={12} className="rotate-180" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {filteredBids.length > 0 && (
            <div className={`${cardBg} rounded-2xl border`}>
              <Pagination
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                totalItems={filteredBids.length}
                darkMode={darkMode}
                itemLabel="bids"
                pageSizeOptions={[12, 24, 48, 96]}
              />
            </div>
          )}
        </>
      )}

      {/* LEVEL 2 — Selected Bid ke Documents */}
      {bidDocTarget && (
        <>
          {/* Header */}
          <div className={`${cardBg} rounded-2xl border px-5 py-4 flex items-center gap-3 flex-wrap`}>
            <button
              onClick={() => { setBidDocTarget(null); setBidDocFile(null); setBidDocTitle(''); }}
              className={`p-2 rounded-xl transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Paperclip size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-base truncate ${textPrimary}`}>{bidDocTarget.title}</h3>
              {bidDocTarget.gemOrderId && <p className="text-xs font-mono text-blue-500">{bidDocTarget.gemOrderId}</p>}
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
              {bidDocs[bidDocTarget.id]?.length ?? 0} docs
            </span>
            <button
              onClick={() => openGenerateDocFromSavedBid(bidDocTarget)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/25 text-white rounded-xl text-sm font-semibold transition whitespace-nowrap"
            >
              <Sparkles size={15} /> Generate T&amp;C Document
            </button>
            <button
              onClick={() => { setBidDocTitle(''); setBidDocFile(null); setShowBidUploadModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-500/20 whitespace-nowrap"
            >
              <UploadCloud size={15} /> Upload Document
            </button>
          </div>

          {/* Uploaded / Generated docs list */}
          <div className={`${cardBg} rounded-2xl border p-5`}>
            <h4 className={`font-semibold text-sm mb-4 ${textPrimary}`}>
              Documents
              {bidDocs[bidDocTarget.id]?.length ? (
                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{bidDocs[bidDocTarget.id].length}</span>
              ) : null}
            </h4>

            {!bidDocs[bidDocTarget.id] || bidDocs[bidDocTarget.id].length === 0 ? (
              <div className={`rounded-xl border-2 border-dashed p-10 text-center ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <Paperclip size={32} className={`mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-sm font-medium ${textPrimary}`}>No documents yet</p>
                <p className={`text-xs mt-1 ${textSecondary}`}>Generate a T&amp;C document or upload a file against this bid</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bidDocs[bidDocTarget.id].map((doc) => {
                  const generated = isGenerated(doc);
                  const isPending = !generated && doc.approvalStatus === 'PENDING';
                  const remaining = isPending && doc.uploadDate ? hoursRemaining(doc.uploadDate) : null;
                  return (
                    <div key={doc.id} className={`flex items-center gap-3 p-4 rounded-xl border transition hover:-translate-y-0.5 hover:shadow-md ${
                      isPending
                        ? (darkMode ? 'bg-amber-500/10 border-amber-500/50' : 'bg-amber-50 border-amber-300')
                        : (darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200')
                    }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        generated ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      }`}>
                        <FileText size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${textPrimary}`}>{doc.title}</p>
                        <p className={`text-xs mt-0.5 ${textSecondary} truncate`}>
                          {generated ? 'AI-generated T&C' : doc.fileName}
                          {doc.fileSize ? ` · ${formatSize(doc.fileSize)}` : ''}
                        </p>
                        {doc.firmName ? <p className={`text-xs ${textSecondary}`}>{doc.firmName}</p> : null}
                        {isPending && (
                          <p className={`flex items-center gap-1 text-xs font-semibold mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                            <Clock size={11} />
                            Pending approval{remaining !== null && remaining > 0 ? ` — auto-removes in ${Math.max(1, Math.round(remaining))}h` : ' — removing shortly'}
                          </p>
                        )}
                        {!generated && doc.approvalStatus === 'APPROVED' && (
                          <p className={`flex items-center gap-1 text-xs font-semibold mt-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            <ShieldCheck size={11} /> Approved
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {generated ? (
                          <>
                            <button onClick={() => window.open(fileUrl(doc), '_blank', 'noopener,noreferrer')} title="Preview"
                              className={`p-2 rounded-xl transition ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-white hover:bg-blue-50 text-blue-600 border border-gray-200'}`}>
                              <Eye size={15} />
                            </button>
                            <button onClick={() => openEditor(doc)} title="Edit"
                              className={`p-2 rounded-xl transition ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-white hover:bg-blue-50 text-blue-600 border border-gray-200'}`}>
                              <Edit3 size={15} />
                            </button>
                            <button onClick={() => setDocToDelete(doc)} title="Delete"
                              className={`p-2 rounded-xl transition ${darkMode ? 'bg-gray-600 hover:bg-red-600 text-white' : 'bg-white hover:bg-red-50 text-red-500 border border-gray-200'}`}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : doc.filePath ? (
                          <a href={`/${String(doc.filePath).replace(/^\//, '')}`} target="_blank" rel="noreferrer"
                            className={`p-2 rounded-xl transition flex-shrink-0 ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-white hover:bg-blue-50 text-blue-600 border border-gray-200'}`}
                            title="View file">
                            <Eye size={15} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload Modal */}
          {showBidUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !uploadingBidDoc && setShowBidUploadModal(false)}>
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div
                onClick={e => e.stopPropagation()}
                className={`relative w-full max-w-lg rounded-2xl shadow-2xl border p-6 space-y-5 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <UploadCloud size={17} className="text-white" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-base ${textPrimary}`}>Upload Document</h4>
                      <p className={`text-xs ${textSecondary} truncate max-w-[240px]`}>{bidDocTarget.title}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => !uploadingBidDoc && setShowBidUploadModal(false)}
                    className={`p-2 rounded-xl transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X size={17} />
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${textSecondary}`}>Document Title *</label>
                  <input
                    type="text"
                    value={bidDocTitle}
                    onChange={e => setBidDocTitle(e.target.value)}
                    placeholder="e.g. Purchase Order, Work Order..."
                    className={inputClass}
                  />
                </div>

                <div
                  onClick={() => bidDocFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                    bidDocFile
                      ? 'border-emerald-400 bg-emerald-50/10'
                      : darkMode ? 'border-gray-600 hover:border-emerald-500 bg-gray-700/20' : 'border-gray-300 hover:border-emerald-400 bg-gray-50'
                  }`}
                >
                  <input type="file" ref={bidDocFileRef} className="hidden" onChange={e => setBidDocFile(e.target.files?.[0] || null)} />
                  {bidDocFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={20} className="text-emerald-500 flex-shrink-0" />
                      <div className="text-left min-w-0">
                        <p className={`text-sm font-semibold truncate ${textPrimary}`}>{bidDocFile.name}</p>
                        <p className={`text-xs ${textSecondary}`}>{(bidDocFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setBidDocFile(null); if (bidDocFileRef.current) bidDocFileRef.current.value = ''; }}
                        className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <UploadCloud size={28} className={`mx-auto mb-2 ${textSecondary}`} />
                      <p className={`text-sm font-medium ${textPrimary}`}>Choose a file or drop it here</p>
                      <p className={`text-xs mt-1 ${textSecondary}`}>PDF, Word, Excel, Image — any format supported</p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => !uploadingBidDoc && setShowBidUploadModal(false)}
                    disabled={uploadingBidDoc}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await handleBidDocUpload();
                      if (ok) setShowBidUploadModal(false);
                    }}
                    disabled={uploadingBidDoc}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-500/20"
                  >
                    {uploadingBidDoc ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                    {uploadingBidDoc ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============ WYSIWYG EDITOR MODAL (generated T&C docs) ============ */}
          {editingDoc && (
            <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
              <div className="flex items-center gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-wrap flex-shrink-0">
                <select
                  value={fontFamily}
                  onChange={e => applyFontFamily(e.target.value)}
                  className="text-xs bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 h-8 outline-none hover:bg-gray-600"
                  title="Font Family"
                >
                  {FONT_FAMILIES.map(f => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>

                <select
                  value={fontSize}
                  onChange={e => applyFontSize(e.target.value)}
                  className="text-xs bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 h-8 w-16 outline-none hover:bg-gray-600"
                  title="Font Size (pt)"
                >
                  {FONT_SIZES.map(s => (
                    <option key={s} value={String(s)}>{s}</option>
                  ))}
                </select>

                <div className="w-px h-6 bg-gray-600 mx-1" />

                <button onClick={() => execCmd('bold')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-white" title="Bold"><Bold size={14} /></button>
                <button onClick={() => execCmd('italic')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-white" title="Italic"><Italic size={14} /></button>
                <button onClick={() => execCmd('underline')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-white" title="Underline"><Underline size={14} /></button>

                <div className="w-px h-6 bg-gray-600 mx-1" />

                <label className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer relative" title="Text Color">
                  <Type size={14} className="text-white" />
                  <div className="absolute bottom-0.5 left-1 right-1 h-1 rounded-sm" style={{ backgroundColor: textColor }} />
                  <input type="color" value={textColor} onChange={e => applyColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                </label>

                <div className="w-px h-6 bg-gray-600 mx-1" />

                <button onClick={() => execCmd('justifyLeft')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Align Left"><AlignLeft size={14} /></button>
                <button onClick={() => execCmd('justifyCenter')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Align Center"><AlignCenter size={14} /></button>
                <button onClick={() => execCmd('justifyRight')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Align Right"><AlignRight size={14} /></button>
                <button onClick={() => execCmd('justifyFull')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Justify"><AlignJustify size={14} /></button>

                <div className="w-px h-6 bg-gray-600 mx-1" />

                <button onClick={() => execCmd('undo')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Undo"><Undo2 size={14} /></button>
                <button onClick={() => execCmd('redo')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300" title="Redo"><Redo2 size={14} /></button>

                <div className="w-px h-6 bg-gray-600 mx-1" />

                <label className="flex items-center gap-1.5 px-3 h-8 rounded hover:bg-gray-700 text-gray-300 text-xs font-medium cursor-pointer" title="Insert image">
                  <ImagePlus size={14} /> Image
                  <input ref={insertImgRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }} />
                </label>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={saveEdited}
                    disabled={savingEdit || !iframeReady}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
                  >
                    {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {savingEdit ? 'Saving...' : 'Save'}
                  </button>

                  <a href={fileUrl(editingDoc)} download={editingDoc.fileName || undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-white transition" title="Download as HTML">
                    <Download size={13} /> HTML
                  </a>

                  <a href={fileUrl(editingDoc)} download={editingDoc.fileName?.replace('.html', '.doc')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white transition" title="Download as Word">
                    <FileText size={13} /> Word
                  </a>

                  <button onClick={() => iframeRef.current?.contentWindow?.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-700 hover:bg-violet-600 text-white transition">
                    Print / PDF
                  </button>

                  <button onClick={closeEditor}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition" title="Close editor">
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="px-4 py-1.5 bg-gray-900 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-gray-500">
                  Click any text in the document to edit it. Select text, then use toolbar to change font, size, or color.
                  {iframeReady && docPageCount > 1 && <span className="text-blue-400"> — {docPageCount} pages, scroll down to see all of them.</span>}
                </span>
                <span className="text-xs text-gray-600">{editingDoc.title}</span>
              </div>

              {!iframeReady && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={32} className="animate-spin text-blue-400" />
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={fileUrl(editingDoc)}
                title={editingDoc.title}
                onLoad={handleIframeLoad}
                className={`flex-1 w-full bg-gray-200 ${iframeReady ? '' : 'hidden'}`}
              />
            </div>
          )}

          {/* Delete confirm */}
          <ConfirmModal
            isOpen={!!docToDelete}
            onClose={() => setDocToDelete(null)}
            onConfirm={handleDeleteDoc}
            title="Delete Document"
            message="This document will be permanently deleted. Continue?"
          />
        </>
      )}
    </div>
  );
}
