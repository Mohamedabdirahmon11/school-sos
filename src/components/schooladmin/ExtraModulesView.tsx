/**
 * Comprehensive Extra Modules for School Admin
 * Library Catalogue, Transport Routes, Discipline Logs, Clinic Health Records,
 * Staff Payroll with Payslip PDF, and School Inventory
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { 
  Library, 
  Bus, 
  AlertTriangle, 
  HeartPulse, 
  Wallet, 
  Boxes, 
  Plus, 
  Printer, 
  CheckCircle2, 
  DollarSign, 
  FileText,
  X
} from 'lucide-react';

interface ExtraModulesViewProps {
  initialSubModule?: 'library' | 'transport' | 'discipline' | 'health' | 'payroll' | 'inventory';
}

export const ExtraModulesView: React.FC<ExtraModulesViewProps> = ({ initialSubModule = 'library' }) => {
  const { school, isReadOnly, t } = useAuth();
  const [activeModule, setActiveModule] = useState<'library' | 'transport' | 'discipline' | 'health' | 'payroll' | 'inventory'>(initialSubModule);
  
  // Library State
  const [books, setBooks] = useState<any[]>([]);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookIsbn, setBookIsbn] = useState('');
  const [bookCopies, setBookCopies] = useState(5);

  // Transport State
  const [routes, setRoutes] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [busAssignments, setBusAssignments] = useState<any[]>([]);
  const [assignmentStudentId, setAssignmentStudentId] = useState('');
  const [assignmentRouteId, setAssignmentRouteId] = useState('');
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [routeFee, setRouteFee] = useState(25);

  // Discipline State
  const [disciplineLogs, setDisciplineLogs] = useState<any[]>([]);

  // Health State
  const [healthLogs] = useState<any[]>([]);

  // Payroll State
  const [payrollLogs, setPayrollLogs] = useState<any[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  // Inventory State
  const [inventory, setInventory] = useState<any[]>([]);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    ApiClient.getLibraryBooks(school.id).then(setBooks).catch(console.error);
    ApiClient.getTransportRoutes(school.id).then(setRoutes).catch(console.error);
    ApiClient.getAllStudents(undefined, undefined).then(setStudents).catch(console.error);
    ApiClient.getBusAssignments().then(setBusAssignments).catch(console.error);
  }, [school]);

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle || !bookAuthor) return;
    try {
      const b = await ApiClient.addLibraryBook({
        title: bookTitle,
        author: bookAuthor,
        isbn: bookIsbn.trim(),
        totalCopies: bookCopies,
        availableCopies: bookCopies,
        shelfLocation: 'Section B'
      }, school?.id);
      setBooks(prev => [...prev, b]);
      setShowAddBookModal(false);
      setBookTitle('');
      setBookAuthor('');
      setNotice('Book added to library catalogue.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeName || !driverName) return;
    try {
      const r = await ApiClient.addTransportRoute({
        name: routeName,
        routeNumber: vehicleNumber,
        vehicleNumber,
        driverName,
        driverPhone,
        feeAmount: routeFee,
        active: true,
        stops: []
      }, school?.id);
      setRoutes(prev => [...prev, r]);
      setShowAddRouteModal(false);
      setRouteName('');
      setDriverName('');
      setNotice('Transport route added.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssignBus = async () => {
    if (!assignmentStudentId || !assignmentRouteId) return;
    try {
      const assignment = await ApiClient.setBusAssignment(assignmentStudentId, assignmentRouteId);
      setBusAssignments(current => [...current.filter(item => item.studentId !== assignment.studentId), assignment]);
      setNotice('Student assigned to the bus route. The configured route fee will be used for bus charges.');
    } catch (err: any) {
      setNotice(err.message || 'Bus assignment failed.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Campus Extension Modules
          </h1>
          <p className="text-xs text-[#64748B]">
            Library, Transport, Discipline, Clinic, Staff Payroll, and Assets
          </p>
        </div>

        {/* Module Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg text-xs overflow-x-auto self-start sm:self-auto">
          {[
            { id: 'library', label: 'Library' },
            { id: 'transport', label: 'Transport' },
            { id: 'discipline', label: 'Discipline' },
            { id: 'health', label: 'Clinic/Health' },
            { id: 'payroll', label: 'Staff Payroll' },
            { id: 'inventory', label: 'Inventory' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id as any)}
              className={`px-3 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                activeModule === m.id
                  ? 'bg-white text-[#132A29] shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#132A29]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 1. LIBRARY MODULE */}
      {activeModule === 'library' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Library className="w-4 h-4 text-[#0F766E]" />
              <span>Library Catalogue & Lending Register</span>
            </h2>
            <button
              onClick={() => setShowAddBookModal(true)}
              disabled={isReadOnly}
              className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Book</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Author</th>
                  <th className="px-4 py-2.5">ISBN</th>
                  <th className="px-4 py-2.5">Copies</th>
                  <th className="px-4 py-2.5">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {books.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[#64748B]">No books catalogued yet.</td>
                  </tr>
                ) : (
                  books.map(b => (
                    <tr key={b.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-semibold text-[#132A29]">{b.title}</td>
                      <td className="px-4 py-2.5 text-[#475569]">{b.author}</td>
                      <td className="px-4 py-2.5 font-mono text-[#64748B]">{b.isbn}</td>
                      <td className="px-4 py-2.5 font-mono">{b.availableCopies} / {b.totalCopies}</td>
                      <td className="px-4 py-2.5 text-[#64748B]">{b.shelfLocation}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. TRANSPORT MODULE */}
      {activeModule === 'transport' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Bus className="w-4 h-4 text-[#0F766E]" />
              <span>School Transport Routes & Fleet</span>
            </h2>
            <button
              onClick={() => setShowAddRouteModal(true)}
              disabled={isReadOnly}
              className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Route</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Route Name</th>
                  <th className="px-4 py-2.5">Vehicle Plate</th>
                  <th className="px-4 py-2.5">Driver Name</th>
                  <th className="px-4 py-2.5">Driver Phone</th>
                  <th className="px-4 py-2.5">Monthly Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[#64748B]">No transport routes added yet.</td>
                  </tr>
                ) : (
                  routes.map(r => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-semibold text-[#132A29]">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono">{r.vehicleNumber}</td>
                      <td className="px-4 py-2.5 text-[#334155]">{r.driverName}</td>
                      <td className="px-4 py-2.5 font-mono text-[#64748B]">{r.driverPhone}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-emerald-700">{formatMoney(r.feeAmount, school?.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <section className="border-t border-[#E2E8F0] pt-4 space-y-3">
            <h3 className="text-xs font-bold text-[#132A29]">Bus students</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={assignmentStudentId} onChange={e => setAssignmentStudentId(e.target.value)} className="flex-1 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg">
                <option value="">Select student</option>
                {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} · {student.studentId}</option>)}
              </select>
              <select value={assignmentRouteId} onChange={e => setAssignmentRouteId(e.target.value)} className="flex-1 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg">
                <option value="">Select route</option>
                {routes.filter(route => route.active !== false).map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
              </select>
              <button type="button" onClick={handleAssignBus} disabled={isReadOnly || !assignmentStudentId || !assignmentRouteId} className="px-3 py-2 text-xs bg-[#0F766E] text-white rounded-lg disabled:opacity-50">Assign</button>
            </div>
            {busAssignments.map(item => {
              const student = students.find(row => row.id === item.studentId);
              const route = routes.find(row => row.id === item.routeId);
              return <div key={item.id} className="flex items-center justify-between gap-3 text-xs border border-[#E2E8F0] rounded-lg p-3">
                <span>{student ? `${student.firstName} ${student.lastName}` : item.studentId} · {route?.name || item.routeId}</span>
                <span className="font-mono">{formatMoney(item.feeAmount, school?.currency)}</span>
                <button type="button" disabled={isReadOnly} onClick={async () => { await ApiClient.removeBusAssignment(item.studentId); setBusAssignments(current => current.filter(row => row.id !== item.id)); }} className="text-rose-700 disabled:opacity-40">Remove</button>
              </div>;
            })}
          </section>
        </div>
      )}

      {/* 3. DISCIPLINE MODULE */}
      {activeModule === 'discipline' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Discipline & Behaviour Incidents</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Infraction</th>
                  <th className="px-4 py-2.5">Severity</th>
                  <th className="px-4 py-2.5">Action Taken</th>
                  <th className="px-4 py-2.5">Parent Notified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {disciplineLogs.map(d => (
                  <tr key={d.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-mono text-[#64748B]">{d.incidentDate}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{d.studentName}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{d.infractionType}</td>
                    <td className="px-4 py-2.5 capitalize font-medium text-amber-700">{d.severity}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{d.actionTaken}</td>
                    <td className="px-4 py-2.5 text-emerald-700 font-medium">{d.parentNotified ? 'Yes (SMS)' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. HEALTH / CLINIC MODULE */}
      {activeModule === 'health' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-rose-600" />
            <span>School Clinic & Health Visits</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Reported Symptoms</th>
                  <th className="px-4 py-2.5">Treatment Given</th>
                  <th className="px-4 py-2.5">Attending Nurse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {healthLogs.length ? healthLogs.map(h => (
                  <tr key={h.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-mono text-[#64748B]">{h.visitDate}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{h.studentName}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{h.symptoms}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{h.treatment}</td>
                    <td className="px-4 py-2.5 text-[#0F766E] font-medium">{h.nurseName}</td>
                  </tr>
                )) : (
                  <tr><td className="px-4 py-6 text-center text-[#64748B]" colSpan={5}>No health visits have been recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PAYROLL MODULE & PAYSLIP PDF */}
      {activeModule === 'payroll' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#0F766E]" />
              <span>Staff Monthly Payroll & Payslips</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Faculty Member</th>
                  <th className="px-4 py-2.5">Pay Month</th>
                  <th className="px-4 py-2.5">Base Salary</th>
                  <th className="px-4 py-2.5">Allowances</th>
                  <th className="px-4 py-2.5">Net Salary</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {payrollLogs.map(p => (
                  <tr key={p.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{p.teacherName}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{p.month}</td>
                    <td className="px-4 py-2.5 font-mono">${p.baseSalary}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-700">+${p.allowances}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#132A29]">${p.netSalary}</td>
                    <td className="px-4 py-2.5 text-emerald-700 font-bold uppercase">{p.paymentStatus}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setSelectedPayslip(p)}
                        className="px-2.5 py-1 text-xs font-medium text-[#0F766E] bg-[#F0FDFA] hover:bg-[#CCFBF1] rounded border border-[#CCFBF1] transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Payslip</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. INVENTORY MODULE */}
      {activeModule === 'inventory' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Boxes className="w-4 h-4 text-[#0F766E]" />
            <span>School Assets & Equipment Register</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Asset Tag</th>
                  <th className="px-4 py-2.5">Item Description</th>
                  <th className="px-4 py-2.5">Quantity</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Condition</th>
                  <th className="px-4 py-2.5">Estimated Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {inventory.map(i => (
                  <tr key={i.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#0F766E]">{i.assetTag}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{i.itemName}</td>
                    <td className="px-4 py-2.5 font-mono">{i.quantity}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{i.roomLocation}</td>
                    <td className="px-4 py-2.5 capitalize text-emerald-700 font-medium">{i.condition}</td>
                    <td className="px-4 py-2.5 font-mono font-bold">${i.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OFFICIAL PAYSLIP MODAL */}
      {selectedPayslip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4 no-print">
              <h2 className="text-base font-bold text-[#132A29]">Official Staff Payslip</h2>
              <button onClick={() => setSelectedPayslip(null)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white border border-[#CBD5E1] rounded space-y-3 font-mono">
              <div className="text-center pb-2 border-b border-[#E2E8F0]">
                <h3 className="font-bold text-sm text-[#132A29]">{school?.name}</h3>
                <p className="text-[10px] text-[#64748B]">Staff Salary Disbursal Slip · {selectedPayslip.month}</p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Employee:</span>
                  <span className="font-bold">{selectedPayslip.teacherName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Base Monthly Salary:</span>
                  <span>${selectedPayslip.baseSalary}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Teaching Allowances:</span>
                  <span className="text-emerald-700">+${selectedPayslip.allowances}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#E2E8F0] font-bold text-sm">
                  <span>Net Salary Disbursed:</span>
                  <span>${selectedPayslip.netSalary}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center no-print">
              <span className="text-[10px] text-[#64748B]">Finance Office Approved</span>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded font-medium flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Payslip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD BOOK MODAL */}
      {showAddBookModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <h2 className="text-base font-bold text-[#132A29] mb-4">Add Library Book</h2>
            <form onSubmit={handleAddBook} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium">Book Title</label>
                <input
                  type="text"
                  required
                  value={bookTitle}
                  onChange={e => setBookTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium">Author</label>
                <input
                  type="text"
                  required
                  value={bookAuthor}
                  onChange={e => setBookAuthor(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium">Number of Copies</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={bookCopies}
                  onChange={e => setBookCopies(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBookModal(false)}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] text-white rounded-lg font-semibold"
                >
                  Add Book
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ROUTE MODAL */}
      {showAddRouteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <h2 className="text-base font-bold text-[#132A29] mb-4">Add Transport Bus Route</h2>
            <form onSubmit={handleAddRoute} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium">Route Name</label>
                <input
                  type="text"
                  required
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  placeholder="e.g. Hodan - KM4 Express"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Driver Name</label>
                  <input
                    type="text"
                    required
                    value={driverName}
                    onChange={e => setDriverName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium">Monthly Bus Fee ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min="5"
                    required
                    value={routeFee}
                    onChange={e => setRouteFee(parseFloat(e.target.value) || 20)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRouteModal(false)}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] text-white rounded-lg font-semibold"
                >
                  Save Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
