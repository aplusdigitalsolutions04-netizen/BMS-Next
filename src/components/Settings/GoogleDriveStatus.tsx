'use client'

import { useState } from 'react';
import axios from 'axios';
import { HardDrive, CheckCircle2, XCircle, PlugZap, LogIn, UploadCloud, AlertTriangle, Loader2 } from 'lucide-react';
import { useApp } from '../../store/AppContext';

interface StatusResult {
  connected: boolean;
  folderId?: string;
  folderName?: string;
  error?: string;
}

interface MigrateResult {
  referencedInDb?: number;
  foundLocally?: number;
  migrated?: number;
  alreadyMigrated?: number;
  failed?: { filename: string; error: string }[];
  error?: string;
}

export default function GoogleDriveStatus() {
  const { state } = useApp();
  const { darkMode } = state;

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const innerBg = darkMode ? 'bg-gray-900/40 border-gray-700' : 'bg-gray-50 border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-500';

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await axios.get<StatusResult>('/api/google-drive/status');
      setResult(res.data);
    } catch (err: any) {
      setResult({ connected: false, error: err?.response?.data?.error || err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  function handleConnect() {
    window.location.href = '/api/google-drive/authorize';
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await axios.post<MigrateResult>('/api/google-drive/migrate');
      setMigrateResult(res.data);
    } catch (err: any) {
      setMigrateResult({ error: err?.response?.data?.error || err.message || 'Migration failed' });
    } finally {
      setMigrating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white bg-gradient-to-br from-indigo-500 to-purple-600`}>
          <HardDrive size={22} />
        </div>
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary}`}>Google Drive</h2>
          <p className={`text-sm mt-0.5 ${textSecondary}`}>Every uploaded document, contract, and bid PDF is stored on Google Drive instead of this server's disk.</p>
        </div>
      </div>

      {/* Connection status */}
      <div className={`${cardBg} rounded-2xl border p-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wide mb-1 ${textSecondary}`}>Connection Status</h3>
            <p className={`text-sm max-w-xl ${textSecondary}`}>Checks that the authorized Google account is still reachable and the configured Drive folder still exists.</p>
          </div>
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg transition disabled:opacity-50"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {result && (
          <div className={`mt-5 rounded-xl p-4 flex items-start gap-3 ${
            result.connected
              ? darkMode ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-emerald-50 border border-emerald-200'
              : darkMode ? 'bg-red-900/20 border border-red-800/40' : 'bg-red-50 border border-red-200'
          }`}>
            {result.connected
              ? <CheckCircle2 size={20} className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
              : <XCircle size={20} className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />}
            <div>
              <p className={`text-sm font-semibold ${result.connected ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-red-400' : 'text-red-700')}`}>
                {result.connected ? 'Connected' : 'Not connected'}
              </p>
              <p className={`text-sm mt-0.5 ${result.connected ? (darkMode ? 'text-emerald-500' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                {result.connected ? `Uploads are saving to the "${result.folderName}" Drive folder.` : result.error || 'Could not reach Google Drive.'}
              </p>
              {!result.connected && (
                <button
                  onClick={handleConnect}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition"
                >
                  <LogIn size={14} /> Connect Google Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Migrate existing local files */}
      <div className={`${innerBg} rounded-2xl border p-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wide mb-1 ${textSecondary}`}>Migrate Existing Files</h3>
            <p className={`text-sm max-w-xl ${textSecondary}`}>
              Uploads whatever&apos;s still sitting in the server&apos;s local <code className={darkMode ? 'bg-gray-700 px-1 py-0.5 rounded' : 'bg-gray-200 px-1 py-0.5 rounded'}>uploads/</code> folder (from before Drive was connected) into the matching firm-scoped Drive folder. Safe to run more than once.
            </p>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg transition disabled:opacity-50"
          >
            {migrating ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {migrating ? 'Migrating...' : 'Migrate Existing Files'}
          </button>
        </div>

        {migrateResult && (
          <div className={`mt-5 rounded-xl p-4 flex items-start gap-3 ${
            migrateResult.error
              ? darkMode ? 'bg-red-900/20 border border-red-800/40' : 'bg-red-50 border border-red-200'
              : darkMode ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-emerald-50 border border-emerald-200'
          }`}>
            {migrateResult.error
              ? <XCircle size={20} className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
              : <CheckCircle2 size={20} className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />}
            <div className="text-sm">
              {migrateResult.error ? (
                <p className={darkMode ? 'text-red-400 font-medium' : 'text-red-600 font-medium'}>{migrateResult.error}</p>
              ) : (
                <>
                  <p className={`font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Migrated {migrateResult.migrated} file(s){migrateResult.alreadyMigrated ? `, ${migrateResult.alreadyMigrated} already done` : ''}.
                  </p>
                  <p className={`mt-0.5 ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
                    Database references {migrateResult.referencedInDb} filenames in total -- {migrateResult.foundLocally} of those were found in the local uploads/ folder.
                  </p>
                  {migrateResult.failed && migrateResult.failed.length > 0 && (
                    <div className="mt-2 flex items-start gap-2 text-amber-600">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>{migrateResult.failed.length} file(s) failed: {migrateResult.failed.map((f) => f.filename).join(', ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
