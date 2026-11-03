import React from 'react';

export interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }

export const PaginationControls: React.FC<{ info: PageInfo | null; onPage: (page: number) => void }> = ({ info, onPage }) => {
  if (!info || info.totalPages < 2) return null;
  return <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
    <span className="text-slate-500">{info.total} total · Page {info.page} of {info.totalPages}</span>
    <div className="flex gap-2">
      <button type="button" disabled={info.page <= 1} onClick={() => onPage(info.page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
      <button type="button" disabled={info.page >= info.totalPages} onClick={() => onPage(info.page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
    </div>
  </nav>;
};
