'use client'

import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  isDanger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  isDanger = true
}: ConfirmModalProps) {
  const { state } = useApp();
  const { darkMode } = state;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center text-center p-4">
        <div className={`p-4 rounded-full mb-4 ${isDanger ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-500'}`}>
          <AlertTriangle size={32} />
        </div>
        <p className={`text-lg mb-6 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {message}
        </p>
        <div className="flex w-full gap-3">
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl font-medium transition ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {cancelText}
          </button>
          <button
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 rounded-xl font-medium text-white transition ${
              isDanger 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

