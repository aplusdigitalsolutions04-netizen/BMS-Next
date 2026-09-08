'use client'

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { FileText, X, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import BidAnalyserTab from './BidAnalyserTab';
import SavedBidsTab from './SavedBidsTab';
import BidDocumentsTab from './BidDocumentsTab';
import { extractBuyerInfo, getBidTheme } from './utils';
import type { SavedBid } from './types';

export default function BidManagement() {
  const { state, dispatch } = useApp();
  const { darkMode } = state;
  const router = useRouter();
  const { cardBg, textPrimary, textSecondary, divider, inputClass } = getBidTheme(darkMode);

  const viewToTab = (v: string): 'analyzer' | 'saved' | 'bid-docs' =>
    v === 'saved-bids' ? 'saved' : v === 'bid-docs' ? 'bid-docs' : 'analyzer';

  const [activeTab, setActiveTabState] = useState<'analyzer' | 'saved' | 'bid-docs'>(() => {
    if (typeof window === 'undefined') return 'analyzer';
    return viewToTab(state.currentView);
  });

  // "AI Analyser", "Saved Bids" and "Bid Documents" are three separate sidebar entries but
  // share this one mounted component. setActiveTab keeps the sidebar highlight (state.currentView)
  // and the URL in sync with the tab whenever it's switched from inside this component (e.g.
  // BidAnalyserTab jumping to "saved" after a save); the effect below does the reverse -- when
  // the sidebar itself is clicked, currentView changes and this component re-syncs its tab.
  function setActiveTab(tab: 'analyzer' | 'saved' | 'bid-docs') {
    setActiveTabState(tab);
    const view = tab === 'saved' ? 'saved-bids' : tab === 'bid-docs' ? 'bid-docs' : 'bids';
    if (state.currentView !== view) router.push(`/${view}`);
  }

  // Shared state
  const [savedBids, setSavedBids]   = useState<SavedBid[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);
  function openPdfInNewTab(p: { url: string; name: string } | null) {
    if (p) window.open(p.url, '_blank', 'noopener,noreferrer');
  }

  // Generate Document state (shared between Saved Bids + Bid Documents tabs)
  const [showGenDocModal, setShowGenDocModal]     = useState(false);
  const [genDocForm, setGenDocForm]               = useState({ templateId: '', title: '', documentNumber: '', firmId: '', termsContent: '', gemOrderId: '', buyerName: '', buyerAddress: '', bidDocumentId: '' });
  const [generatingDoc, setGeneratingDoc]         = useState(false);
  const [formattingTerms, setFormattingTerms]     = useState(false);
  const [genDocHeaderFile, setGenDocHeaderFile]   = useState<File | null>(null);
  const [genDocHeaderPreview, setGenDocHeaderPreview] = useState('');
  const genDocHeaderRef = useRef<HTMLInputElement>(null);
  // Bumped after a document is generated so BidDocumentsTab knows to refetch the currently open bid's docs
  const [docsRefreshTrigger, setDocsRefreshTrigger] = useState(0);

  // Role-based visibility -- these two are ordinary role permissions (toggled in Roles &
  // Permissions), same as every other feature flag; there is no per-user override.
  const userRole = state.currentUser?.roleId || '';
  const roleAssigned = state.roles.find(r => r.id === userRole);
  const rolePerms = roleAssigned?.permissions || [];
  const canSeeAssignee =
    userRole === 'ADMIN' ||
    userRole === 'MANAGER' ||
    rolePerms.includes('show:assign-column');

  const canEditBidParams =
    userRole === 'ADMIN' ||
    userRole === 'MANAGER' ||
    rolePerms.includes('bid:edit-parameters');

  // BidManagement stays mounted across sidebar clicks between its own sub-tabs (all three
  // dispatch into this one component), so re-sync the local tab whenever the sidebar/dashboard
  // changes currentView to one of the three bid views.
  useEffect(() => {
    if (state.currentView !== 'bids' && state.currentView !== 'saved-bids' && state.currentView !== 'bid-docs') return;
    setActiveTabState(viewToTab(state.currentView));
  }, [state.currentView]);

  useEffect(() => {
    if (activeTab === 'saved') fetchSavedBids();
    if (activeTab === 'bid-docs') fetchSavedBids();
  }, [activeTab]);

  // Background auto-refresh every 5s so a bid saved/edited by another user shows up here
  // without a manual reload -- silent (isPoll) so it never flashes the loading spinner.
  useEffect(() => {
    if (activeTab !== 'saved' && activeTab !== 'bid-docs') return;
    const id = setInterval(() => fetchSavedBids(true), 5000);
    return () => clearInterval(id);
  }, [activeTab]);

  async function fetchSavedBids(isPoll = false) {
    if (!isPoll) setLoadingBids(true);
    try {
      const res = await axios.get('/api/bids');
      setSavedBids(res.data);
    } catch {
      if (!isPoll) toast.error('Failed to load saved bids');
    } finally {
      if (!isPoll) setLoadingBids(false);
    }
  }

  // Generate Doc — opens from Saved Bids tab or Bid Documents tab. Always tied to a real saved
  // bid (SavedBid.id), so the generated document links into that bid's Bid Documents list.
  function openGenerateDocFromSavedBid(bid: SavedBid) {
    // Map bid parameters to the format extractBuyerInfo expects
    const mappedParams = (bid.parameters || []).map(p => ({
      name: p.parameterName,
      value: p.parameterValue,
    }));
    const buyer = extractBuyerInfo(mappedParams);

    // Prefer the persisted, footer/disclaimer-cleaned buyer T&C (same source used right after
    // analysis) -- fall back to the AI-extracted parameter, then the summary, only if it's missing
    // (e.g. bids saved before this field existed).
    const tcParam = mappedParams.find(p => /terms?\s*(&|and)\s*conditions?/i.test(p.name));
    const termsContent = (bid.buyerTerms && bid.buyerTerms.trim())
      ? bid.buyerTerms
      : tcParam?.value?.trim()
      || bid.extractedSummary?.replace(/<[^>]+>/g, '').trim()
      || '';

    setGenDocForm({
      templateId: '',
      title: (bid.gemOrderId ? `${bid.gemOrderId} -- ` : bid.title ? `${bid.title} -- ` : '') + 'Buyer Terms & Conditions',
      documentNumber: '',
      firmId: '',
      termsContent,
      gemOrderId: bid.gemOrderId || '',
      buyerName: buyer.name,
      buyerAddress: buyer.address,
      bidDocumentId: bid.id,
    });
    setGenDocHeaderFile(null);
    setGenDocHeaderPreview('');
    setShowGenDocModal(true);
  }

  function handleHeaderImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setGenDocHeaderFile(f);
    setGenDocHeaderPreview(URL.createObjectURL(f));
    setGenDocForm(p => ({ ...p, templateId: '' }));
  }

  function clearHeaderImage() {
    setGenDocHeaderFile(null);
    setGenDocHeaderPreview('');
    if (genDocHeaderRef.current) genDocHeaderRef.current.value = '';
  }

  async function aiFormatTerms() {
    if (!genDocForm.termsContent.trim()) {
      toast.error('T&C content is empty — please run the analysis first');
      return;
    }
    setFormattingTerms(true);
    const tid = toast.loading('AI is formatting T&C professionally...');
    try {
      const firm = state.firms.find(f => f.id === genDocForm.firmId);
      const res = await axios.post('/api/bids/format-terms', {
        rawTerms: genDocForm.termsContent,
        bidTitle: genDocForm.title,
        gemOrderId: genDocForm.gemOrderId,
        firmName: firm?.name || '',
      });
      setGenDocForm(p => ({ ...p, termsContent: res.data.formatted || p.termsContent }));
      if (res.data.truncated) {
        toast.error('AI output was cut short — content may be incomplete. Please review before generating the document.', { id: tid, duration: 6000 });
      } else {
        toast.success('T&C formatted successfully!', { id: tid });
      }
    } catch {
      toast.error('AI formatting failed', { id: tid });
    } finally {
      setFormattingTerms(false);
    }
  }

  function handleGenDocTemplateChange(tid: string) {
    const t = state.templates.find(x => x.id === tid);
    setGenDocForm(p => ({
      ...p,
      templateId: tid,
      firmId: t?.firmId || p.firmId || '',
    }));
  }

  async function handleGenerateDoc() {
    if (!genDocForm.firmId) { toast.error('Please select a Firm'); return; }
    if (!genDocForm.templateId && !genDocHeaderFile) { toast.error('Please upload a header image or select a template'); return; }
    if (!genDocForm.title.trim()) { toast.error('Document title is required'); return; }
    if (!genDocForm.termsContent.trim()) { toast.error('Terms and conditions content is required'); return; }

    setGeneratingDoc(true);
    try {
      const fd = new FormData();
      fd.append('firmId', genDocForm.firmId);
      fd.append('title', genDocForm.title.trim());
      if (genDocForm.documentNumber.trim()) fd.append('documentNumber', genDocForm.documentNumber.trim());
      if (genDocForm.templateId) fd.append('templateId', genDocForm.templateId);
      if (genDocHeaderFile) fd.append('headerImage', genDocHeaderFile);
      fd.append('termsContent', genDocForm.termsContent);
      if (genDocForm.gemOrderId) fd.append('gemOrderId', genDocForm.gemOrderId);
      if (genDocForm.buyerName) fd.append('buyerName', genDocForm.buyerName);
      if (genDocForm.buyerAddress) fd.append('buyerAddress', genDocForm.buyerAddress);
      if (genDocForm.bidDocumentId) fd.append('bidDocumentId', genDocForm.bidDocumentId);
      fd.append('uploadedBy', state.currentUser?.fullName || state.currentUser?.username || 'System');

      const res = await axios.post('/api/documents/generate', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const d = res.data;
      const parsedTags = d.meta?.tags ? d.meta.tags.split(',') : [];
      dispatch({ type: 'ADD_DOCUMENT', payload: {
        id: d.id, firmId: d.firmId, title: d.title, documentNumber: d.documentNumber,
        categoryId: d.meta?.categoryCode || '', departmentId: d.meta?.departmentCode || '',
        statusId: d.meta?.statusCode || '', issueDate: d.issueDate || '', expiryDate: d.expiryDate || '',
        description: d.meta?.description || '', tags: parsedTags, keywords: d.meta?.keywords || '',
        fileName: d.meta?.fileName || '', fileSize: d.meta?.fileSize || 0, fileType: d.meta?.fileType || '',
        filePath: d.meta?.filePath || '', uploadedBy: d.meta?.uploadedBy || '',
        uploadDate: d.meta?.uploadDate || d.createdOn, version: d.meta?.version || 1,
        isArchived: d.isArchived, isDeleted: d.isDeleted,
        createdBy: 'system', createdOn: d.createdOn, updatedBy: 'system', updatedOn: d.createdOn,
      }});
      toast.success('Document generated and saved to Bid Documents!');
      setShowGenDocModal(false);
      setDocsRefreshTrigger(t => t + 1);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to generate document');
    } finally {
      setGeneratingDoc(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* Tab contents */}
      {activeTab === 'analyzer' && (
        <BidAnalyserTab
          savedBids={savedBids}
          setSavedBids={setSavedBids}
          canSeeAssignee={canSeeAssignee}
          canEditBidParams={canEditBidParams}
          setActiveTab={setActiveTab}
          setPdfPreview={openPdfInNewTab}
        />
      )}

      {activeTab === 'saved' && (
        <SavedBidsTab
          savedBids={savedBids}
          setSavedBids={setSavedBids}
          loadingBids={loadingBids}
          fetchSavedBids={fetchSavedBids}
          canSeeAssignee={canSeeAssignee}
          setPdfPreview={openPdfInNewTab}
          openGenerateDocFromSavedBid={openGenerateDocFromSavedBid}
        />
      )}

      {activeTab === 'bid-docs' && (
        <BidDocumentsTab
          savedBids={savedBids}
          loadingBids={loadingBids}
          openGenerateDocFromSavedBid={openGenerateDocFromSavedBid}
          docsRefreshTrigger={docsRefreshTrigger}
        />
      )}

      {/* Generate Document Modal */}
      {showGenDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !generatingDoc && setShowGenDocModal(false)} />
          <div className={`relative rounded-2xl border shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-700" />
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative flex items-center gap-4 px-6 py-5">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm border border-white/25 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-white">Generate Buyer T&C Document</h3>
                  <p className="text-xs text-blue-100/70 mt-0.5">Template letterhead + AI-formatted terms to professional HTML document</p>
                </div>
                <button onClick={() => setShowGenDocModal(false)} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className={`block text-xs font-semibold mb-2 ${textSecondary}`}>
                  Company Header Image <span className="text-red-500">*</span>
                  <span className={`ml-1 font-normal`}> — letterhead image shown at the top of the document</span>
                </label>
                {genDocHeaderPreview ? (
                  <div className={`relative rounded-xl border overflow-hidden ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <img src={genDocHeaderPreview} alt="Header preview" className="w-full max-h-28 object-contain bg-white p-2" />
                    <button onClick={clearHeaderImage} className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition">
                      <X size={12} />
                    </button>
                    <div className={`px-3 py-1.5 text-[10px] font-medium ${darkMode ? 'bg-gray-800 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                      Header ready: {genDocHeaderFile?.name}
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => genDocHeaderRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition ${
                      darkMode ? 'border-gray-600 hover:border-blue-500 hover:bg-blue-900/10' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/60'
                    }`}
                  >
                    <UploadCloud size={24} className={`mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                    <p className={`text-sm font-semibold ${textPrimary}`}>Upload Header Image</p>
                    <p className={`text-xs mt-1 ${textSecondary}`}>PNG or JPG — company letterhead top banner</p>
                  </div>
                )}
                <input ref={genDocHeaderRef} type="file" accept="image/*" className="hidden" onChange={handleHeaderImageChange} />

                {state.templates.filter(t => t.headerFilePath).length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                      <span className={`text-[10px] font-medium ${textSecondary}`}>or use a saved template</span>
                      <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                    </div>
                    <select
                      value={genDocForm.templateId}
                      onChange={e => { handleGenDocTemplateChange(e.target.value); if (e.target.value) clearHeaderImage(); }}
                      className={inputClass}
                    >
                      <option value="">-- Saved Template (optional) --</option>
                      {state.templates.filter(t => t.headerFilePath).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Firm / Vendor <span className="text-red-500">*</span>
                </label>
                <select value={genDocForm.firmId} onChange={e => setGenDocForm(p => ({ ...p, firmId: e.target.value }))} className={inputClass}>
                  <option value="">-- Select Firm --</option>
                  {state.firms.filter(f => !f.isDeleted).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>GEM / Tender Reference</label>
                  <input type="text" value={genDocForm.gemOrderId} onChange={e => setGenDocForm(p => ({ ...p, gemOrderId: e.target.value }))}
                    placeholder="GEM/2026/B/7402383" className={`${inputClass} font-mono`} />
                  {genDocForm.gemOrderId && <p className="text-[10px] text-emerald-500 mt-1"> Will be included in the document</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                    Document Number <span className={`font-normal ${textSecondary}`}>(optional)</span>
                  </label>
                  <input type="text" value={genDocForm.documentNumber} onChange={e => setGenDocForm(p => ({ ...p, documentNumber: e.target.value }))}
                    placeholder="Auto-generated if left empty" className={inputClass} />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Document Title <span className="text-red-500">*</span>
                </label>
                <input type="text" value={genDocForm.title} onChange={e => setGenDocForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. GEM/2026/B/xxx -- Buyer Terms & Conditions" className={inputClass} />
              </div>

              <div className={`rounded-xl border p-3.5 ${darkMode ? 'bg-gray-700/40 border-gray-600' : 'bg-blue-50/50 border-blue-100'}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                  To, — Buyer / Recipient <span className="font-normal normal-case opacity-70">(appears in the "To," section of the document)</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Buyer Name</label>
                    <input type="text" value={genDocForm.buyerName} onChange={e => setGenDocForm(p => ({ ...p, buyerName: e.target.value }))}
                      placeholder="e.g. Ministry Of Panchayati Raj" className={inputClass} />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Buyer Address / Location</label>
                    <textarea rows={2} value={genDocForm.buyerAddress} onChange={e => setGenDocForm(p => ({ ...p, buyerAddress: e.target.value }))}
                      placeholder="e.g. KERALA - 683544" className={`${inputClass} resize-none`} />
                  </div>
                </div>
                <p className={`text-[10px] mt-2 ${textSecondary}`}>Auto-filled from analysis — edit here if incorrect.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-xs font-semibold ${textSecondary}`}>
                    Terms & Conditions Content <span className="text-red-500">*</span>
                  </label>
                  <button
                    onClick={aiFormatTerms}
                    disabled={formattingTerms || !genDocForm.termsContent.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      formattingTerms || !genDocForm.termsContent.trim()
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:shadow-md hover:shadow-violet-500/25'
                    }`}
                  >
                    {formattingTerms ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {formattingTerms ? 'Formatting...' : 'AI Format'}
                  </button>
                </div>
                <div className={`flex items-start gap-2 px-3 py-2 rounded-xl mb-2 text-xs ${
                  darkMode ? 'bg-blue-900/20 border border-blue-800/40 text-blue-300' : 'bg-blue-50 border border-blue-100 text-blue-700'
                }`}>
                  <Sparkles size={12} className="flex-shrink-0 mt-0.5" />
                  <span>Click "AI Format" to convert raw T&C into a professional format with numbered sections, sub-points, and an acknowledgement block</span>
                </div>
                <textarea
                  value={genDocForm.termsContent}
                  onChange={e => setGenDocForm(p => ({ ...p, termsContent: e.target.value }))}
                  placeholder="T&C auto-extracted from bid analysis... or enter manually"
                  className={`${inputClass} min-h-[200px] max-h-[280px] resize-y font-mono text-xs leading-relaxed`}
                />
                <p className={`text-[10px] mt-1 ${textSecondary}`}>Markdown supported — automatically styled in the document</p>
              </div>
            </div>

            <div className={`flex gap-3 px-6 py-4 border-t flex-shrink-0 ${divider} ${darkMode ? 'bg-gray-900/40' : 'bg-gray-50'}`}>
              <button onClick={() => setShowGenDocModal(false)} disabled={generatingDoc}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Cancel
              </button>
              <button onClick={handleGenerateDoc} disabled={generatingDoc || formattingTerms}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg ${
                  generatingDoc || formattingTerms
                    ? 'bg-blue-400 cursor-not-allowed text-white'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/30 text-white'
                }`}>
                {generatingDoc ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {generatingDoc ? 'Generating document...' : 'Generate & Save Document'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
