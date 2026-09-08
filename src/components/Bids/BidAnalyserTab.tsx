'use client'

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  UploadCloud, FileText, Loader2,
  Copy, Check, Sparkles,
  BookmarkPlus, Bot, Save, X, Hash, FileCode2, Tag, Pencil, CheckCheck,
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import toast from 'react-hot-toast';
import {
  pdfUrl, extractGemId, sanitizeHtml, renderMdParts,
  extractBuyerInfo, extractTermsAndConditions, getBidTheme,
} from './utils';
import type { AnalysisResult, SavedBid } from './types';

interface Props {
  savedBids: SavedBid[];
  setSavedBids: React.Dispatch<React.SetStateAction<SavedBid[]>>;
  canSeeAssignee: boolean;
  canEditBidParams: boolean;
  setActiveTab: (tab: 'analyzer' | 'saved' | 'bid-docs') => void;
  setPdfPreview: (p: { url: string; name: string } | null) => void;
}

export default function BidAnalyserTab({
  savedBids,
  setSavedBids,
  canSeeAssignee,
  canEditBidParams,
  setActiveTab,
  setPdfPreview,
}: Props) {
  const { state, dispatch } = useApp();
  const { darkMode } = state;
  const { cardBg, textPrimary, textSecondary, divider, inputClass } = getBidTheme(darkMode);

  // Analyser state
  const [bidId, setBidId]               = useState('');
  const [analysis, setAnalysis]         = useState<AnalysisResult | null>(null);
  const [overviewHtml, setOverviewHtml] = useState('');
  const [detailHtml,   setDetailHtml]   = useState('');
  const [uploading, setUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver]         = useState(false);
  const [copied, setCopied]             = useState(false);
  const [showDetail, setShowDetail]     = useState(false);

  // Save modal state
  const [bidIdDuplicate, setBidIdDuplicate] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveForm, setSaveForm]           = useState({ title: '', gemOrderId: '', offeredProduct: '', assignedTo: '', categoryCode: '' });
  const [productName, setProductName]     = useState('');
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [productComparison, setProductComparison] = useState<{ parameter: string; required: string; offered: string; match: string }[]>([]);
  const [productVerdict, setProductVerdict] = useState('');
  const [saving, setSaving]               = useState(false);

  // Parameter edit mode
  const [editingParams, setEditingParams] = useState(false);

  // Template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm]           = useState({ templateId: '', newName: '', firmId: '' });
  const [savingTemplate, setSavingTemplate]       = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!analysis?.summary) { setOverviewHtml(''); setDetailHtml(''); return; }
    setShowDetail(false);
    renderMdParts(analysis.summary).then(({ overview, detail }) => {
      setOverviewHtml(overview);
      setDetailHtml(detail);
    });
  }, [analysis]);

  async function checkBidIdDuplicate(id: string) {
    if (!id.trim()) { setBidIdDuplicate(false); return; }
    try {
      const res = await axios.get(`/api/bids/check?gemOrderId=${encodeURIComponent(id.trim())}`);
      setBidIdDuplicate(Boolean(res.data.exists));
    } catch {
      setBidIdDuplicate(false);
    }
  }

  async function processUpload(file: File) {
    if (!bidId.trim()) { toast.error('Please enter the Bid ID first'); return; }
    if (file.type !== 'application/pdf') { toast.error('Only PDF files are supported'); return; }

    try {
      const checkRes = await axios.get(`/api/bids/check?gemOrderId=${encodeURIComponent(bidId.trim())}`);
      if (checkRes.data.exists) {
        toast.error(`"${bidId.trim()}" is already saved — check the Saved Bids tab.`, { duration: 5000 });
        return;
      }
    } catch { }

    setUploading(true);
    setUploadProgress(0);
    setAnalysis(null);
    setOverviewHtml(''); setDetailHtml('');
    const formData = new FormData();
    formData.append('file', file);
    const tid = toast.loading('Extracting & analysing with AI... this may take a minute.');

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return Math.min(90, prev + (Math.random() * 10 + 2));
      });
    }, 800);

    try {
      const res = await axios.post('/api/bids/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 150000,
      });
      clearInterval(progressInterval);
      setUploadProgress(100);
      if (res.data.truncated) {
        toast.error('AI response was cut short — some parameters or Terms & Conditions may be incomplete. Please review carefully.', { id: tid, duration: 6000 });
      } else {
        toast.success('Analysis complete!', { id: tid });
      }
      setAnalysis(res.data);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      const msg = err?.response?.data?.error || 'Analysis failed. Check PDF is valid and OpenAI is configured.';
      toast.error(msg, { id: tid });
    } finally {
      setTimeout(() => setUploading(false), 500); // Give time for 100% animation
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processUpload(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processUpload(f);
  }

  async function handleCopy() {
    if (!analysis?.summary) return;
    try {
      await navigator.clipboard.writeText(analysis.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Copy failed'); }
  }

  function openSaveModal() {
    if (!analysis) return;
    const aiCategory = analysis.parameters?.find(p => /^category$/i.test(p.name))?.value || '';
    const matchedCat = aiCategory
      ? state.bidCategories.find(c => c.name.toLowerCase().includes(aiCategory.toLowerCase()) || aiCategory.toLowerCase().includes(c.name.toLowerCase()))
      : null;
    setSaveForm({
      title: analysis.fileName.replace(/\.pdf$/i, ''),
      gemOrderId: bidId.trim() || extractGemId(analysis.summary),
      offeredProduct: '',
      assignedTo: '',
      categoryCode: matchedCat?.id || '',
    });
    setProductName('');
    setProductComparison([]);
    setProductVerdict('');
    setShowSaveModal(true);
  }

  function getRequiredSpecsText(): string {
    if (!analysis?.parameters) return '';
    const lines: string[] = [];
    analysis.parameters.forEach(p => {
      if (/item (name|quantity|specification)/i.test(p.name) || /category/i.test(p.name)) {
        if (p.value) lines.push(`${p.name}: ${p.value}`);
      }
    });
    return lines.join('\n');
  }

  async function fetchProductDetails() {
    if (!productName.trim()) { toast.error('Please enter the product name (e.g. HP LaserJet M126nw)'); return; }
    setFetchingProduct(true);
    const tid = toast.loading('Fetching AI product details...');
    try {
      const res = await axios.post('/api/bids/product-details', {
        productName: productName.trim(),
        requiredSpecs: getRequiredSpecsText(),
      });
      const { details, comparison, verdict } = res.data;
      setSaveForm(p => ({ ...p, offeredProduct: details || p.offeredProduct }));
      setProductComparison(comparison || []);
      setProductVerdict(verdict || '');
      toast.success('Product details fetched!', { id: tid });
    } catch {
      toast.error('Failed to fetch product details', { id: tid });
    } finally {
      setFetchingProduct(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;
    setSaving(true);
    try {
      const esc = (s: string) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      let offered = saveForm.offeredProduct.trim();
      if (offered) {
        const specLines = offered.split('\n').map(l => l.trim()).filter(Boolean).map(l => `- ${l}`).join('\n');
        offered = (productName.trim() ? `**Product:** ${productName.trim()}\n\n` : '') + specLines;
      }
      if (productComparison.length > 0) {
        const icon = (m: string) => m === 'yes' ? 'Yes' : m === 'partial' ? 'Partial' : m === 'no' ? 'No' : '-';
        offered += '\n\n#### Spec Comparison -- Required vs Offered\n\n' +
          '| Parameter | Required | Your Product | Match |\n|---|---|---|---|\n' +
          productComparison.map(c => `| ${esc(c.parameter)} | ${esc(c.required)} | ${esc(c.offered)} | ${icon(c.match)} |`).join('\n');
        if (productVerdict) offered += `\n\n**Verdict:** ${productVerdict}`;
      }
      await axios.post('/api/bids', {
        title: saveForm.title.trim() || analysis.fileName.replace(/\.pdf$/i, ''),
        gemOrderId: saveForm.gemOrderId.trim() || null,
        fileName: analysis.fileName,
        filePath: analysis.filePath,
        uploadedBy: saveForm.assignedTo || state.currentUser?.fullName || state.currentUser?.username || 'System',
        extractedSummary: analysis.summary,
        parameters: analysis.parameters,
        offeredProduct: offered || null,
        categoryCode: saveForm.categoryCode || null,
        buyerTerms: analysis.buyerTerms || null,
        bidStatus: null
      });
      toast.success('Bid saved successfully!');
      setShowSaveModal(false);
      setAnalysis(null);
      setOverviewHtml(''); setDetailHtml('');
      setBidId('');
      setActiveTab('saved');
    } catch {
      toast.error('Failed to save bid');
    } finally {
      setSaving(false);
    }
  }

  function updateParameter(index: number, newValue: string) {
    setAnalysis(prev => {
      if (!prev) return prev;
      const params = [...prev.parameters];
      params[index] = { ...params[index], value: newValue };
      return { ...prev, parameters: params };
    });
  }

  async function handleSaveAsTemplate() {
    if (!analysis) return;
    if (!templateForm.templateId && !templateForm.newName.trim()) {
      toast.error('Select an existing template or enter a new template name');
      return;
    }
    setSavingTemplate(true);
    try {
      if (templateForm.templateId) {
        const fd = new FormData();
        fd.append('content', analysis.summary);
        const res = await axios.put(`/api/templates/${templateForm.templateId}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        dispatch({ type: 'UPDATE_TEMPLATE', payload: res.data });
        toast.success('Template content updated from bid analysis!');
      } else {
        const fd = new FormData();
        fd.append('name',      templateForm.newName.trim());
        fd.append('firmId',    templateForm.firmId || '');
        fd.append('content',   analysis.summary);
        fd.append('createdBy', state.currentUser?.fullName || 'System');
        const res = await axios.post('/api/templates', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        dispatch({ type: 'ADD_TEMPLATE', payload: res.data });
        toast.success('New template created from bid analysis!');
      }
      setShowTemplateModal(false);
      setTemplateForm({ templateId: '', newName: '', firmId: '' });
    } catch {
      toast.error('Failed to save to template');
    } finally {
      setSavingTemplate(false);
    }
  }

  const ready = bidId.trim() && !bidIdDuplicate;

  return (
    <div className="space-y-4">

      {/* ── Top Header Bar ── */}
      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className={`px-5 py-3.5 flex items-center justify-between gap-4 ${darkMode ? 'bg-gradient-to-r from-violet-900/30 to-blue-900/20' : 'bg-gradient-to-r from-violet-50 to-blue-50'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-purple-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className={`font-bold text-base ${textPrimary}`}>AI Bid Analyser</h2>
              <p className={`text-xs ${textSecondary}`}>
                {analysis
                  ? <span className="flex items-center gap-1.5">
                      <Hash size={10} />
                      <span className="font-mono font-bold text-violet-500">{bidId}</span>
                      <span className="opacity-60">·</span>
                      <span>{analysis.fileName}</span>
                    </span>
                  : 'Analyse GEM / tender bids using AI in seconds'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {analysis && !uploading && (
              <>
                <button
                  onClick={() => setPdfPreview({ url: pdfUrl(analysis.filePath), name: analysis.fileName })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    darkMode ? 'border-red-700/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-600 hover:bg-red-50'
                  }`}>
                  <FileText size={12} /> View PDF
                </button>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    copied
                      ? 'border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                      : darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={openSaveModal}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-500/25">
                  <BookmarkPlus size={12} /> Save Bid
                </button>
              </>
            )}
            {(uploading || analysis) && (
              <button
                onClick={() => { setAnalysis(null); setOverviewHtml(''); setDetailHtml(''); setBidId(''); }}
                disabled={uploading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  uploading ? 'opacity-40 cursor-not-allowed border-gray-300 text-gray-400' : darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <X size={12} /> New Bid
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {uploading ? (

        /* Loading State */
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className={`h-1.5 w-full bg-gradient-to-r from-violet-500 via-blue-500 to-violet-500 animate-pulse`} style={{ backgroundSize: '200% 100%' }} />
          <div className="py-20 flex flex-col items-center justify-center text-center px-8">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                <Loader2 size={36} className="text-violet-500 animate-spin" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-violet-500 to-blue-600 rounded-full flex items-center justify-center">
                <Sparkles size={10} className="text-white" />
              </div>
            </div>
            <h3 className={`font-bold text-xl mb-2 ${textPrimary}`}>Analysing with AI...</h3>
            <p className={`text-sm max-w-sm leading-relaxed ${textSecondary}`}>
              Extracting bid parameters, terms & conditions, and generating a detailed structured report. This may take 30–60 seconds.
            </p>
            <div className={`mt-6 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${darkMode ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600'}`}>
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping" />
              Processing: {bidId}
            </div>
          </div>
        </div>

      ) : analysis ? (

        /* Analysis Result */
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>

          {/* Success banner */}
          <div className={`px-6 py-3 flex items-center gap-3 border-b ${darkMode ? 'bg-emerald-900/20 border-emerald-800/40' : 'bg-emerald-50 border-emerald-100'}`}>
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={13} className="text-white" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`text-sm font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Analysis Complete</span>
              <span className={`text-xs ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>·</span>
              <span className={`text-xs font-mono truncate ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{bidId}</span>
              <span className={`text-xs truncate ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>· {analysis.fileName}</span>
            </div>
          </div>

          {/* Parameters Table */}
          {analysis.parameters && analysis.parameters.length > 0 && (
            <div className="px-6 pt-5 pb-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                    <Bot size={14} className="text-blue-500" />
                  </div>
                  <h3 className={`font-bold text-base ${textPrimary}`}>Extracted Parameters</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                    {analysis.parameters.length} fields
                  </span>
                </div>
                {canEditBidParams && (
                  <button
                    onClick={() => setEditingParams(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      editingParams
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                        : darkMode ? 'border border-gray-600 text-gray-300 hover:bg-gray-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {editingParams ? <><CheckCheck size={12} /> Done Editing</> : <><Pencil size={12} /> Edit</>}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: darkMode ? '#374151' : '#e5e7eb' }}>
                <table className="text-sm text-left w-full border-collapse">
                  <thead>
                    <tr className={darkMode ? 'bg-gray-700/60' : 'bg-gray-50'}>
                      {analysis.parameters.map((p, i) => (
                        <th key={i} className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide border-b border-r last:border-r-0 min-w-[180px] max-w-[260px] ${darkMode ? 'text-gray-300 border-gray-600' : 'text-gray-500 border-gray-200'}`}>
                          {p.name}
                        </th>
                      ))}
                      <th className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide border-b w-32 ${darkMode ? 'text-gray-300 border-gray-600' : 'text-gray-500 border-gray-200'}`}>
                        Summary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {analysis.parameters.map((p, i) => (
                        <td key={i} className={`px-4 py-3 border-r last:border-r-0 min-w-[180px] max-w-[260px] align-top ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          {editingParams ? (
                            <textarea
                              value={p.value || ''}
                              onChange={e => updateParameter(i, e.target.value)}
                              rows={4}
                              className={`w-full text-xs leading-relaxed resize-y rounded-lg px-2.5 py-2 outline-none border transition ${
                                darkMode
                                  ? 'bg-gray-700 border-gray-600 text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30'
                                  : 'bg-white border-gray-200 text-gray-900 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20'
                              }`}
                              placeholder="Enter value..."
                            />
                          ) : (
                            <div className={`text-xs leading-relaxed break-words whitespace-pre-wrap h-[100px] overflow-y-auto pr-1 ${textSecondary}`}>
                              {p.value || <span className="italic opacity-40">—</span>}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-center align-top ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        {(overviewHtml || detailHtml) && (
                          <button
                            onClick={() => setShowDetail(v => !v)}
                            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                              showDetail
                                ? darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                                : 'bg-gradient-to-r from-blue-500 to-violet-600 text-white shadow-md shadow-blue-500/25'
                            }`}
                          >
                            {showDetail ? 'Hide' : 'View Summary'}
                          </button>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!showDetail && (
            <div className={`mx-6 my-3 px-4 py-2.5 rounded-xl flex items-center gap-2 ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
              <FileText size={14} className="text-blue-500 flex-shrink-0" />
              <span className={`text-xs font-medium ${textSecondary}`}>{analysis.fileName}</span>
            </div>
          )}

          {showDetail && (overviewHtml || detailHtml) && (
            <div className={`border-t mx-0 px-8 py-6 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              {overviewHtml && <div className="bid-markdown mb-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(overviewHtml) }} />}
              {detailHtml && <div className="bid-markdown" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detailHtml) }} />}
            </div>
          )}

          {/* Bottom action bar */}
          <div className={`px-6 py-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${darkMode ? 'border-gray-700 bg-gray-900/30' : 'border-gray-100 bg-gray-50/80'}`}>
            <p className={`text-xs ${textSecondary}`}>
              {showDetail ? 'Reviewed the details? Save the bid when ready.' : 'Overview above — click View Summary for full breakdown.'}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { setTemplateForm({ templateId: '', newName: '', firmId: '' }); setShowTemplateModal(true); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                  darkMode ? 'border-indigo-700/60 text-indigo-400 hover:bg-indigo-900/20' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                <FileCode2 size={13} /> Template
              </button>
              <button
                onClick={openSaveModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20"
              >
                <BookmarkPlus size={13} /> Save Bid
              </button>
            </div>
          </div>
        </div>

      ) : (

        /* Input State — Bid ID + Upload */
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>

          {/* Step Progress Bar */}
          <div className={`border-b px-8 py-4 flex items-center justify-center gap-0 ${darkMode ? 'border-gray-700 bg-gray-900/30' : 'border-gray-100 bg-gray-50/60'}`}>
            {/* Step 1 */}
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm transition-all ${
                ready
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-emerald-500/30'
                  : 'bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-blue-500/30'
              }`}>
                {ready ? <Check size={14} /> : '1'}
              </div>
              <div>
                <p className={`text-xs font-bold leading-none ${ready ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : textPrimary}`}>Bid ID</p>
                {ready && <p className="text-[10px] font-mono text-emerald-500 mt-0.5 leading-none truncate max-w-[140px]">{bidId}</p>}
              </div>
            </div>

            {/* Connector */}
            <div className="mx-4 flex items-center gap-1">
              {[0,1,2,3,4].map(i => (
                <div key={i} className={`w-2 h-0.5 rounded-full transition-all ${ready ? 'bg-emerald-400' : (darkMode ? 'bg-gray-700' : 'bg-gray-200')}`} />
              ))}
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                ready
                  ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/30'
                  : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}>
                2
              </div>
              <p className={`text-xs font-bold ${ready ? (darkMode ? 'text-violet-400' : 'text-violet-600') : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
                Upload PDF
              </p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-2" style={{ minHeight: 340 }}>

            {/* LEFT — Bid ID input */}
            <div className={`p-8 flex flex-col gap-5 border-r ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>

              {/* Icon + title */}
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                  bidIdDuplicate
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : ready
                      ? 'bg-gradient-to-br from-emerald-400/20 to-teal-500/20'
                      : 'bg-gradient-to-br from-blue-500/15 to-violet-600/15'
                }`}>
                  {bidIdDuplicate
                    ? <X size={22} className="text-red-500" />
                    : ready
                      ? <Check size={22} className="text-emerald-500" />
                      : <Hash size={22} className="text-blue-500" />
                  }
                </div>
                <div>
                  <h3 className={`font-bold text-base ${bidIdDuplicate ? 'text-red-500' : textPrimary}`}>
                    {bidIdDuplicate ? 'Already Saved!' : ready ? 'Bid ID Confirmed ✓' : 'GEM / Bid Order ID'}
                  </h3>
                  <p className={`text-xs mt-0.5 ${bidIdDuplicate ? 'text-red-400' : textSecondary}`}>
                    {bidIdDuplicate ? 'Check Saved Bids tab' : ready ? 'Now upload the PDF →' : 'Step 1 of 2'}
                  </p>
                </div>
              </div>

              {/* Description */}
              <p className={`text-sm leading-relaxed ${textSecondary}`}>
                {ready
                  ? 'Bid ID locked in. Upload the tender PDF on the right — AI will extract all parameters automatically.'
                  : 'Enter the GEM Order number or any unique Bid ID. A duplicate check runs before analysis.'}
              </p>

              {/* Input field */}
              <div className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all ${
                bidIdDuplicate
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
                  : ready
                    ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/10'
                    : darkMode
                      ? 'border-gray-600 bg-gray-700/50 focus-within:border-violet-500'
                      : 'border-gray-200 bg-gray-50 focus-within:border-violet-400 focus-within:bg-white'
              }`}
                style={{ boxShadow: ready && !bidIdDuplicate ? '0 0 0 3px rgba(16,185,129,0.1)' : 'none' }}
              >
                <Hash size={16} className={`flex-shrink-0 ${
                  bidIdDuplicate ? 'text-red-400' : ready ? 'text-emerald-500' : (darkMode ? 'text-gray-500' : 'text-gray-400')
                }`} />
                <input
                  type="text"
                  value={bidId}
                  onChange={e => { setBidId(e.target.value); setBidIdDuplicate(false); }}
                  onBlur={e => checkBidIdDuplicate(e.target.value)}
                  placeholder="GEM/2026/B/7402383"
                  autoFocus
                  className={`flex-1 bg-transparent border-none outline-none text-sm font-mono font-semibold tracking-wide min-w-0 ${
                    bidIdDuplicate ? 'text-red-500' : ready ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-white' : 'text-gray-900')
                  }`}
                  style={{ letterSpacing: '0.04em' }}
                />
                {bidId && (
                  <button onClick={() => { setBidId(''); setBidIdDuplicate(false); }}
                    className={`flex-shrink-0 p-1 rounded-lg transition ${darkMode ? 'hover:bg-gray-600 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Duplicate error */}
              {bidIdDuplicate && (
                <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs font-medium ${darkMode ? 'bg-red-900/20 border border-red-800/40 text-red-400' : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  <X size={13} className="flex-shrink-0 mt-0.5" />
                  This Bid ID is already analysed & saved. Go to the <strong>Saved Bids</strong> tab to view it.
                </div>
              )}

              {/* Tip when empty */}
              {!bidId.trim() && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${darkMode ? 'bg-blue-900/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <Sparkles size={11} className="flex-shrink-0" />
                  Duplicate check and AI analysis run automatically after upload
                </div>
              )}
            </div>

            {/* RIGHT — PDF Upload */}
            <div
              className="p-8 flex flex-col items-center justify-center relative"
              style={{
                opacity: ready ? 1 : 0.45,
                pointerEvents: ready ? 'auto' : 'none',
                transition: 'opacity 0.35s ease',
                background: dragOver
                  ? (darkMode ? 'rgba(124,58,237,0.06)' : 'rgba(124,58,237,0.025)')
                  : ready
                    ? (darkMode ? 'rgba(124,58,237,0.04)' : 'rgba(124,58,237,0.015)')
                    : 'transparent',
              }}
            >
              <div
                onDragOver={e => { e.preventDefault(); if (ready) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => ready && fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center text-center"
                style={{
                  border: `2px dashed ${
                    dragOver ? '#7c3aed'
                      : ready ? (darkMode ? '#5b21b6' : '#c4b5fd')
                      : (darkMode ? '#374151' : '#e5e7eb')
                  }`,
                  borderRadius: 20,
                  padding: '36px 24px',
                  cursor: ready ? 'pointer' : 'default',
                  transition: 'all 0.25s ease',
                  minHeight: 240,
                  background: dragOver ? (darkMode ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.04)') : 'transparent',
                }}
              >
                {uploading ? (
                  <div className="flex flex-col items-center justify-center w-full max-w-[240px]">
                    <div style={{
                      width: 68, height: 68, borderRadius: 20, marginBottom: 24,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: darkMode ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.15)',
                      boxShadow: '0 0 30px rgba(59,130,246,0.3)',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    }}>
                      <UploadCloud size={28} color="#3b82f6" />
                    </div>
                    
                    <div style={{ width: '100%', backgroundColor: darkMode ? '#374151' : '#e5e7eb', borderRadius: 9999, height: 10, marginBottom: 12, overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          backgroundColor: '#2563eb', 
                          height: '100%', 
                          borderRadius: 9999, 
                          transition: 'width 0.3s ease-out',
                          width: `${uploadProgress}%`,
                          position: 'relative'
                        }}
                      >
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.2)', width: '100%' }} />
                      </div>
                    </div>
                    
                    <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 4px', color: darkMode ? '#ffffff' : '#111827' }}>
                      {uploadProgress < 30 ? 'Reading PDF document...' 
                       : uploadProgress < 60 ? 'Extracting text parameters...' 
                       : uploadProgress < 90 ? 'Analyzing with AI Model...' 
                       : 'Finalizing insights...'}
                    </p>
                    <p style={{ fontSize: 12, color: textSecondary, margin: 0 }}>
                      {Math.round(uploadProgress)}% Complete
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{
                      width: 68, height: 68, borderRadius: 20, marginBottom: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: dragOver
                        ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                        : ready
                          ? 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(79,70,229,0.15))'
                          : (darkMode ? '#1f2937' : '#f3f4f6'),
                      boxShadow: dragOver ? '0 8px 24px rgba(124,58,237,0.35)' : ready ? '0 4px 16px rgba(124,58,237,0.15)' : 'none',
                      transition: 'all 0.25s',
                    }}>
                      <UploadCloud size={30} color={
                        dragOver ? '#fff' : ready ? (darkMode ? '#a78bfa' : '#7c3aed') : (darkMode ? '#4b5563' : '#d1d5db')
                      } />
                    </div>

                    <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 6px', color: darkMode ? '#f9fafb' : '#111827' }}>
                      {dragOver ? 'Drop to Analyse!' : 'Tender / Bid PDF'}
                    </p>
                    <p style={{ fontSize: 13, color: darkMode ? '#9ca3af' : '#6b7280', margin: '0 0 22px', lineHeight: 1.5 }}>
                      {ready ? 'Drag & drop here, or click the button below' : 'Enter Bid ID first to unlock'}
                    </p>

                    {/* Upload button */}
                    <button
                      onClick={e => { e.stopPropagation(); ready && fileInputRef.current?.click(); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '11px 28px', borderRadius: 12, border: 'none',
                        cursor: ready ? 'pointer' : 'default',
                        fontSize: 13, fontWeight: 700,
                        background: ready
                          ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)'
                          : (darkMode ? '#374151' : '#e5e7eb'),
                        color: ready ? '#fff' : (darkMode ? '#6b7280' : '#9ca3af'),
                        boxShadow: ready ? '0 6px 20px rgba(124,58,237,0.35)' : 'none',
                        transition: 'all 0.25s',
                        letterSpacing: '0.01em',
                      }}
                    >
                      <UploadCloud size={15} />
                      {dragOver ? 'Release to Analyse' : 'Choose PDF File'}
                    </button>

                    <p style={{ fontSize: 11, color: darkMode ? '#4b5563' : '#d1d5db', marginTop: 16 }}>
                      PDF only · Max 50 MB · Powered by OpenAI
                    </p>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !saving && setShowSaveModal(false)}
          />
          <div className={`relative rounded-2xl border shadow-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <BookmarkPlus size={20} className="text-emerald-600" />
              </div>
              <div>
                <h3 className={`font-bold text-base ${textPrimary}`}>Save Bid</h3>
                <p className={`text-xs ${textSecondary}`}>Saved bids appear in the Saved Bids tab</p>
              </div>
              <button onClick={() => setShowSaveModal(false)}
                className={`ml-auto p-1.5 rounded-lg ${darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl border text-sm ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <h4 className={`font-semibold mb-2 flex items-center gap-1.5 ${textPrimary}`}>
                  <Sparkles size={14} className="text-blue-500" />
                  Required Products / Categories
                </h4>
                {(() => {
                  const categoryParam = analysis?.parameters?.find(p => p.name.toLowerCase() === 'category');
                  const items: { name: string; qty: string; specs: string }[] = [];
                  let maxIndex = 0;

                  analysis?.parameters?.forEach(p => {
                    const match = p.name.match(/Item (?:Name|Quantity|Specification|Specifications) (\d+)/i);
                    if (match) {
                      const num = parseInt(match[1], 10);
                      if (num > maxIndex) maxIndex = num;
                    }
                  });

                  for (let i = 1; i <= maxIndex; i++) {
                    const name = analysis?.parameters?.find(p => p.name.match(new RegExp(`Item Name ${i}$`, 'i')))?.value || '';
                    const qty = analysis?.parameters?.find(p => p.name.match(new RegExp(`Item Quantity ${i}$`, 'i')))?.value || '';
                    const specs = analysis?.parameters?.find(p => p.name.match(new RegExp(`Item Specification[s]? ${i}$`, 'i')))?.value || '';
                    if (name || qty || specs) items.push({ name, qty, specs });
                  }

                  if (items.length === 0 && !categoryParam?.value) {
                    return <p className={`text-xs ${textSecondary}`}>No product details extracted.</p>;
                  }

                  return (
                    <div className="space-y-3">
                      {categoryParam?.value && (
                        <div className={`text-xs pb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-150'}`}>
                          <span className={`font-semibold ${textPrimary}`}>Category:</span>{' '}
                          <span className={textSecondary}>{categoryParam.value}</span>
                        </div>
                      )}
                      <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                        {items.map((item, idx) => (
                          <div key={idx} className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                            darkMode ? 'bg-gray-800/85 border-gray-700' : 'bg-white border-gray-200'
                          }`}>
                            <div className="flex justify-between items-start gap-2">
                              <span className={`font-semibold ${textPrimary}`}>#{idx + 1} {item.name || 'Unnamed Item'}</span>
                              {item.qty && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-semibold text-[10px] whitespace-nowrap">
                                  Qty: {item.qty}
                                </span>
                              )}
                            </div>
                            {item.specs && (
                              <div className={`mt-1.5 pt-1.5 border-t border-dashed ${darkMode ? 'border-gray-700' : 'border-gray-150'}`}>
                                <span className={`font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'} block mb-0.5`}>Specs:</span>
                                <span className={`whitespace-pre-wrap ${textSecondary}`}>{item.specs}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-indigo-900/10 border-indigo-800/50' : 'bg-indigo-50/50 border-indigo-200'}`}>
                <label className={`block text-xs font-bold mb-2 flex items-center gap-1.5 ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  <Bot size={14} /> Your Offered Product
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchProductDetails()}
                    placeholder="Product name + model — e.g. HP LaserJet M126nw"
                    className={inputClass}
                  />
                  <button
                    onClick={fetchProductDetails}
                    disabled={fetchingProduct}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      fetchingProduct ? 'bg-indigo-400 cursor-not-allowed text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow'
                    }`}
                  >
                    {fetchingProduct ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {fetchingProduct ? 'Fetching...' : 'Fetch via AI'}
                  </button>
                </div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Product Details {saveForm.offeredProduct && <span className="text-emerald-500">— editable</span>}
                </label>
                <textarea
                  value={saveForm.offeredProduct}
                  onChange={e => setSaveForm(p => ({ ...p, offeredProduct: e.target.value }))}
                  placeholder="Fetch details via AI or enter manually — Make, Model, Specifications..."
                  className={`${inputClass} min-h-[100px] max-h-[200px] resize-y text-xs font-mono`}
                />

                {productComparison.length > 0 && (() => {
                  let score = 0;
                  productComparison.forEach(c => {
                    if (c.match === 'yes') score += 1;
                    else if (c.match === 'partial') score += 0.5;
                  });
                  const matchScore = Math.round((score / productComparison.length) * 100);
                  return (
                    <div className="mt-4">
                      <div className="mb-4 bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <p className={`text-sm font-bold ${textPrimary}`}>Match Score</p>
                          <span className={`text-lg font-bold ${
                            matchScore >= 80 ? 'text-emerald-500' : matchScore >= 50 ? 'text-amber-500' : 'text-red-500'
                          }`}>{matchScore}%</span>
                        </div>
                        <div className={`w-full h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              matchScore >= 80 ? 'bg-emerald-500' : matchScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${matchScore}%` }}
                          />
                        </div>
                        <p className={`text-xs mt-2 ${textSecondary}`}>
                          {matchScore >= 80 ? 'Excellent match. Highly recommended to apply.' : matchScore >= 50 ? 'Partial match. Review requirements carefully.' : 'Poor match. Product may not meet tender criteria.'}
                        </p>
                      </div>

                      <p className={`text-xs font-bold mb-2 ${textPrimary}`}>Tender Requirement vs Your Product</p>
                      <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="max-h-[220px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} sticky top-0`}>
                            <tr>
                              <th className={`px-3 py-2 text-left font-semibold ${textPrimary}`}>Parameter</th>
                              <th className={`px-3 py-2 text-left font-semibold ${textPrimary}`}>Required</th>
                              <th className={`px-3 py-2 text-left font-semibold ${textPrimary}`}>Your Product</th>
                              <th className={`px-3 py-2 text-center font-semibold ${textPrimary} w-16`}>Match</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                            {productComparison.map((c, i) => (
                              <tr key={i} className={
                                c.match === 'no' ? darkMode ? 'bg-red-900/15' : 'bg-red-50'
                                  : c.match === 'partial' || c.match === 'unknown' ? darkMode ? 'bg-amber-900/10' : 'bg-amber-50' : ''
                              }>
                                <td className={`px-3 py-2 font-medium ${textPrimary} align-top`}>{c.parameter}</td>
                                <td className={`px-3 py-2 ${textSecondary} align-top`}>{c.required}</td>
                                <td className={`px-3 py-2 ${textSecondary} align-top`}>{c.offered}</td>
                                <td className="px-3 py-2 text-center align-top">
                                  {c.match === 'yes' && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 text-[10px] font-bold">Y</span>}
                                  {c.match === 'partial' && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 text-[10px] font-bold">~</span>}
                                  {c.match === 'no' && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 text-[10px] font-bold">N</span>}
                                  {c.match === 'unknown' && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] font-bold">?</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {productVerdict && (
                      <div className={`mt-2 p-3 rounded-lg text-xs font-medium ${
                        productComparison.some(c => c.match === 'no')
                          ? darkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'
                          : darkMode ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {productVerdict}
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>GEM Order ID / Tender Number</label>
                  <input
                    type="text"
                    value={saveForm.gemOrderId}
                    onChange={e => setSaveForm(p => ({ ...p, gemOrderId: e.target.value }))}
                    placeholder="e.g. GEM/2026/B/7402383"
                    className={inputClass}
                  />
                  {saveForm.gemOrderId && <p className="text-xs text-emerald-500 mt-1"> Auto-extracted from analysis</p>}
                </div>
                {canSeeAssignee && (
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                      Assign To <span className={`font-normal ${textSecondary}`}>(optional)</span>
                    </label>
                    <select
                      value={saveForm.assignedTo}
                      onChange={e => setSaveForm(p => ({ ...p, assignedTo: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">— Unassigned —</option>
                      {state.users.filter(u => u.isActive !== false).map(u => (
                        <option key={u.id} value={u.fullName || u.username}>{u.fullName || u.username}</option>
                      ))}
                    </select>
                    {saveForm.assignedTo && <p className="text-xs text-blue-500 mt-1"> Assigned to {saveForm.assignedTo}</p>}
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${textSecondary}`}>
                  <Tag size={12} /> Category
                  {saveForm.categoryCode && <span className="text-emerald-500 font-normal">— auto-selected</span>}
                </label>
                <select
                  value={saveForm.categoryCode}
                  onChange={e => setSaveForm(p => ({ ...p, categoryCode: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">— Select Category —</option>
                  {state.bidCategories.filter(c => c.isActive !== false).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Bid Title</label>
                <input
                  type="text"
                  value={saveForm.title}
                  onChange={e => setSaveForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Enter a descriptive title"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSaveModal(false)} disabled={saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition shadow ${
                  saving ? 'bg-emerald-400 cursor-not-allowed text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? 'Saving...' : 'Save Bid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !savingTemplate && setShowTemplateModal(false)} />
          <div className={`relative rounded-2xl border shadow-2xl w-full max-w-md p-6 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                darkMode ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-100 text-indigo-600'
              }`}>
                <FileCode2 size={20} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${textPrimary}`}>Save as Template</h3>
                <p className={`text-xs ${textSecondary}`}>Bid analysis content to Template</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)}
                className={`ml-auto p-1.5 rounded-lg ${darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {state.templates.length > 0 && (
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Save to existing template</label>
                  <select
                    value={templateForm.templateId}
                    onChange={e => setTemplateForm(p => ({ ...p, templateId: e.target.value, newName: '', firmId: '' }))}
                    className={inputClass}
                  >
                    <option value="">-- Select a template --</option>
                    {state.templates.map(t => {
                      const firm = state.firms.find(f => f.id === t.firmId);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name}{firm ? ` (${firm.name})` : ' (Global)'}
                        </option>
                      );
                    })}
                  </select>
                  {templateForm.templateId && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                      Existing template content will be replaced.
                    </p>
                  )}
                </div>
              )}

              {state.templates.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  <span className={`text-xs ${textSecondary}`}>or create a new template</span>
                  <div className={`flex-1 h-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                </div>
              )}

              {!templateForm.templateId && (
                <>
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>New Template Name</label>
                    <input
                      type="text"
                      value={templateForm.newName}
                      onChange={e => setTemplateForm(p => ({ ...p, newName: e.target.value }))}
                      placeholder="e.g. ABC Enterprises -- Bid Analysis"
                      className={inputClass}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                      Firm <span className="font-normal">(optional)</span>
                    </label>
                    <select value={templateForm.firmId}
                      onChange={e => setTemplateForm(p => ({ ...p, firmId: e.target.value }))}
                      className={inputClass}>
                      <option value="">Global</option>
                      {state.firms.filter(f => !f.isDeleted).map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTemplateModal(false)} disabled={savingTemplate}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Cancel
              </button>
              <button onClick={handleSaveAsTemplate} disabled={savingTemplate}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60">
                {savingTemplate ? <Loader2 size={15} className="animate-spin" /> : <FileCode2 size={15} />}
                {savingTemplate ? 'Saving...' : 'Save to Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
