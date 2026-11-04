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
  CheckCircle2, 
  DollarSign, 
  FileText,
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
  const [showDisciplineForm, setShowDisciplineForm] = useState(false);
  const [disciplineStudentId, setDisciplineStudentId] = useState('');
  const [disciplineDate, setDisciplineDate] = useState('');
  const [disciplineInfraction, setDisciplineInfraction] = useState('');
  const [disciplineDescription, setDisciplineDescription] = useState('');
  const [disciplineSeverity, setDisciplineSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor');
  const [disciplineAction, setDisciplineAction] = useState('');
  const [disciplineParentNotified, setDisciplineParentNotified] = useState(false);
  const [disciplineBusy, setDisciplineBusy] = useState(false);

  // Clinic records are fetched only for school administrators by the protected API.
  const [healthLogs, setHealthLogs] = useState<any[]>([]);
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [healthStudentId, setHealthStudentId] = useState('');
  const [healthVisitDate, setHealthVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [healthSymptoms, setHealthSymptoms] = useState('');
  const [healthTreatment, setHealthTreatment] = useState('');
  const [healthAllergies, setHealthAllergies] = useState('');
  const [healthPrivateNotes, setHealthPrivateNotes] = useState('');
  const [healthBusy, setHealthBusy] = useState(false);


  // Inventory State
  const [inventory, setInventory] = useState<any[]>([]);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [inventoryAssetTag, setInventoryAssetTag] = useState('');
  const [inventoryItemName, setInventoryItemName] = useState('');
  const [inventoryQuantity, setInventoryQuantity] = useState('1');
  const [inventoryLocation, setInventoryLocation] = useState('');
  const [inventoryCondition, setInventoryCondition] = useState<'good' | 'fair' | 'poor' | 'damaged'>('good');
  const [inventoryValue, setInventoryValue] = useState('0');
  const [inventoryBusy, setInventoryBusy] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    ApiClient.getLibraryBooks(school.id).then(setBooks).catch(error => {
      console.error(error);
      setNotice('Library catalogue could not be loaded. Check your school access and database connection.');
    });
    ApiClient.getTransportRoutes(school.id).then(setRoutes).catch(error => {
      console.error(error);
      setNotice('Transport routes could not be loaded. Check your school access and database connection.');
    });
    ApiClient.getAllStudents().then(setStudents).catch(console.error);
    ApiClient.getBusAssignments().then(setBusAssignments).catch(error => {
      console.error(error);
      setNotice('Bus assignments could not be loaded. Check your transport management access.');
    });
    ApiClient.getHealthRecords().then(setHealthLogs).catch(error => {
      console.error(error);
      setNotice('Clinic records could not be loaded. Only school administrators can access health information.');
    });
    ApiClient.getDisciplineRecords().then(setDisciplineLogs).catch(error => {
      console.error(error);
      setNotice('Discipline records could not be loaded. Check your school administrator access.');
    });
    ApiClient.getInventoryItems().then(setInventory).catch(error => {
      console.error(error);
      setNotice('Inventory could not be loaded. Check your school administrator access.');
    });
  }, [school]);

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle || !bookAuthor) return;
    try {
      const b = await ApiClient.addLibraryBook({
        title: bookTitle,
        author: bookAuthor,
        isbn: bookIsbn.trim(),
        quantity: bookCopies
      }, school?.id);
      setBooks(prev => [...prev, b]);
      setShowAddBookModal(false);
      setBookTitle('');
      setBookAuthor('');
      setBookIsbn('');
      setBookCopies(5);
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
      setVehicleNumber('');
      setDriverName('');
      setDriverPhone('');
      setRouteFee(25);
      setNotice('Transport route added.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddDisciplineRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disciplineBusy) return;
    if (!disciplineStudentId || !disciplineDate || !disciplineInfraction.trim()) {
      setNotice('Choose a student, incident date and infraction type.');
      return;
    }
    setDisciplineBusy(true);
    try {
      const created = await ApiClient.addDisciplineRecord({
        studentId: disciplineStudentId,
        incidentDate: disciplineDate,
        infractionType: disciplineInfraction.trim(),
        description: disciplineDescription.trim(),
        severity: disciplineSeverity,
        actionTaken: disciplineAction.trim(),
        parentNotified: disciplineParentNotified
      });
      setDisciplineLogs(current => [created, ...current]);
      setShowDisciplineForm(false);
      setDisciplineStudentId('');
      setDisciplineDate('');
      setDisciplineInfraction('');
      setDisciplineDescription('');
      setDisciplineSeverity('minor');
      setDisciplineAction('');
      setDisciplineParentNotified(false);
      setNotice('Discipline incident saved securely for this school.');
    } catch (error: any) {
      setNotice(error?.message || 'Discipline incident could not be saved.');
    } finally {
      setDisciplineBusy(false);
    }
  };

  const handleDeleteDisciplineRecord = async (recordId: string) => {
    try {
      const result = await ApiClient.deleteDisciplineRecord(recordId);
      if (result.success) {
        setDisciplineLogs(current => current.filter(record => record.id !== recordId));
        setNotice('Discipline record deleted.');
      } else {
        setNotice('Discipline record was not found.');
      }
    } catch (error: any) {
      setNotice(error?.message || 'Discipline record could not be deleted.');
    }
  };

  const handleAddHealthRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (healthBusy) return;
    if (!healthStudentId || !healthVisitDate || !healthSymptoms.trim()) {
      setNotice('Choose a student, visit date and reported symptoms.');
      return;
    }
    setHealthBusy(true);
    try {
      const created = await ApiClient.addHealthRecord({
        studentId: healthStudentId,
        visitDate: healthVisitDate,
        symptoms: healthSymptoms.trim(),
        treatment: healthTreatment.trim(),
        allergies: healthAllergies.trim(),
        privateNotes: healthPrivateNotes.trim()
      });
      setHealthLogs(current => [created, ...current].slice(0, 200));
      setShowHealthForm(false);
      setHealthStudentId('');
      setHealthVisitDate(new Date().toISOString().slice(0, 10));
      setHealthSymptoms('');
      setHealthTreatment('');
      setHealthAllergies('');
      setHealthPrivateNotes('');
      setNotice('Clinic visit saved securely for this school.');
    } catch (error: any) {
      setNotice(error?.message || 'Clinic visit could not be saved.');
    } finally {
      setHealthBusy(false);
    }
  };

  const handleDeleteHealthRecord = async (recordId: string) => {
    try {
      const result = await ApiClient.deleteHealthRecord(recordId);
      if (result.success) {
        setHealthLogs(current => current.filter(record => record.id !== recordId));
        setNotice('Clinic record deleted.');
      } else {
        setNotice('Clinic record was not found.');
      }
    } catch (error: any) {
      setNotice(error?.message || 'Clinic record could not be deleted.');
    }
  };

  const handleAddInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inventoryBusy) return;
    const quantity = Number(inventoryQuantity);
    const value = Number(inventoryValue);
    if (!inventoryAssetTag.trim() || !inventoryItemName.trim() ||
        !Number.isSafeInteger(quantity) || quantity < 0 ||
        !Number.isFinite(value) || value < 0) {
      setNotice('Enter a valid asset tag, item name, quantity and value.');
      return;
    }
    setInventoryBusy(true);
    try {
      const created = await ApiClient.addInventoryItem({
        assetTag: inventoryAssetTag.trim(),
        itemName: inventoryItemName.trim(),
        quantity,
        roomLocation: inventoryLocation.trim(),
        condition: inventoryCondition,
        value
      });
      setInventory(current => [...current, created]);
      setShowInventoryForm(false);
      setInventoryAssetTag('');
      setInventoryItemName('');
      setInventoryQuantity('1');
      setInventoryLocation('');
      setInventoryCondition('good');
      setInventoryValue('0');
      setNotice('Inventory item saved.');
    } catch (error: any) {
      setNotice(error?.message || 'Inventory item could not be saved.');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleDeleteInventoryItem = async (itemId: string) => {
    try {
      const result = await ApiClient.deleteInventoryItem(itemId);
      if (result.success) {
        setInventory(current => current.filter(item => item.id !== itemId));
        setNotice('Inventory item deleted.');
      } else {
        setNotice('Inventory item was not found.');
      }
    } catch (error: any) {
      setNotice(error?.message || 'Inventory item could not be deleted.');
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
              <span>Library Catalogue</span>
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
                  <th className="px-4 py-2.5">Copies in stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {books.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-[#64748B]">No books catalogued yet.</td>
                  </tr>
                ) : (
                  books.map(b => (
                    <tr key={b.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-semibold text-[#132A29]">{b.title}</td>
                      <td className="px-4 py-2.5 text-[#475569]">{b.author}</td>
                      <td className="px-4 py-2.5 font-mono text-[#64748B]">{b.isbn}</td>
                      <td className="px-4 py-2.5 font-mono">{b.quantity}</td>
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
                <button type="button" disabled={isReadOnly} onClick={async () => {
                  try {
                    const result = await ApiClient.removeBusAssignment(item.studentId);
                    if (result.success) {
                      setBusAssignments(current => current.filter(row => row.id !== item.id));
                      setNotice('Bus assignment removed.');
                    } else {
                      setNotice('Bus assignment was not found.');
                    }
                  } catch (error: any) {
                    setNotice(error?.message || 'Bus assignment could not be removed.');
                  }
                }} className="text-rose-700 disabled:opacity-40">Remove</button>
              </div>;
            })}
          </section>
        </div>
      )}

      {/* 3. DISCIPLINE MODULE */}
      {activeModule === 'discipline' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Discipline & Behaviour Incidents</span>
            </h2>
            {!isReadOnly && (
              <button type="button" onClick={() => setShowDisciplineForm(value => !value)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white">
                <Plus className="h-4 w-4" /> Add incident
              </button>
            )}
          </div>
          {showDisciplineForm && !isReadOnly && (
            <form onSubmit={handleAddDisciplineRecord} className="grid grid-cols-1 gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-[#475569]">Student
                <select required value={disciplineStudentId} onChange={e => setDisciplineStudentId(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm">
                  <option value="">Choose student</option>
                  {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} — {student.studentId}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Incident date
                <input required type="date" value={disciplineDate} onChange={e => setDisciplineDate(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Infraction type
                <input required maxLength={120} value={disciplineInfraction} onChange={e => setDisciplineInfraction(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Severity
                <select value={disciplineSeverity} onChange={e => setDisciplineSeverity(e.target.value as typeof disciplineSeverity)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm">
                  <option value="minor">Minor</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569] sm:col-span-2">Description
                <textarea maxLength={2000} rows={2} value={disciplineDescription} onChange={e => setDisciplineDescription(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569] sm:col-span-2">Action taken
                <textarea maxLength={1000} rows={2} value={disciplineAction} onChange={e => setDisciplineAction(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-[#475569] sm:col-span-2">
                <input type="checkbox" checked={disciplineParentNotified} onChange={e => setDisciplineParentNotified(e.target.checked)} />
                Parent has been notified (manual confirmation)
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <button disabled={disciplineBusy} type="submit" className="rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {disciplineBusy ? 'Saving…' : 'Save incident'}
                </button>
                <button type="button" onClick={() => setShowDisciplineForm(false)} className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-semibold text-[#475569]">Cancel</button>
              </div>
            </form>
          )}
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
                  {!isReadOnly && <th className="px-4 py-2.5">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {disciplineLogs.map(d => (
                  <tr key={d.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-mono text-[#64748B]">{d.incidentDate}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{d.studentName}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{d.infractionType}</td>
                    <td className="px-4 py-2.5 capitalize font-medium text-amber-700">{d.severity}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{d.actionTaken || '—'}</td>
                    <td className="px-4 py-2.5 text-emerald-700 font-medium">{d.parentNotified ? 'Yes' : 'No'}</td>
                    {!isReadOnly && <td className="px-4 py-2.5">
                      <button type="button" onClick={() => handleDeleteDisciplineRecord(d.id)} className="rounded px-2 py-1 text-red-600 hover:bg-red-50">Delete</button>
                    </td>}
                  </tr>
                ))}
                {disciplineLogs.length === 0 && (
                  <tr><td colSpan={isReadOnly ? 6 : 7} className="px-4 py-8 text-center text-[#64748B]">No discipline incidents have been recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. HEALTH / CLINIC MODULE */}
      {activeModule === 'health' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-600" />
              <span>School Clinic & Health Visits</span>
            </h2>
            {!isReadOnly && (
              <button type="button" onClick={() => setShowHealthForm(value => !value)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white">
                <Plus className="h-4 w-4" /> Add clinic visit
              </button>
            )}
          </div>
          <p className="text-xs text-[#64748B]">Confidential student health information. Access is restricted to this school's administrators.</p>
          {showHealthForm && !isReadOnly && (
            <form onSubmit={handleAddHealthRecord} className="grid grid-cols-1 gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-[#475569]">Student
                <select required value={healthStudentId} onChange={e => setHealthStudentId(e.target.value)} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2">
                  <option value="">Select student</option>
                  {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} ({student.studentId})</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Visit date
                <input required type="date" value={healthVisitDate} onChange={e => setHealthVisitDate(e.target.value)} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569] sm:col-span-2">Reported symptoms
                <textarea required maxLength={2000} value={healthSymptoms} onChange={e => setHealthSymptoms(e.target.value)} rows={2} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Treatment given
                <textarea maxLength={2000} value={healthTreatment} onChange={e => setHealthTreatment(e.target.value)} rows={2} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Allergy information
                <textarea maxLength={1000} value={healthAllergies} onChange={e => setHealthAllergies(e.target.value)} rows={2} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569] sm:col-span-2">Private clinical notes
                <textarea maxLength={3000} value={healthPrivateNotes} onChange={e => setHealthPrivateNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2" />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setShowHealthForm(false)} className="rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs">Cancel</button>
                <button type="submit" disabled={healthBusy} className="rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{healthBusy ? 'Saving...' : 'Save confidential record'}</button>
              </div>
            </form>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Reported Symptoms</th>
                  <th className="px-4 py-2.5">Treatment Given</th>
                  <th className="px-4 py-2.5">Recorded by</th>
                  {!isReadOnly && <th className="px-4 py-2.5 text-right">Action</th>}
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
                    {!isReadOnly && <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => handleDeleteHealthRecord(h.id)} className="rounded px-2 py-1 text-red-600 hover:bg-red-50">Delete</button></td>}
                  </tr>
                )) : (
                  <tr><td className="px-4 py-6 text-center text-[#64748B]" colSpan={isReadOnly ? 5 : 6}>No clinic visits have been recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PAYROLL MODULE & PAYSLIP PDF */}
      {activeModule === 'payroll' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#0F766E]" />
            <span>Staff Monthly Payroll</span>
          </h2>
          <p className="text-sm text-[#475569]">Payroll creation, approval and payment are restricted to the Accountant role. Open the Accountant dashboard to manage payroll records and issue staff payslips.</p>
        </div>
      )}

      {/* 6. INVENTORY MODULE */}
      {activeModule === 'inventory' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#0F766E]" />
              <span>School Assets & Equipment Register</span>
            </h2>
            {!isReadOnly && (
              <button type="button" onClick={() => setShowInventoryForm(value => !value)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white">
                <Plus className="h-4 w-4" /> Add asset
              </button>
            )}
          </div>

          {showInventoryForm && !isReadOnly && (
            <form onSubmit={handleAddInventoryItem} className="grid grid-cols-1 gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-[#475569]">Asset tag
                <input required maxLength={80} value={inventoryAssetTag} onChange={e => setInventoryAssetTag(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Item description
                <input required maxLength={255} value={inventoryItemName} onChange={e => setInventoryItemName(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Quantity
                <input required type="number" min="0" max="1000000" step="1" value={inventoryQuantity} onChange={e => setInventoryQuantity(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Room / location
                <input maxLength={150} value={inventoryLocation} onChange={e => setInventoryLocation(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Condition
                <select value={inventoryCondition} onChange={e => setInventoryCondition(e.target.value as typeof inventoryCondition)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm">
                  <option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="damaged">Damaged</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[#475569]">Estimated value
                <input required type="number" min="0" max="1000000000" step="0.01" value={inventoryValue} onChange={e => setInventoryValue(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm" />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <button disabled={inventoryBusy} type="submit" className="rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {inventoryBusy ? 'Saving…' : 'Save asset'}
                </button>
                <button type="button" onClick={() => setShowInventoryForm(false)} className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-semibold text-[#475569]">Cancel</button>
              </div>
            </form>
          )}

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
                  {!isReadOnly && <th className="px-4 py-2.5">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {inventory.map(i => (
                  <tr key={i.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#0F766E]">{i.assetTag}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#132A29]">{i.itemName}</td>
                    <td className="px-4 py-2.5 font-mono">{i.quantity}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{i.roomLocation || '—'}</td>
                    <td className="px-4 py-2.5 capitalize text-emerald-700 font-medium">{i.condition}</td>
                    <td className="px-4 py-2.5 font-mono font-bold">{formatMoney(Number(i.value || 0), school?.currency || 'ETB')}</td>
                    {!isReadOnly && <td className="px-4 py-2.5">
                      <button type="button" onClick={() => handleDeleteInventoryItem(i.id)} className="rounded px-2 py-1 text-red-600 hover:bg-red-50">Delete</button>
                    </td>}
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr><td colSpan={isReadOnly ? 6 : 7} className="px-4 py-8 text-center text-[#64748B]">No inventory assets have been recorded yet.</td></tr>
                )}
              </tbody>
            </table>
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
                <label className="block font-medium">ISBN (optional)</label>
                <input
                  type="text"
                  maxLength={50}
                  value={bookIsbn}
                  onChange={e => setBookIsbn(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium">Number of Copies</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
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
