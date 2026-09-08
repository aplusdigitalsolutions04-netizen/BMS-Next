'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import axios from 'axios';
import { ChevronLeft, Loader2, Check, Share2, Copy, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../../store/AppContext';

interface AdvancedSpreadsheetProps {
  sheetId: string;
  onBack: () => void;
}

export default function AdvancedSpreadsheet({ sheetId, onBack }: AdvancedSpreadsheetProps) {
  const { state } = useApp();
  const { darkMode } = state;

  const [loading, setLoading] = useState(true);
  const [sheetName, setSheetName] = useState('');
  const [initialData, setInitialData] = useState<any[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareMode, setShareMode] = useState<'NONE' | 'VIEW' | 'EDIT'>('NONE');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isUpdatingShare, setIsUpdatingShare] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const isInitialMount = useRef(true);
  // Tracks the most recent unsaved data/name so a refresh/close/navigate-away between
  // an edit and its save request completing can still flush it instead of losing the edit.
  const pendingDataRef = useRef<any[] | null>(null);
  const pendingNameRef = useRef('');
  const hasPendingSaveRef = useRef(false);
  // Every edit fires a save immediately (no debounce -- zero window where an edit exists
  // only in memory). If a save is already in flight, we just remember to run one more
  // right after it finishes, instead of firing overlapping requests.
  const savingInFlightRef = useRef(false);
  const needsAnotherSaveRef = useRef(false);

  // Fetch data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await axios.get(`/api/advanced-sheets/${sheetId}`);
        setSheetName(res.data.name);
        if (res.data.shareMode) setShareMode(res.data.shareMode);
        if (res.data.shareToken) setShareToken(res.data.shareToken);
        const data = typeof res.data.data === 'string' ? JSON.parse(res.data.data) : res.data.data;
        
        const validData = Array.isArray(data) && data.length > 0 ? data : [{
          name: "Sheet1",
          color: "",
          status: 1,
          order: 0,
          celldata: [],
          config: {},
          index: "sheet_01",
        }];
        
        const sanitizedData = validData.map((sheet: any) => ({
          ...sheet,
          id: sheet.id || sheet.index || `sheet_${Math.random().toString(36).substring(2, 9)}`,
          row: sheet.row || 84,
          column: sheet.column || 60,
          defaultRowHeight: 19,
          defaultColWidth: 73,
          scrollTop: 0,
          scrollLeft: 0
        }));
        
        setInitialData(sanitizedData);
        pendingDataRef.current = sanitizedData;
        pendingNameRef.current = res.data.name;
      } catch (err) {
        toast.error('Failed to load workbook');
        onBack();
      } finally {
        setLoading(false);
        // Allow a short delay for FortuneSheet to mount before tracking changes
        setTimeout(() => { isInitialMount.current = false; }, 1000);
      }
    }
    loadData();
  }, [sheetId, onBack]);

  // Flushes whatever is currently pending. Used on refresh/tab-close/navigate-away so an
  // edit that's still in flight (or about to fire) isn't lost. Modern browsers block/ignore
  // synchronous XHR during unload, so this uses `fetch` with `keepalive: true` -- the
  // browser-supported way to let a request finish after the page starts navigating away
  // (same mechanism `navigator.sendBeacon` uses, but supports PUT + JSON).
  const flushPendingSave = useCallback(() => {
    if (!hasPendingSaveRef.current) return;
    hasPendingSaveRef.current = false;
    const token = localStorage.getItem('authToken');
    fetch(`/api/advanced-sheets/${sheetId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data: pendingDataRef.current, name: pendingNameRef.current }),
      keepalive: true,
    }).catch(() => {});
  }, [sheetId]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSave();
    }
    window.addEventListener('beforeunload', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flushPendingSave(); // flush on unmount too (e.g. clicking "back" to the workbook list)
    };
  }, [flushPendingSave]);

  // Fires the actual save request. If one is already running, it just flags that another
  // save is needed right after -- so a change made mid-request is never dropped, and we
  // never have two save requests racing each other for the same sheet.
  const performSave = useCallback(async () => {
    if (savingInFlightRef.current) {
      needsAnotherSaveRef.current = true;
      return;
    }
    savingInFlightRef.current = true;
    setSaveState('saving');
    try {
      await axios.put(`/api/advanced-sheets/${sheetId}`, {
        data: pendingDataRef.current,
        name: pendingNameRef.current,
      });
      hasPendingSaveRef.current = false;
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error('Save blocked: this looks like fewer sheets than already saved. Please refresh the page before continuing, so no data is lost.', { duration: 8000 });
      } else {
        toast.error('Failed to save workbook');
      }
      setSaveState('idle');
    } finally {
      savingInFlightRef.current = false;
      if (needsAnotherSaveRef.current) {
        needsAnotherSaveRef.current = false;
        performSave();
      }
    }
  }, [sheetId]);

  // Reads pendingNameRef instead of the `sheetName` state so this never needs `sheetName`
  // as a dependency -- keeping scheduleSave (and anything built on it) stable across renders.
  // That stability matters: FortuneSheet's onChange prop is rebound whenever its identity
  // changes, and that rebind was itself re-firing onChange -- with saveState re-rendering
  // this component 3x per save (saving -> saved -> idle) and no debounce, an unstable
  // handleSheetChange turned that into an infinite save loop.
  const scheduleSave = useCallback((newData: any[] | null, newName?: string) => {
    if (isInitialMount.current) return; // Prevent saving on initial render

    if (newName !== undefined) pendingNameRef.current = newName;
    if (newData) pendingDataRef.current = newData; // name-only changes pass null -- keep last known data
    hasPendingSaveRef.current = true;

    performSave(); // fire immediately -- no debounce, no window where the edit only lives in memory
  }, [performSave]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setSheetName(newName);
    scheduleSave(null, newName);
  };

  const updateShareMode = async (mode: 'NONE' | 'VIEW' | 'EDIT') => {
    setIsUpdatingShare(true);
    try {
      const res = await axios.put(`/api/advanced-sheets/${sheetId}`, { shareMode: mode });
      setShareMode(mode);
      if (res.data.shareToken) {
        setShareToken(res.data.shareToken);
      }
      toast.success('Sharing settings updated');
    } catch {
      toast.error('Failed to update sharing settings');
    } finally {
      setIsUpdatingShare(false);
    }
  };

  const copyShareLink = () => {
    if (!shareToken) return;
    const link = `${window.location.origin}/share/sheet/${shareToken}`;
    navigator.clipboard.writeText(link);
    toast.success('Share link copied to clipboard!');
  };

  const sendShareEmail = async () => {
    if (!shareEmail || !shareEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsSendingEmail(true);
    try {
      await axios.post(`/api/advanced-sheets/${sheetId}/share-email`, { email: shareEmail });
      toast.success('Email sent successfully!');
      setShareEmail('');
    } catch {
      toast.error('Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Stable identity (only depends on scheduleSave, which is itself stable) so FortuneSheet
  // never sees this prop change and never has a reason to rebind/re-fire onChange.
  const handleSheetChange = useCallback((data: any[]) => {
    // FortuneSheet's onChange provides the sheets, but it DELETES the 1D 'celldata' array 
    // and only maintains the 2D 'data' matrix in memory. 
    // However, when initializing, FortuneSheet completely ignores 'data' and ONLY reads 'celldata'!
    // We must rebuild 'celldata' from 'data' before saving to the database, or it will load as blank.
    const dataToSave = data.map((sheet) => {
      const newCelldata: any[] = [];
      if (sheet.data && Array.isArray(sheet.data)) {
        for (let r = 0; r < sheet.data.length; r++) {
          if (!sheet.data[r]) continue;
          for (let c = 0; c < sheet.data[r].length; c++) {
            const v = sheet.data[r][c];
            if (v != null) {
              newCelldata.push({ r, c, v });
            }
          }
        }
      }
      return {
        ...sheet,
        celldata: newCelldata.length > 0 ? newCelldata : sheet.celldata,
        data: undefined // Do not save the massive 2D matrix to DB to save space, FortuneSheet will rebuild it on load
      };
    });

    scheduleSave(dataToSave);
  }, [scheduleSave]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[500px]">
        <Loader2 size={32} className="animate-spin text-emerald-500 mb-4" />
        <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Loading workbook...</p>
      </div>
    );
  }

  return (
    // Use absolute positioning within the parent main container to ensure it fills exactly to the bottom.
    // onWheel stops scroll events from bubbling to the outer <main> (which has overflow-y-auto) --
    // otherwise once main's scrollTop shifts even slightly, it starts swallowing scroll-up gestures
    // instead of letting FortuneSheet's own canvas scroll, making "scroll up" appear stuck.
    <div
      className="absolute inset-0 flex flex-col w-full h-full bg-white dark:bg-gray-900"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Top Toolbar */}
      <div className={`flex items-center gap-4 px-4 py-3 border-b shrink-0 z-10 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          title="Back to Dashboard"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col">
          <input
            value={sheetName}
            onChange={handleNameChange}
            className={`font-bold text-lg bg-transparent outline-none ${darkMode ? 'text-white' : 'text-gray-900'}`}
            placeholder="Untitled Workbook"
          />
          <div className={`text-xs flex items-center gap-1.5 mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {saveState === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving...</>}
            {saveState === 'saved' && <><Check size={12} className="text-emerald-500" /> Saved</>}
            {saveState === 'idle' && <span>All changes saved</span>}
          </div>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowShareModal(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              shareMode !== 'NONE'
                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Share2 size={16} />
            {shareMode !== 'NONE' ? 'Shared' : 'Share'}
          </button>
        </div>
      </div>

      {/* Spreadsheet Container */}
      <div className="flex-1 relative w-full h-full">
        <style>{`
          .fortune-add-row { display: none !important; }
        `}</style>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Workbook
            data={initialData}
            onChange={handleSheetChange}
            lang="en"
            currency="₹"
          />
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                <Share2 size={20} />
              </div>
              <div>
                <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>Share Workbook</h3>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Anyone with the link can access</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                shareMode === 'NONE' 
                  ? darkMode ? 'border-blue-500 bg-blue-900/20' : 'border-blue-500 bg-blue-50' 
                  : darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <div>
                  <div className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Off</div>
                  <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Only you can access this workbook</div>
                </div>
                <input type="radio" name="shareMode" checked={shareMode === 'NONE'} onChange={() => updateShareMode('NONE')} className="w-4 h-4 text-blue-600" disabled={isUpdatingShare} />
              </label>

              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                shareMode === 'VIEW' 
                  ? darkMode ? 'border-blue-500 bg-blue-900/20' : 'border-blue-500 bg-blue-50' 
                  : darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <div>
                  <div className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>View Only</div>
                  <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Anyone with link can view but not edit</div>
                </div>
                <input type="radio" name="shareMode" checked={shareMode === 'VIEW'} onChange={() => updateShareMode('VIEW')} className="w-4 h-4 text-blue-600" disabled={isUpdatingShare} />
              </label>

              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                shareMode === 'EDIT' 
                  ? darkMode ? 'border-blue-500 bg-blue-900/20' : 'border-blue-500 bg-blue-50' 
                  : darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <div>
                  <div className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Editable</div>
                  <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Anyone with link can edit the data</div>
                </div>
                <input type="radio" name="shareMode" checked={shareMode === 'EDIT'} onChange={() => updateShareMode('EDIT')} className="w-4 h-4 text-blue-600" disabled={isUpdatingShare} />
              </label>
            </div>

            {shareMode !== 'NONE' && shareToken && (
              <div className="space-y-4 mb-6">
                <div className={`p-3 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <LinkIcon size={16} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                  <div className={`text-xs truncate flex-1 font-mono ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {`${window.location.origin}/share/sheet/${shareToken}`}
                  </div>
                  <button
                    onClick={copyShareLink}
                    className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white text-gray-700 shadow-sm'}`}
                    title="Copy Link"
                  >
                    <Copy size={14} />
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Email to a person</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={e => setShareEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendShareEmail()}
                      placeholder="e.g. colleague@company.com"
                      className={`flex-1 px-3 py-2 text-sm rounded-xl border outline-none transition ${
                        darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                      }`}
                    />
                    <button
                      onClick={sendShareEmail}
                      disabled={isSendingEmail || !shareEmail}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-50 flex items-center gap-2 shrink-0"
                    >
                      {isSendingEmail ? <Loader2 size={16} className="animate-spin" /> : null}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowShareModal(false)}
              className={`w-full py-2.5 rounded-xl text-sm font-medium transition ${
                darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
