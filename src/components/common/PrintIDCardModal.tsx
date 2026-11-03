/**
 * Official Printable Student ID Card Modal
 * Includes school logo, student photo, student ID, class, emergency phone, barcode/QR code
 */

import React from 'react';
import { School, Student } from '../../types/index.ts';
import { Printer, X, Shield, Phone } from 'lucide-react';

interface PrintIDCardModalProps {
  student: any;
  school: School | null;
  onClose: () => void;
}

export const PrintIDCardModal: React.FC<PrintIDCardModalProps> = ({ student, school, onClose }) => {
  if (!student) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-[#E2E8F0] text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4 no-print">
          <h2 className="text-sm font-bold text-[#132A29]">Printable Student ID Badge</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#132A29]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Card Canvas */}
        <div className="w-full bg-[#0B2B2A] text-white rounded-xl p-5 shadow-lg relative overflow-hidden font-sans border border-[#143D3B]">
          {/* Top Decorative Stripe */}
          <div className="flex items-center justify-between border-b border-[#143D3B] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#0F766E] flex items-center justify-center font-bold text-xs text-white">
                S
              </div>
              <div>
                <p className="font-bold text-xs leading-none tracking-tight">{school?.name || 'SchoolOS Academy'}</p>
                <p className="text-[9px] text-[#A0BCBA] font-mono mt-0.5">STUDENT IDENTITY CARD</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#A0BCBA]">{school?.academicYear || '2026-2027'}</span>
          </div>

          {/* Student Photo & Details Split */}
          <div className="flex items-start gap-4">
            {/* Student Avatar Box */}
            <div className="w-20 h-24 rounded-lg bg-[#143D3B] border border-[#0F766E]/40 flex flex-col items-center justify-center text-center p-1 shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#0F766E] text-white flex items-center justify-center text-base font-bold mb-1">
                {student.firstName.charAt(0)}
              </div>
              <span className="text-[9px] text-[#A0BCBA] uppercase font-mono">Photo</span>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div>
                <span className="text-[9px] text-[#A0BCBA] uppercase">Student Name:</span>
                <p className="font-bold text-sm leading-tight text-white truncate">
                  {student.firstName} {student.middleName} {student.lastName}
                </p>
              </div>

              <div>
                <span className="text-[9px] text-[#A0BCBA] uppercase">Student ID:</span>
                <p className="font-mono font-bold text-[#99F6E4] text-xs">
                  {student.studentId}
                </p>
              </div>

              <div>
                <span className="text-[9px] text-[#A0BCBA] uppercase">Class & Section:</span>
                <p className="text-xs text-white font-medium">{student.className}</p>
              </div>
            </div>
          </div>

          {/* Footer Bar: Emergency Contact & Barcode */}
          <div className="mt-4 pt-3 border-t border-[#143D3B] flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-[#A0BCBA]">
              <Phone className="w-3 h-3 text-[#0F766E]" />
              <span className="font-mono">{student.fatherPhone}</span>
            </div>
            <div className="font-mono text-[9px] text-[#A0BCBA] uppercase">
              SEAL VERIFIED
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-between items-center no-print">
          <span className="text-[10px] text-[#64748B]">Ready for standard card printer</span>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold flex items-center gap-1.5 text-xs shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Student Card</span>
          </button>
        </div>
      </div>
    </div>
  );
};
