import type { Firm, FirmDocument } from '../types';

// Helper function to generate firm code
export function generateFirmCode(existingFirms: Firm[]): string {
  const maxNum = existingFirms.reduce((max, f) => {
    const match = f.firmCode.match(/(\d+)$/);
    const num = match ? parseInt(match[1]) : 0;
    return num > max ? num : max;
  }, 0);
  return `FRM-${String(maxNum + 1).padStart(3, '0')}`;
}

export function generateDocNumber(existingDocs: FirmDocument[]): string {
  const year = new Date().getFullYear();
  const maxNum = existingDocs.reduce((max, d) => {
    const parts = d.documentNumber.split('-');
    const num = parseInt(parts[parts.length - 1]);
    return num > max ? num : max;
  }, 0);
  return `DOC-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileIcon(fileType: string): string {
  if (!fileType) return '';
  if (fileType.includes('pdf')) return '';
  if (fileType.includes('word') || fileType.includes('document')) return '';
  if (fileType.includes('sheet') || fileType.includes('excel')) return '';
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return '';
  if (fileType.includes('image') || fileType.includes('jpg') || fileType.includes('png')) return '';
  if (fileType.includes('zip') || fileType.includes('rar')) return '';
  return '';
}
