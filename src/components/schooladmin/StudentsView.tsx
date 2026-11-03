/**
 * Student Directory & 360-Degree Profile Module for School Admin
 * Strict compliance with three-part name, NO date of birth, auto-generated STD-<CODE>-XX ID,
 * 6-tab profile (Overview, Attendance, Results, Fees, Documents, Notes), and CSV import/export
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { Student, SchoolClass, SchoolBranch } from '../../types/index.ts';
import { BulkImportWizard } from './BulkImportWizard.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';
import { 
  GraduationCap, 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Trash2, 
  Printer, 
  FileText, 
  CalendarCheck, 
  FileSpreadsheet, 
  CreditCard, 
  MessageSquare, 
  X, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface StudentsViewProps {
  onPrintIDCard?: (student: any) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({ onPrintIDCard }) => {
  const { school, isReadOnly, t } = useAuth();
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [branchFilter, setBranchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [pinSlip, setPinSlip] = useState<{ studentName: string; studentId: string; pin: string } | null>(null);
  const [studentDetails, setStudentDetails] = useState<any | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'overview' | 'attendance' | 'results' | 'fees' | 'documents' | 'notes'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Add Student Form State (NO Date of Birth!)
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [studentPhone, setStudentPhone] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [classId, setClassId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const studentLoad = useApi(async () => Promise.all([
    ApiClient.getSchoolStudents({ search, classId: classFilter, branchId: branchFilter, page, pageSize: 20 }),
    ApiClient.getClasses(), ApiClient.getBranches()
  ]), [school?.id, search, classFilter, branchFilter, page], Boolean(school));
  const [studentRows, classRows, branchRows] = studentLoad.data || [[], [], []];
  const students: any[] = Array.isArray(studentRows) ? studentRows : [];
  const classes: SchoolClass[] = Array.isArray(classRows) ? classRows : [];
  const branches: SchoolBranch[] = Array.isArray(branchRows) ? branchRows : [];
  const isLoading = studentLoad.loading;

  const fetchStudents = studentLoad.retry;
  useEffect(() => { if (classes.length > 0 && !classId) setClassId(classes[0].id); }, [classes, classId]);
  useEffect(() => { setPageInfo((studentRows as any)?.pagination || null); }, [studentRows]);

  const loadStudentDetails = async (student: any) => {
    setSelectedStudent(student);
    try {
      const details = await ApiClient.getStudentDetails(student.id, school?.id, true);
      setStudentDetails(details);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      const newStudent = await ApiClient.addStudent({
        firstName,
        middleName,
        lastName,
        gender,
        admissionDate,
        studentPhone,
        fatherPhone,
        motherPhone,
        classId
      }, school?.id);

      setShowAddModal(false);
      setNotice(`Student ${newStudent.firstName} admitted with ID: ${newStudent.studentId}.`);
      const oneTimePin = (newStudent as any).initialPin as string | undefined;
      if (oneTimePin) setPinSlip({ studentName: `${newStudent.firstName} ${newStudent.lastName}`, studentId: newStudent.studentId, pin: oneTimePin });
      // Reset form
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setStudentPhone('');
      setFatherPhone('');
      setMotherPhone('');
      await fetchStudents();
      loadStudentDetails(newStudent);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Failed to admit student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPin = async () => {
    if (!selectedStudent) return;
    if (!confirm(`Reset the sign-in PIN for ${selectedStudent.firstName} ${selectedStudent.lastName} and linked parent accounts? The new PIN is shown once.`)) return;
    try {
      const result = await ApiClient.resetStudentPin(selectedStudent.id);
      setPinSlip({ studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`, studentId: selectedStudent.studentId, pin: result.newPin });
      setNotice('PIN reset. Print or securely share this one-time PIN slip.');
    } catch (err: any) {
      setModalError(err.message || 'Could not reset PIN.');
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (isReadOnly) {
      alert('School is in read-only mode.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete student "${studentName}"? This action is audited.`)) {
      return;
    }

    try {
      await ApiClient.deleteStudent(studentId, school?.id);
      setNotice(`Student "${studentName}" deleted.`);
      setSelectedStudent(null);
      await fetchStudents();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set('classId', classFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch('/api/students/export?' + params.toString(), { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Student export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = (school?.code || 'school') + '_students_' + new Date().toISOString().split('T')[0] + '.csv';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Student CSV exported with all matching records.');
      window.setTimeout(() => setNotice(null), 4000);
    } catch (error: any) {
      setNotice(error.message || 'Student export failed.');
    }
  };

  if (isLoading) return <div className="p-6 space-y-4" aria-label="Loading students"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-64 animate-pulse rounded-xl bg-white" /></div>;
  if (studentLoad.error) return <ErrorState error={studentLoad.error} onRetry={studentLoad.retry} />;
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Enrolled Students Directory
          </h1>
          <p className="text-xs text-[#64748B]">
            Three-part student records, fee status tracking, and 360-degree academic profiles
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-medium text-[#334155] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            disabled={isReadOnly}
            className="px-3 py-1.5 text-xs font-medium text-[#334155] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>{t('bulk_import')}</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={isReadOnly}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Admit Student</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-[#E2E8F0]">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by student name, ID, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
          <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1); }} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155]">
            <option value="">All Branches</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          {/* Class Filter */}
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155]"
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Students Table */}
        <div className={`bg-white rounded-xl border border-[#E2E8F0] overflow-hidden ${selectedStudent ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Full Three-Part Name</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Parent Phone</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#64748B]">
                      No students enrolled matching criteria. Click "Admit Student" to enroll your first student.
                    </td>
                  </tr>
                ) : (
                  students.map(s => {
                    const isSelected = selectedStudent?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => loadStudentDetails(s)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F0FDFA]' : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-[#0F766E]">{s.studentId}</td>
                        <td className="px-4 py-3 font-semibold text-[#132A29]">
                          {s.firstName} {s.middleName} {s.lastName}
                        </td>
                        <td className="px-4 py-3 text-[#334155]">{s.className}</td>
                        <td className="px-4 py-3 capitalize text-[#64748B]">{s.gender}</td>
                        <td className="px-4 py-3 font-mono text-[#64748B]">{s.fatherPhone}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                            {onPrintIDCard && (
                              <button
                                onClick={() => onPrintIDCard(s)}
                                className="p-1 text-[#0F766E] hover:bg-[#E2E8F0] rounded"
                                title="Print ID Card"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteStudent(s.id, `${s.firstName} ${s.lastName}`)}
                              disabled={isReadOnly}
                              className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
                              title="Delete Student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls info={pageInfo} onPage={setPage} />
        </div>

        {/* 360-DEGREE STUDENT PROFILE (6 TABS) */}
        {selectedStudent && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 lg:col-span-1 shadow-xs">
            <div className="flex items-start justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <span className="text-[10px] font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-0.5 rounded border border-[#CCFBF1]">
                  {selectedStudent.studentId}
                </span>
                <h2 className="text-base font-bold text-[#132A29] mt-1">
                  {selectedStudent.firstName} {selectedStudent.middleName} {selectedStudent.lastName}
                </h2>
                <p className="text-xs text-[#64748B]">{selectedStudent.className}</p>
                <button type="button" onClick={handleResetPin} className="mt-2 text-xs font-semibold text-[#0F766E] hover:underline">Reset PIN</button>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Tabs Navigation */}
            <div className="flex items-center gap-1 border-b border-[#E2E8F0] overflow-x-auto text-xs pb-1">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'attendance', label: 'Attendance' },
                { id: 'results', label: 'Results' },
                { id: 'documents', label: 'Documents' },
                { id: 'notes', label: 'Notes' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveProfileTab(t.id as any)}
                  className={`px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
                    activeProfileTab === t.id
                      ? 'border-b-2 border-[#0F766E] text-[#0F766E] font-semibold'
                      : 'text-[#64748B] hover:text-[#132A29]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Overview */}
            {activeProfileTab === 'overview' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                    <span className="text-[11px] text-[#64748B]">Admission Date</span>
                    <p className="font-mono font-medium text-[#132A29] mt-0.5">{selectedStudent.admissionDate}</p>
                  </div>
                  <div className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                    <span className="text-[11px] text-[#64748B]">Gender</span>
                    <p className="capitalize font-medium text-[#132A29] mt-0.5">{selectedStudent.gender}</p>
                  </div>
                </div>

                <div className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0] space-y-1">
                  <span className="text-[11px] text-[#64748B] font-semibold">Contact Numbers:</span>
                  <p className="text-[#334155]">Father Phone: <strong className="font-mono">{selectedStudent.fatherPhone}</strong></p>
                  <p className="text-[#334155]">Mother Phone: <strong className="font-mono">{selectedStudent.motherPhone}</strong></p>
                  {selectedStudent.studentPhone && (
                    <p className="text-[#334155]">Student Phone: <strong className="font-mono">{selectedStudent.studentPhone}</strong></p>
                  )}
                </div>

                {onPrintIDCard && (
                  <button
                    onClick={() => onPrintIDCard(selectedStudent)}
                    className="w-full py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Official ID Card</span>
                  </button>
                )}
              </div>
            )}

            {/* Tab 2: Attendance */}
            {activeProfileTab === 'attendance' && (
              <div className="space-y-2 text-xs">
                <p className="text-[11px] text-[#64748B]">Attendance History:</p>
                {studentDetails?.attendance?.length === 0 ? (
                  <p className="text-[#64748B] py-4 text-center">No attendance logged yet.</p>
                ) : (
                  studentDetails?.attendance?.slice(-5).map((a: any) => (
                    <div key={a.id} className="p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex items-center justify-between">
                      <span className="font-mono">{a.date}</span>
                      <span className={`font-semibold uppercase text-[11px] ${
                        a.status === 'present' ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {a.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Results */}
            {activeProfileTab === 'results' && (
              <div className="space-y-2 text-xs">
                <p className="text-[11px] text-[#64748B]">Academic Exam Results:</p>
                {studentDetails?.marks?.length === 0 ? (
                  <p className="text-[#64748B] py-4 text-center">No exam marks entered yet.</p>
                ) : (
                  studentDetails?.marks?.map((m: any) => (
                    <div key={m.id} className="p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#132A29]">Total Marks: {m.totalMarks}</p>
                        <p className="text-[10px] text-[#64748B]">Percentage: {Number(m.percentage || 0).toFixed(1)}% · Status: {m.status}</p>
                      </div>
                      <span className="font-bold font-mono text-emerald-700">{Number(m.percentage || 0).toFixed(1)}%</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 4: Fees */}
            {activeProfileTab === 'fees' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-[#F0FDFA] rounded border border-[#CCFBF1] flex justify-between">
                  <span>Current Balance Status:</span>
                  <span className="font-bold uppercase text-[#0F766E]">{selectedStudent.feeStatus}</span>
                </div>
                {studentDetails?.fees?.length === 0 ? (
                  <p className="text-[#64748B] py-4 text-center">No fee payments recorded yet.</p>
                ) : (
                  studentDetails?.fees?.map((f: any) => (
                    <div key={f.id} className="p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0] space-y-0.5">
                      <div className="flex justify-between font-mono">
                        <span className="font-medium text-[#132A29]">{f.receiptNumber}</span>
                        <span className="font-bold text-emerald-700">{formatMoney(f.amountPaid, school?.currency)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-[#64748B]">
                        <span>{f.paymentMethod}</span>
                        <span>{f.date.split('T')[0]}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 5: Documents */}
            {activeProfileTab === 'documents' && (
              <div className="space-y-2 text-xs text-center py-4 text-[#64748B]">
                <FileText className="w-6 h-6 mx-auto mb-1 opacity-60" />
                <p>Birth registry or transfer documents securely stored in compliance with school policy.</p>
              </div>
            )}

            {/* Tab 6: Notes */}
            {activeProfileTab === 'notes' && (
              <div className="space-y-2 text-xs text-center py-4 text-[#64748B]">
                <MessageSquare className="w-6 h-6 mx-auto mb-1 opacity-60" />
                <p>Private faculty notes and behaviour records.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {pinSlip && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="w-full max-w-sm bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xl"><h2 className="text-base font-bold text-[#132A29]">Student and parent PIN slip</h2><p className="mt-3 text-sm">{pinSlip.studentName}</p><p className="text-xs text-[#64748B]">{pinSlip.studentId}</p><p className="mt-4 text-xl font-mono font-bold tracking-widest">{pinSlip.pin}</p><p className="mt-2 text-xs text-[#64748B]">This PIN works for the student and linked parent login. It is shown once. Print or share securely now.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => window.print()} className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold">Print PIN slip</button><button onClick={() => setPinSlip(null)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs">Close</button></div></div></div>}

      {/* ADMISSION FORM MODAL (Three-Part Name, NO Date of Birth) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-[#E2E8F0] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#0F766E]" />
                <span>Admit New Student (Three-Part Name)</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAddStudent} className="space-y-4 text-xs">
              {/* Three-Part Name Fields */}
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-3">
                <span className="font-semibold text-[#132A29] block">Student Three-Part Name</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#334155]">First Name *</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="e.g. Khadar"
                      className="mt-1 w-full px-2.5 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#334155]">Father Name *</label>
                    <input
                      type="text"
                      required
                      value={middleName}
                      onChange={e => setMiddleName(e.target.value)}
                      placeholder="e.g. Abdirahman"
                      className="mt-1 w-full px-2.5 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#334155]">Grandfather *</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="e.g. Warsame"
                      className="mt-1 w-full px-2.5 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Gender and Admission Date (Strictly NO date of birth) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Gender *</label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value as any)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Admission Date *</label>
                  <input
                    type="date"
                    required
                    value={admissionDate}
                    onChange={e => setAdmissionDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Class Assignment */}
              <div>
                <label className="block font-medium text-[#334155]">Class Assignment *</label>
                <select
                  required
                  value={classId}
                  onChange={e => setClassId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.roomNumber})</option>
                  ))}
                </select>
              </div>

              {/* Contact Numbers */}
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-3">
                <span className="font-semibold text-[#132A29] block">Parent & Student Phone Numbers</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#334155]">Father Phone *</label>
                    <input
                      type="tel"
                      required
                      value={fatherPhone}
                      onChange={e => setFatherPhone(e.target.value)}
                      placeholder="+25261..."
                      className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#334155]">Mother Phone *</label>
                    <input
                      type="tel"
                      required
                      value={motherPhone}
                      onChange={e => setMotherPhone(e.target.value)}
                      placeholder="+25261..."
                      className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#334155]">Student Phone (Optional)</label>
                  <input
                    type="tel"
                    value={studentPhone}
                    onChange={e => setStudentPhone(e.target.value)}
                    placeholder="+25261..."
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-[#F0FDFA] rounded border border-[#CCFBF1] text-[11px] text-[#0F766E]">
                Student ID will be auto-generated in sequence as: <code className="font-mono font-bold">STD-{school?.code}-XX</code>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm"
                >
                  {isSubmitting ? 'Enrolling...' : 'Admit Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportWizard open={showBulkImport} onClose={() => setShowBulkImport(false)} onComplete={() => { void fetchStudents(); }} />
    </div>
  );
};
