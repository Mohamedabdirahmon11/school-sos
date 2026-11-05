/**
 * Official Student Yearly Report Cards & Class Bulk Generator
 * Strictly follows rules:
 * 1. Combines Semester 1 + Semester 2 for final yearly percentage and class rank
 * 2. Percentages only (no letter grades, no GPA)
 * 3. Does NOT show attendance
 * 4. Shows school logo, name, student info, subjects (Sem 1 marks/%, Sem 2 marks/%, Yearly %), teacher & admin comments, signatures, and stamp
 * 5. Uses school's configured Report Card Design (template, colors, images, uploaded background)
 * 6. Supports Single Student Print and Bulk Class PDF printing
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { School, SchoolBranch, SchoolClass, ExamConfig, ReportCardDesign } from '../../types/index.ts';
import { adminRemark, formatReportCardMark, initialsFor, teacherRemark } from '../../lib/report-card.ts';
import {
  FileText,
  Printer,
  Search,
  Trophy,
  Layers,
  AlertCircle
} from 'lucide-react';

interface ReportCardMark {
  smallExamMarks: number;
  bigExamMarks: number;
  totalMarks: number;
  percentage: number;
  status?: string;
}

interface ReportCardSubjectResult {
  subject: { id: string; name: string; code?: string };
  sem1Marks?: ReportCardMark | null;
  sem2Marks?: ReportCardMark | null;
  sem1Percentage: number | null;
  sem2Percentage: number | null;
  yearlyPercentage: number | null;
  maxMarks: { small: number; big: number; total: number };
}

interface ReportCardResult {
  student: { id: string; firstName: string; middleName?: string; lastName: string; studentId: string };
  subjectResults: ReportCardSubjectResult[];
  yearlyPercentage: number;
  yearlyRank: number;
  isPass: boolean;
  isTopThree?: boolean;
}

interface ReportCardDocumentProps {
  school: School;
  design: ReportCardDesign;
  className: string;
  result: ReportCardResult;
  totalStudents: number;
}

const ReportCardDocument: React.FC<ReportCardDocumentProps> = ({ school, design, className, result, totalStudents }) => {
  const blocks = design.visibleBlocks || { rank: true, teacherRemarks: true, adminRemarks: true, percentage: true, signatures: true, stamp: true };
  const primaryColor = design.primaryColor || school.brandColor || '#0F766E';
  const secondaryColor = design.secondaryColor || '#0B2B2A';
  const template = design.templateId || 'modern';
  const background = design.ownDesignImageUrl;
  const logoPosition = design.logoPosition || 'center';

  const shellClass = template === 'classic'
    ? 'border-4 border-double rounded-sm font-serif'
    : template === 'minimal'
      ? 'border-0 border-t-4 rounded-none'
      : template === 'executive'
        ? 'border-2 rounded-lg'
        : 'border rounded-xl shadow-sm';
  const headerClass = template === 'executive'
    ? 'text-white'
    : template === 'minimal'
      ? 'pb-4 border-b'
      : 'pb-4 border-b-2';
  const alignmentClass = logoPosition === 'left' ? 'text-left items-start' : logoPosition === 'right' ? 'text-right items-end' : 'text-center items-center';

  return (
    <div
      className={`relative overflow-hidden bg-white ${shellClass}`}
      style={{
        borderColor: template === 'executive' ? secondaryColor : primaryColor,
        borderTopColor: primaryColor,
        backgroundImage: background ? `url("${background.replace(/"/g, '\\"')}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="relative p-6 md:p-8 space-y-5 text-xs" style={{ backgroundColor: background ? 'rgba(255,255,255,0.92)' : undefined }}>
        <div className={`${headerClass} flex flex-col ${alignmentClass}`} style={template === 'executive' ? { backgroundColor: secondaryColor, borderColor: primaryColor, padding: '1.25rem', margin: '-1.5rem -1.5rem 0' } : { borderColor: primaryColor }}>
          <div className={`flex ${logoPosition === 'left' ? 'flex-row' : logoPosition === 'right' ? 'flex-row-reverse' : 'flex-col'} items-center gap-3`}>
            {school.logoUrl ? (
              <img src={school.logoUrl} alt={`${school.name} logo`} className="w-14 h-14 object-contain rounded-lg bg-white/80 p-1" />
            ) : (
              <div className="w-14 h-14 rounded-xl text-white font-bold text-xl flex items-center justify-center shadow-xs" style={{ backgroundColor: primaryColor }}>
                {initialsFor(school.name, school.code)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold uppercase tracking-wide" style={{ color: template === 'executive' ? '#FFFFFF' : secondaryColor }}>
                {school.name || 'School Name'}
              </h2>
              <p className={template === 'executive' ? 'text-xs text-white/80' : 'text-xs text-[#64748B]'}>
                {[school.address, school.city].filter(Boolean).join(', ')} {school.phone ? `• Tel: ${school.phone}` : ''}
              </p>
              <p className="text-xs font-bold mt-1 uppercase tracking-wider" style={{ color: template === 'executive' ? '#FFFFFF' : primaryColor }}>
                {design.titleText || 'Official Academic Achievement Record'}
              </p>
              <p className={template === 'executive' ? 'text-[11px] text-white/80' : 'text-[11px] text-[#64748B]'}>
                Academic Year: {school.academicYear || 'Current'} · {template} template
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border" style={{ backgroundColor: `${primaryColor}0D`, borderColor: `${primaryColor}33` }}>
          <div>
            <p className="text-[11px] text-[#64748B]">Student Full Name</p>
            <p className="font-bold text-[#132A29]">{result.student.firstName} {result.student.middleName} {result.student.lastName}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#64748B]">Student ID</p>
            <p className="font-mono font-bold text-[#132A29]">{result.student.studentId}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#64748B]">Class & Section</p>
            <p className="font-bold text-[#132A29]">{className || 'Class'}</p>
          </div>
          {blocks.rank && (
            <div>
              <p className="text-[11px] text-[#64748B]">Official Class Rank</p>
              <p className="font-mono font-bold" style={{ color: primaryColor }}>#{result.yearlyRank} of {totalStudents}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: `${primaryColor}14`, color: primaryColor }}>
            Exam maximums: Small {result.subjectResults[0]?.maxMarks.small ?? 0} + Big {result.subjectResults[0]?.maxMarks.big ?? 0} = {result.subjectResults[0]?.maxMarks.total ?? 0}
          </span>
          {blocks.percentage && (
            <span className="px-2.5 py-1 rounded-full bg-[#F1F5F9] font-semibold text-[#475569]">Yearly average: {result.yearlyPercentage}%</span>
          )}
          <span className={`px-2.5 py-1 rounded-full font-semibold ${result.isPass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {result.isPass ? 'PASS' : 'BELOW PASS MARK'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs border" style={{ borderColor: '#E2E8F0' }}>
            <thead className="bg-[#F8FAFC] border-b text-[11px] uppercase font-semibold text-[#64748B]">
              <tr>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3 text-center">Semester 1 Marks</th>
                <th className="py-2.5 px-3 text-center">Semester 1 %</th>
                <th className="py-2.5 px-3 text-center">Semester 2 Marks</th>
                <th className="py-2.5 px-3 text-center">Semester 2 %</th>
                <th className="py-2.5 px-3 text-right font-bold">Yearly Result (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {result.subjectResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#64748B]">No examination marks entered yet for this student.</td>
                </tr>
              ) : result.subjectResults.map(row => (
                <tr key={row.subject.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 font-semibold text-[#132A29]">{row.subject.name} {row.subject.code ? `(${row.subject.code})` : ''}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[#475569]">{formatReportCardMark(row.sem1Marks, row.maxMarks)}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[#475569]">{row.sem1Percentage !== null ? `${row.sem1Percentage}%` : '-'}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[#475569]">{formatReportCardMark(row.sem2Marks, row.maxMarks)}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[#475569]">{row.sem2Percentage !== null ? `${row.sem2Percentage}%` : '-'}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold" style={{ color: primaryColor }}>{row.yearlyPercentage !== null ? `${row.yearlyPercentage}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F8FAFC] border-t-2 font-bold" style={{ borderColor: '#CBD5E1' }}>
              <tr>
                <td className="py-2.5 px-3 uppercase text-[11px] text-[#475569]">Combined Yearly Academic Average</td>
                <td colSpan={4} className="py-2.5 px-3 text-right text-[11px] text-[#64748B]">Exam maximums shown per subject</td>
                <td className="py-2.5 px-3 text-right font-mono text-sm" style={{ color: primaryColor }}>{result.yearlyPercentage}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {(blocks.teacherRemarks || blocks.adminRemarks) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {blocks.teacherRemarks && (
              <div className="p-3 border rounded-lg" style={{ borderColor: '#CBD5E1' }}>
                <p className="font-semibold text-[#475569] mb-1">Class Teacher Remarks:</p>
                <p className="italic text-[#334155]">{teacherRemark(result.yearlyPercentage)}</p>
              </div>
            )}
            {blocks.adminRemarks && (
              <div className="p-3 border rounded-lg" style={{ borderColor: '#CBD5E1' }}>
                <p className="font-semibold text-[#475569] mb-1">Principal / Administrator Remarks:</p>
                <p className="italic text-[#334155]">{adminRemark(result.isPass)}</p>
              </div>
            )}
          </div>
        )}

        {(blocks.signatures || blocks.stamp) && (
          <div className="grid grid-cols-3 gap-6 pt-4 text-center text-xs">
            {blocks.signatures && (
              <>
                <div>
                  {design.signatureImageUrl
                    ? <img src={design.signatureImageUrl} alt="Signature" className="h-10 mx-auto object-contain" />
                    : <div className="border-b border-dashed border-[#94A3B8] h-10"></div>}
                  <p className="text-[11px] text-[#64748B] mt-1 font-medium">{design.signatureTitleLeft || 'Class Teacher'}</p>
                </div>
                <div>
                  <div className="border-b border-dashed border-[#94A3B8] h-10"></div>
                  <p className="text-[11px] text-[#64748B] mt-1 font-medium">{design.signatureTitleRight || 'Principal'}</p>
                </div>
              </>
            )}
            {blocks.stamp && (
              <div>
                {design.stampImageUrl
                  ? <img src={design.stampImageUrl} alt="School stamp" className="h-14 mx-auto object-contain" />
                  : <div className="border-b border-dashed border-[#94A3B8] h-10 flex items-center justify-center"><span className="text-[10px] text-[#94A3B8] font-mono">[ OFFICIAL STAMP ]</span></div>}
                <p className="text-[11px] text-[#64748B] mt-1 font-medium">Official School Seal</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ReportCardsView: React.FC = () => {
  const { school, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [branches, setBranches] = useState<SchoolBranch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [yearlyRankings, setYearlyRankings] = useState<ReportCardResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [design, setDesign] = useState<ReportCardDesign | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [isBulkPrintMode, setIsBulkPrintMode] = useState(false);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    setIsLoading(true);
    setError(null);
    Promise.all([
      ApiClient.getClasses(),
      ApiClient.getReportCardDesign(),
      ApiClient.getBranches(),
      ApiClient.getExamConfig()
    ]).then(([cls, dsg, branchList, config]) => {
      setClasses(cls);
      setBranches(branchList);
      setSelectedClassId(current => current || cls[0]?.id || '');
      setDesign(dsg);
      setExamConfig(config);
    }).catch(err => setError(err instanceof Error ? err.message : 'Report cards could not be loaded.')).finally(() => setIsLoading(false));
  }, [school]);

  useEffect(() => {
    if (!selectedClassId) {
      setYearlyRankings([]);
      setSelectedStudentId(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSelectedStudentId(null);
    ApiClient.getYearlyRankings(selectedClassId).then(rankings => {
      setYearlyRankings(rankings);
      setSelectedStudentId(rankings[0]?.student.id || null);
    }).catch(err => setError(err instanceof Error ? err.message : 'Class results could not be loaded.')).finally(() => setIsLoading(false));
  }, [selectedClassId]);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const selectedStudentResult = yearlyRankings.find(r => r.student.id === selectedStudentId);
  const className = selectedClass ? `${selectedClass.name} (${selectedClass.section})` : 'Class';
  const smallMax = examConfig?.smallExamMax ?? 0;
  const bigMax = examConfig?.bigExamMax ?? 0;

  const filteredRankings = yearlyRankings.filter(r =>
    `${r.student.firstName} ${r.student.lastName} ${r.student.studentId}`.toLowerCase().includes(search.toLowerCase())
  );

  const download = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#132A29] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#0F766E]" />
            Official Yearly Report Cards & Transcripts
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Combines Semester 1 &amp; 2 marks with percentages, exam maximums, subject mastery, ranking, signatures, and school stamp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={branchFilter} onChange={async e => {
            const nextBranch = e.target.value;
            setBranchFilter(nextBranch);
            setError(null);
            try {
              const scopedClasses = await ApiClient.getClasses(nextBranch || undefined);
              setClasses(scopedClasses);
              setSelectedClassId(scopedClasses[0]?.id || '');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Classes could not be loaded.');
            }
          }} className="text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white font-medium">
            <option value="">All Branches</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white font-medium"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
            ))}
          </select>
          <button type="button" onClick={() => void download(() => ApiClient.downloadClassReportCardsPdf(selectedClassId))} disabled={!yearlyRankings.length || !selectedClassId} className="px-3 py-2 text-xs font-semibold text-[#0F766E] bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors disabled:opacity-50">Download Class PDF</button>
          <button
            type="button"
            onClick={() => {
              setIsBulkPrintMode(true);
              setTimeout(() => {
                window.print();
                setIsBulkPrintMode(false);
              }, 300);
            }}
            disabled={yearlyRankings.length === 0}
            className="px-3 py-2 text-xs font-semibold text-[#0F766E] bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Layers className="w-3.5 h-3.5" />
            Bulk Class Print ({yearlyRankings.length})
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!selectedStudentResult}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Student Report Card
          </button>
          <button type="button" onClick={() => selectedStudentId && void download(() => ApiClient.downloadReportCardPdf(selectedStudentId))} disabled={!selectedStudentId} className="px-3 py-2 text-xs font-semibold text-[#0F766E] bg-white border border-teal-200 rounded-lg disabled:opacity-50">Download PDF</button>
        </div>
      </div>

      {error && (
        <div className="no-print flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {design && (
        <div className="no-print rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-xs text-[#475569] flex flex-wrap items-center gap-x-5 gap-y-1">
          <span><strong className="text-[#132A29]">Template:</strong> {design.templateId}</span>
          <span className="flex items-center gap-1.5"><strong className="text-[#132A29]">Colors:</strong><i className="inline-block w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: design.primaryColor }} /><i className="inline-block w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: design.secondaryColor }} /></span>
          <span><strong className="text-[#132A29]">Exam maximums:</strong> Small {smallMax} + Big {bigMax} = {smallMax + bigMax}</span>
          <span><strong className="text-[#132A29]">Logo:</strong> {school?.logoUrl ? 'uploaded/configured' : 'school initials'}</span>
          <span><strong className="text-[#132A29]">Background:</strong> {design.ownDesignImageUrl ? 'uploaded design' : 'plain'}</span>
        </div>
      )}

      {!isBulkPrintMode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3 no-print lg:col-span-1 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#132A29] uppercase tracking-wider">Class Student Roster</h2>
              <span className="text-[11px] font-mono font-bold text-[#0F766E]">{yearlyRankings.length} Students</span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search student..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2 py-2">
                {[0, 1, 2].map(index => <div key={index} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : filteredRankings.length === 0 ? (
              <p className="rounded-lg bg-[#F8FAFC] p-4 text-center text-xs text-[#64748B]">
                {yearlyRankings.length === 0 ? 'No students are enrolled in this class yet.' : 'No students match this search.'}
              </p>
            ) : (
              <div className="divide-y divide-[#F1F5F9] max-h-[600px] overflow-y-auto">
                {filteredRankings.map(r => (
                  <div
                    key={r.student.id}
                    onClick={() => setSelectedStudentId(r.student.id)}
                    className={`p-2.5 cursor-pointer rounded-lg transition-colors text-xs flex items-center justify-between ${
                      selectedStudentId === r.student.id ? 'bg-[#F0FDFA] font-semibold text-[#0F766E]' : 'hover:bg-[#F8FAFC] text-[#334155]'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{r.student.firstName} {r.student.lastName}</p>
                      <p className="text-[11px] text-[#64748B] font-mono">{r.student.studentId}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold">{r.yearlyPercentage}%</span>
                      <p className="text-[10px] text-[#64748B] flex items-center justify-end gap-1">
                        {r.isTopThree && <Trophy className="w-3 h-3 text-amber-500" />} Rank #{r.yearlyRank}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="rounded-xl border border-[#CBD5E1] bg-white p-8 space-y-4">
                <div className="h-6 w-1/2 mx-auto rounded bg-slate-100 animate-pulse" />
                <div className="h-24 rounded bg-slate-100 animate-pulse" />
                <div className="h-40 rounded bg-slate-100 animate-pulse" />
              </div>
            ) : selectedStudentResult && design && school ? (
              <ReportCardDocument school={school} design={design} className={className} result={selectedStudentResult} totalStudents={yearlyRankings.length} />
            ) : (
              <div className="bg-white rounded-xl border border-[#CBD5E1] p-12 text-center text-xs text-[#64748B]">
                {yearlyRankings.length === 0 ? 'Select a class with enrolled students to generate report cards.' : 'Select a student from the class roster to generate their official report card.'}
              </div>
            )}
          </div>
        </div>
      )}

      {isBulkPrintMode && design && school && (
        <div className="space-y-12 print-only">
          {yearlyRankings.map(result => (
            <div key={result.student.id} className="page-break-after">
              <ReportCardDocument school={school} design={design} className={className} result={result} totalStudents={yearlyRankings.length} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
