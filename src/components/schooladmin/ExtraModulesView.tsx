/**
 * Comprehensive Extra Modules for School Admin
 * Library Catalogue, Transport Routes, Discipline Logs, Clinic Health Records,
 * and School Inventory
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
  Boxes, 
  Plus, 
  CheckCircle2, 
  DollarSign, 
  FileText,
  X
} from 'lucide-react';

interface ExtraModulesViewProps {
  initialSubModule?: 'library' | 'transport' | 'discipline' | 'health' | 'inventory';
}

export const ExtraModulesView: React.FC<ExtraModulesViewProps> = ({ initialSubModule = 'library' }) => {
  const { school, isReadOnly, t } = useAuth();
  const [activeModule, setActiveModule] = useState<'library' | 'transport' | 'discipline' | 'health' | 'inventory'>(initialSubModule);
  
  // Library State
  const [books, setBooks] = useState<any[]>([]);
  const [libraryLoans, setLibraryLoans] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [loanBookId, setLoanBookId] = useState('');
  const [loanStudentId, setLoanStudentId] = useState('');
  const [loanDueDate, setLoanDueDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
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
  const [routeStops, setRouteStops] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [routeFee, setRouteFee] = useState(25);
  const [routeCapacity, setRouteCapacity] = useState(40);

  // Discipline State
  const [disciplineLogs, setDisciplineLogs] = useState<any[]>([]);
  const [disciplineLoading, setDisciplineLoading] = useState(false);
  const [disciplineSaving, setDisciplineSaving] = useState(false);
  const [disciplineError, setDisciplineError] = useState<string | null>(null);
  const [incidentStudentId, setIncidentStudentId] = useState('');
  const [incidentDate, setIncidentDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [infractionType, setInfractionType] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'low' | 'medium' | 'high'>('low');
  const [actionTaken, setActionTaken] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [parentContacted, setParentContacted] = useState(false);

  // Health / clinic state
  const [healthLogs, setHealthLogs] = useState<any[]>([]);
  const [healthStudents, setHealthStudents] = useState<any[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSaving, setHealthSaving] = useState(false);
  const [healthStudentId, setHealthStudentId] = useState('');
  const [healthVisitDate, setHealthVisitDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [healthSymptoms, setHealthSymptoms] = useState('');
  const [healthTreatment, setHealthTreatment] = useState('');
  const [healthNurseName, setHealthNurseName] = useState('');

  // Inventory state
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryName, setInventoryName] = useState('');
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [inventorySku, setInventorySku] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('General');
  const [inventoryUnit, setInventoryUnit] = useState('unit');
  const [inventoryReorderLevel, setInventoryReorderLevel] = useState('0');
  const [inventoryUnitCost, setInventoryUnitCost] = useState('0');
  const [inventoryLocation, setInventoryLocation] = useState('');
  const [inventorySaving, setInventorySaving] = useState(false);
  const [movementItemId, setMovementItemId] = useState('');
  const [movementType, setMovementType] = useState<'stock_in' | 'stock_out' | 'adjustment'>('stock_in');
  const [movementQuantity, setMovementQuantity] = useState('1');
  const [movementUnitCost, setMovementUnitCost] = useState('0');
  const [movementReference, setMovementReference] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [inventoryTransactions, setInventoryTransactions] = useState<any[]>([]);
  const [movementSaving, setMovementSaving] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);

  useEffect(() => {
    if (!school || activeModule !== 'health') return;
    let cancelled = false;
    setHealthLoading(true);
    setModuleError(null);
    Promise.all([ApiClient.getHealthVisits(), ApiClient.getAllStudents()])
      .then(([visits, studentRows]) => {
        if (cancelled) return;
        setHealthStudents(studentRows);
        const byId = new Map(studentRows.map((student: any) => [student.id, student]));
        setHealthLogs(visits.map((visit: any) => {
          const student: any = byId.get(visit.studentId);
          return { ...visit, studentName: student ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') : visit.studentId };
        }));
        setHealthStudentId(current => studentRows.some((student: any) => student.id === current) ? current : studentRows[0]?.id || '');
      })
      .catch((err: any) => { if (!cancelled) setModuleError(err.message || 'Unable to load clinic visits.'); })
      .finally(() => { if (!cancelled) setHealthLoading(false); });
    return () => { cancelled = true; };
  }, [school?.id, activeModule]);

  const handleSaveHealthVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!healthStudentId || !healthSymptoms.trim() || healthSaving || isReadOnly) return;
    setHealthSaving(true);
    setModuleError(null);
    try {
      const visit = await ApiClient.addHealthVisit({
        studentId: healthStudentId, visitDate: healthVisitDate, symptoms: healthSymptoms.trim(),
        treatment: healthTreatment.trim(), nurseName: healthNurseName.trim()
      });
      const student: any = healthStudents.find(item => item.id === healthStudentId);
      setHealthLogs(current => [{
        ...visit, studentName: student ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') : healthStudentId
      }, ...current]);
      setHealthSymptoms('');
      setHealthTreatment('');
      setNotice('Clinic visit saved securely.');
    } catch (err: any) {
      setModuleError(err.message || 'Unable to save clinic visit.');
    } finally {
      setHealthSaving(false);
    }
  };

  useEffect(() => {
    if (!school || activeModule !== 'library') return;
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError(null);
    Promise.all([ApiClient.getLibraryBooks(school.id), ApiClient.getLibraryLoans()])
      .then(([bookRows, loanRows]) => {
        if (cancelled) return;
        setBooks(bookRows);
        setLibraryLoans(loanRows);
        const firstAvailable = bookRows.find(book => loanRows.filter(loan => loan.bookId === book.id && loan.status === 'issued').length < Number(book.quantity || 0));
        setLoanBookId(current => bookRows.some(book => book.id === current &&
          loanRows.filter(loan => loan.bookId === book.id && loan.status === 'issued').length < Number(book.quantity || 0))
          ? current : firstAvailable?.id || '');
      })
      .catch((err: any) => { if (!cancelled) setLibraryError(err.message || 'Unable to load library catalogue and lending records.'); })
      .finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [school?.id, activeModule]);

  useEffect(() => {
    if (!school) return;
    setModuleError(null);
    ApiClient.getTransportRoutes(school.id).then(setRoutes).catch((err: any) => setModuleError(err.message || 'Unable to load transport routes.'));
    ApiClient.getAllStudents(undefined, undefined).then(setStudents).catch((err: any) => setModuleError(err.message || 'Unable to load students for transport.'));
    ApiClient.getBusAssignments().then(setBusAssignments).catch((err: any) => setModuleError(err.message || 'Unable to load bus assignments.'));
  }, [school]);

  useEffect(() => {
    if (!school || activeModule !== 'discipline') return;
    let cancelled = false;
    setDisciplineLoading(true);
    setDisciplineError(null);
    ApiClient.getDisciplineIncidents()
      .then(rows => { if (!cancelled) setDisciplineLogs(rows); })
      .catch((err: any) => { if (!cancelled) setDisciplineError(err.message || 'Unable to load discipline records.'); })
      .finally(() => { if (!cancelled) setDisciplineLoading(false); });
    return () => { cancelled = true; };
  }, [school?.id, activeModule]);

  const handleAddDisciplineIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !incidentStudentId || !infractionType.trim()) return;
    setDisciplineSaving(true);
    setDisciplineError(null);
    try {
      const created = await ApiClient.addDisciplineIncident({
        studentId: incidentStudentId, incidentDate, infractionType: infractionType.trim(),
        severity: incidentSeverity, actionTaken: actionTaken.trim(), notes: incidentNotes.trim() || undefined,
        parentContacted
      });
      setDisciplineLogs(rows => [created, ...rows]);
      setInfractionType(''); setActionTaken(''); setIncidentNotes(''); setParentContacted(false);
      setNotice('Discipline incident saved securely.');
    } catch (err: any) {
      setDisciplineError(err.message || 'Unable to save discipline record.');
    } finally { setDisciplineSaving(false); }
  };

  useEffect(() => {
    if (!school || activeModule !== 'inventory') return;
    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError(null);
    ApiClient.getInventoryItems()
      .then(items => {
        if (cancelled) return;
        setInventory(items);
        setMovementItemId(items[0]?.id || '');
      })
      .catch((err: any) => { if (!cancelled) setInventoryError(err.message || 'Unable to load inventory.'); })
      .finally(() => { if (!cancelled) setInventoryLoading(false); });
    return () => { cancelled = true; };
  }, [school?.id, activeModule]);

  useEffect(() => {
    if (activeModule !== 'inventory' || !movementItemId) { setInventoryTransactions([]); return; }
    let cancelled = false;
    ApiClient.getInventoryTransactions(movementItemId)
      .then(rows => { if (!cancelled) setInventoryTransactions(rows); })
      .catch((err: any) => { if (!cancelled) setInventoryError(err.message || 'Unable to load stock history.'); });
    return () => { cancelled = true; };
  }, [activeModule, movementItemId]);

  const resetInventoryForm = () => {
    setEditingInventoryId(null);
    setInventoryName('');
    setInventorySku('');
    setInventoryCategory('General');
    setInventoryUnit('unit');
    setInventoryReorderLevel('0');
    setInventoryUnitCost('0');
    setInventoryLocation('');
  };

  const handleEditInventoryItem = (item: any) => {
    if (isReadOnly) return;
    setEditingInventoryId(item.id);
    setInventoryName(item.name || '');
    setInventorySku(item.sku || '');
    setInventoryCategory(item.category || 'General');
    setInventoryUnit(item.unit || 'unit');
    setInventoryReorderLevel(String(item.reorderLevel ?? 0));
    setInventoryUnitCost(String(item.unitCost ?? 0));
    setInventoryLocation(item.location || '');
    setInventoryError(null);
  };

  const handleCreateInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !inventoryName.trim()) return;
    const reorderLevel = Number(inventoryReorderLevel);
    const unitCost = Number(inventoryUnitCost);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setInventoryError('Reorder level and unit cost must be valid non-negative numbers.');
      return;
    }
    setInventorySaving(true);
    setInventoryError(null);
    try {
      if (editingInventoryId) {
        const updated = await ApiClient.updateInventoryItem(editingInventoryId, {
          name: inventoryName.trim(), sku: inventorySku.trim() || '',
          category: inventoryCategory.trim() || 'General', unit: inventoryUnit.trim() || 'unit',
          reorderLevel, unitCost, location: inventoryLocation.trim()
        });
        setInventory(items => items.map(item => item.id === updated.id ? updated : item));
        setNotice('Inventory item details updated.');
      } else {
        const created = await ApiClient.createInventoryItem({
          name: inventoryName.trim(), sku: inventorySku.trim() || undefined,
          category: inventoryCategory.trim() || 'General', unit: inventoryUnit.trim() || 'unit',
          reorderLevel, unitCost, location: inventoryLocation.trim() || undefined
        });
        setInventory(items => [created, ...items]);
        setMovementItemId(created.id);
        setNotice('Inventory item created. Record opening stock using a stock-in movement.');
      }
      resetInventoryForm();
    } catch (err: any) {
      setInventoryError(err.message || (editingInventoryId ? 'Unable to update inventory item.' : 'Unable to create inventory item.'));
    } finally { setInventorySaving(false); }
  };

  const handleToggleInventoryItem = async (item: any) => {
    if (isReadOnly) return;
    setInventoryError(null);
    try {
      const updated = await ApiClient.updateInventoryItem(item.id, { isActive: !item.isActive });
      setInventory(rows => rows.map(row => row.id === item.id ? updated : row));
      setNotice(updated.isActive ? 'Inventory item reactivated.' : 'Inventory item archived.');
    } catch (err: any) {
      setInventoryError(err.message || 'Unable to update inventory item.');
    }
  };

  const handleInventoryMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !movementItemId) return;
    const quantity = Number(movementQuantity), unitCost = Number(movementUnitCost);
    if (!Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(unitCost) || unitCost < 0 ||
        (movementType !== 'adjustment' && quantity < 0)) {
      setInventoryError('Enter a non-zero quantity and a non-negative unit cost. Stock-in/out quantities must be positive.');
      return;
    }
    setMovementSaving(true); setInventoryError(null);
    try {
      await ApiClient.createInventoryTransaction(movementItemId, {
        transactionType: movementType, quantity, unitCost,
        reference: movementReference.trim() || undefined, note: movementNote.trim() || undefined
      });
      const [items, transactions] = await Promise.all([
        ApiClient.getInventoryItems(), ApiClient.getInventoryTransactions(movementItemId)
      ]);
      setInventory(items); setInventoryTransactions(transactions);
      setMovementQuantity('1'); setMovementReference(''); setMovementNote('');
      setNotice('Stock movement recorded successfully.');
    } catch (err: any) {
      setInventoryError(err.message || 'Unable to record stock movement.');
    } finally { setMovementSaving(false); }
  };

  const handleIssueLibraryLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !loanBookId || !loanStudentId || !loanDueDate) return;
    setLibrarySaving(true);
    setLibraryError(null);
    try {
      const loan = await ApiClient.issueLibraryLoan({ bookId: loanBookId, studentId: loanStudentId, dueDate: loanDueDate });
      const nextLoans = [loan, ...libraryLoans];
      setLibraryLoans(nextLoans);
      const firstAvailable = books.find(book => nextLoans.filter(item => item.bookId === book.id && item.status === 'issued').length < Number(book.quantity || 0));
      setLoanBookId(firstAvailable?.id || '');
      setLoanStudentId('');
      setNotice('Book issued to student.');
    } catch (err: any) {
      setLibraryError(err.message || 'Unable to issue this book.');
    } finally {
      setLibrarySaving(false);
    }
  };

  const handleReturnLibraryLoan = async (loanId: string) => {
    if (isReadOnly) return;
    setLibrarySaving(true);
    setLibraryError(null);
    try {
      const returned = await ApiClient.returnLibraryLoan(loanId);
      setLibraryLoans(rows => rows.map(row => row.id === returned.id ? returned : row));
      setNotice('Book return recorded.');
    } catch (err: any) {
      setLibraryError(err.message || 'Unable to record book return.');
    } finally {
      setLibrarySaving(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !school || !bookTitle.trim() || !bookAuthor.trim() || librarySaving) return;
    setLibrarySaving(true);
    setLibraryError(null);
    if (!Number.isInteger(bookCopies) || bookCopies < 1 || bookCopies > 100000) {
      setLibraryError('Book copy count must be a whole number between 1 and 100,000.');
      return;
    }
    setLibrarySaving(true);
    setLibraryError(null);
    try {
      const b = await ApiClient.addLibraryBook({
        title: bookTitle.trim(),
        author: bookAuthor.trim(),
        isbn: bookIsbn.trim(),
        quantity: bookCopies
      }, school.id);
      setBooks(prev => [...prev, b]);
      setShowAddBookModal(false);
      setBookTitle('');
      setBookAuthor('');
      setBookIsbn('');
      setBookCopies(5);
      setNotice('Book added to library catalogue.');
    } catch (err: any) {
      setLibraryError(err.message || 'Unable to add this book.');
    } finally {
      setLibrarySaving(false);
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !school || !routeName.trim() || !driverName.trim()) return;
    try {
      const r = await ApiClient.addTransportRoute({
        name: routeName,
        routeNumber: vehicleNumber,
        vehicleNumber,
        driverName,
        driverPhone,
        feeAmount: routeFee,
        capacity: routeCapacity,
        active: true,
        stops: routeStops.split(/[\r\n,]+/).map(stop => stop.trim()).filter(Boolean)
      }, school?.id);
      setRoutes(prev => [...prev, r]);
      setShowAddRouteModal(false);
      setRouteName('');
      setRouteStops('');
      setDriverName('');
      setVehicleNumber('');
      setDriverPhone('');
      setRouteCapacity(40);
      setNotice('Transport route added.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setModuleError(err.message || 'Unable to add this transport route.');
    }
  };

  const handleAssignBus = async () => {
    if (isReadOnly || !assignmentStudentId || !assignmentRouteId) return;
    try {
      const assignment = await ApiClient.setBusAssignment(assignmentStudentId, assignmentRouteId);
      setBusAssignments(current => [...current.filter(item => item.studentId !== assignment.studentId), assignment]);
      setNotice('Student assigned to the bus route. The configured route fee will be used for bus charges.');
    } catch (err: any) {
      setModuleError(err.message || 'Bus assignment failed.');
    }
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Campus Extension Modules
          </h1>
          <p className="text-xs text-[#64748B]">
            Library, Transport, Discipline, Clinic, and Assets
          </p>
        </div>

        {/* Module Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg text-xs overflow-x-auto self-start sm:self-auto">
          {[
            { id: 'library', label: 'Library' },
            { id: 'transport', label: 'Transport' },
            { id: 'discipline', label: 'Discipline' },
            { id: 'health', label: 'Clinic/Health' },
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
      {moduleError && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">{moduleError}</div>}

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
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Author</th>
                  <th className="px-4 py-2.5">ISBN</th>
                  <th className="px-4 py-2.5">Copies</th>
                  
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
          <section className="border-t border-[#E2E8F0] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[#132A29]">Issue a book</h3>
              <span className="text-[11px] text-[#64748B]">Available copies are calculated from active loans.</span>
            </div>
            {libraryError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{libraryError}</div>}
            {libraryLoading ? <p role="status" className="py-3 text-center text-xs text-[#64748B]">Loading lending records…</p> : (
              <>
                <form onSubmit={handleIssueLibraryLoan} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <select required value={loanBookId} onChange={e => setLoanBookId(e.target.value)} className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg sm:col-span-1">
                    <option value="">Select available book</option>
                    {books.map(book => {
                      const active = libraryLoans.filter(loan => loan.bookId === book.id && loan.status === 'issued').length;
                      const available = Math.max(0, Number(book.quantity || 0) - active);
                      return available > 0 ? <option key={book.id} value={book.id}>{book.title} · {available} available</option> : null;
                    })}
                  </select>
                  <select required value={loanStudentId} onChange={e => setLoanStudentId(e.target.value)} className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg sm:col-span-1">
                    <option value="">Select student</option>
                    {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} · {student.studentId}</option>)}
                  </select>
                  <input required type="date" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} value={loanDueDate} onChange={e => setLoanDueDate(e.target.value)} className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg" aria-label="Due date" />
                  <button type="submit" disabled={isReadOnly || librarySaving || !loanBookId || !loanStudentId} className="px-3 py-2 text-xs bg-[#0F766E] text-white rounded-lg disabled:opacity-50">{librarySaving ? 'Saving…' : 'Issue book'}</button>
                </form>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B] border-b border-[#E2E8F0]">
                      <tr><th className="px-3 py-2">Book</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {libraryLoans.length === 0 ? <tr><td colSpan={6} className="p-5 text-center text-[#64748B]">No lending records yet.</td></tr> : libraryLoans.map(loan => {
                        const book = books.find(row => row.id === loan.bookId);
                        const student = students.find(row => row.id === loan.studentId);
                        const overdue = loan.status === 'issued' && loan.dueDate < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                        return <tr key={loan.id}>
                          <td className="px-3 py-2 font-medium">{book?.title || 'Book record unavailable'}</td>
                          <td className="px-3 py-2">{student ? `${student.firstName} ${student.lastName}` : loan.studentId}</td>
                          <td className="px-3 py-2 font-mono">{String(loan.issuedAt || '').slice(0, 10)}</td>
                          <td className="px-3 py-2 font-mono">{loan.dueDate}</td>
                          <td className="px-3 py-2">{loan.status === 'returned' ? <span className="text-emerald-700">Returned</span> : overdue ? <span className="font-semibold text-rose-700">Overdue</span> : <span className="text-amber-700">Issued</span>}</td>
                          <td className="px-3 py-2">{loan.status === 'issued' && <button type="button" disabled={isReadOnly || librarySaving} onClick={() => handleReturnLibraryLoan(loan.id)} className="text-[#0F766E] font-semibold disabled:opacity-50">Mark returned</button>}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
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
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Route Name</th>
                  <th className="px-4 py-2.5">Vehicle Plate</th>
                  <th className="px-4 py-2.5">Driver Name</th>
                  <th className="px-4 py-2.5">Driver Phone</th>
                  <th className="px-4 py-2.5">Neighborhood Stops</th>
                  <th className="px-4 py-2.5">Monthly Fee</th>
                  <th className="px-4 py-2.5">Seats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[#64748B]">No transport routes added yet.</td>
                  </tr>
                ) : (
                  routes.map(r => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-semibold text-[#132A29]">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono">{r.vehicleNumber}</td>
                      <td className="px-4 py-2.5 text-[#334155]">{r.driverName}</td>
                      <td className="px-4 py-2.5 font-mono text-[#64748B]">{r.driverPhone}</td>
                      <td className="px-4 py-2.5 text-[#334155]">{Array.isArray(r.stops) && r.stops.length ? r.stops.join(' → ') : 'Not set'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-emerald-700">{formatMoney(r.feeAmount, school?.currency)}</td>
                      <td className="px-4 py-2.5 font-mono">{busAssignments.filter(item => item.routeId === r.id && item.active !== false).length} / {r.capacity || 40}</td>
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
                {routes.filter(route => route.active !== false).map(route => {
                  const occupied = busAssignments.filter(item => item.routeId === route.id && item.active !== false && item.studentId !== assignmentStudentId).length;
                  return <option key={route.id} value={route.id}>{route.name} · {occupied}/{route.capacity || 40}</option>;
                })}
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
                  if (isReadOnly) return;
                  try {
                    await ApiClient.removeBusAssignment(item.studentId);
                    setBusAssignments(current => current.filter(row => row.id !== item.id));
                    setNotice('Student removed from the bus route.');
                  } catch (err: any) {
                    setModuleError(err.message || 'Unable to remove the bus assignment.');
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
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Discipline & Behaviour Incidents</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Infraction</th>
                  <th className="px-4 py-2.5">Severity</th>
                  <th className="px-4 py-2.5">Action Taken</th>
                  <th className="px-4 py-2.5">Parent contacted manually</th>
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
                    <td className="px-4 py-2.5 text-emerald-700 font-medium">{d.parentNotified ? 'Yes (manual contact)' : 'No'}</td>
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-600" />
              <span>School Clinic & Health Visits</span>
            </h2>
            <span className="text-xs text-slate-500">{healthLogs.length} recorded visits</span>
          </div>
          {moduleError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{moduleError}</div>}
          <form onSubmit={handleSaveHealthVisit} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Student
              <select required value={healthStudentId} onChange={event => setHealthStudentId(event.target.value)} disabled={isReadOnly || healthLoading || !healthStudents.length} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Select student</option>
                {healthStudents.map((student: any) => <option key={student.id} value={student.id}>{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')} · {student.studentId}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Visit date
              <input required type="date" value={healthVisitDate} onChange={event => setHealthVisitDate(event.target.value)} disabled={isReadOnly} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Reported symptoms
              <input required maxLength={2000} value={healthSymptoms} onChange={event => setHealthSymptoms(event.target.value)} disabled={isReadOnly} placeholder="Describe the symptoms reported" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Treatment / action
              <input maxLength={2000} value={healthTreatment} onChange={event => setHealthTreatment(event.target.value)} disabled={isReadOnly} placeholder="Treatment or action taken" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Attending nurse / staff
              <input maxLength={160} value={healthNurseName} onChange={event => setHealthNurseName(event.target.value)} disabled={isReadOnly} placeholder="Name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <div className="flex items-end justify-end">
              <button type="submit" disabled={isReadOnly || healthSaving || !healthStudentId || !healthSymptoms.trim()} className="rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {healthSaving ? 'Saving…' : 'Record clinic visit'}
              </button>
            </div>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
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
                {healthLoading ? (
                  <tr><td className="px-4 py-6 text-center text-[#64748B]" colSpan={5}>Loading clinic visits…</td></tr>
                ) : healthLogs.length ? healthLogs.map(h => (
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

      {/* 6. INVENTORY MODULE */}
      {activeModule === 'inventory' && (
        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2"><Boxes className="w-4 h-4 text-[#0F766E]" /> Inventory & Stock Ledger</h2>
              <span className="text-xs text-[#64748B]">{inventory.length} items</span>
            </div>
            {inventoryError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{inventoryError}</div>}
            <form onSubmit={handleCreateInventoryItem} className="grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-[#E2E8F0] pb-4">
              <label className="text-xs font-medium text-[#475569]">Item name<input required maxLength={160} value={inventoryName} onChange={e=>setInventoryName(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" placeholder="e.g. Exercise books" /></label>
              <label className="text-xs font-medium text-[#475569]">SKU / asset code<input maxLength={80} value={inventorySku} onChange={e=>setInventorySku(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="text-xs font-medium text-[#475569]">Category<input maxLength={100} value={inventoryCategory} onChange={e=>setInventoryCategory(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="text-xs font-medium text-[#475569]">Unit<input maxLength={40} value={inventoryUnit} onChange={e=>setInventoryUnit(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" placeholder="piece, box, pack" /></label>
              <label className="text-xs font-medium text-[#475569]">Reorder level<input type="number" min="0" step="0.01" value={inventoryReorderLevel} onChange={e=>setInventoryReorderLevel(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="text-xs font-medium text-[#475569]">Unit cost<input type="number" min="0" step="0.01" value={inventoryUnitCost} onChange={e=>setInventoryUnitCost(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="text-xs font-medium text-[#475569]">Storage location<input maxLength={160} value={inventoryLocation} onChange={e=>setInventoryLocation(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <div className="flex items-end gap-2">
                <button type="submit" disabled={isReadOnly || inventorySaving} className="w-full rounded bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {inventorySaving ? 'Saving…' : editingInventoryId ? 'Save changes' : 'Add inventory item'}
                </button>
                {editingInventoryId && <button type="button" disabled={inventorySaving} onClick={resetInventoryForm} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button>}
              </div>
            </form>
            {inventoryLoading ? <p role="status" className="py-5 text-center text-xs text-[#64748B]">Loading inventory…</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B]"><tr><th className="p-2">Item</th><th className="p-2">SKU</th><th className="p-2">Category</th><th className="p-2">On hand</th><th className="p-2">Reorder at</th><th className="p-2">Unit cost</th><th className="p-2">Location</th><th className="p-2">Status</th><th className="p-2">Manage</th></tr></thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {inventory.map(item=><tr key={item.id} className="hover:bg-[#F8FAFC]">
                      <td className="p-2 font-semibold text-[#132A29]">{item.name}</td><td className="p-2 font-mono">{item.sku||'—'}</td><td className="p-2">{item.category}</td>
                      <td className="p-2 font-mono">{item.quantityOnHand} {item.unit}</td><td className="p-2 font-mono">{item.reorderLevel}</td><td className="p-2 font-mono">{item.unitCost}</td><td className="p-2">{item.location||'—'}</td>
                      <td className="p-2"><span className={!item.isActive?'text-slate-500':item.quantityOnHand<=item.reorderLevel?'font-semibold text-rose-700':'text-emerald-700'}>{!item.isActive?'Archived':item.quantityOnHand<=item.reorderLevel?'Low stock':'In stock'}</span></td>
                      <td className="p-2">
                         <div className="flex flex-wrap gap-2">
                           <button type="button" disabled={isReadOnly} onClick={() => handleEditInventoryItem(item)} className="font-semibold text-[#0F766E] disabled:opacity-50">Edit</button>
                           <button type="button" disabled={isReadOnly} onClick={() => void handleToggleInventoryItem(item)} className="font-semibold text-slate-600 disabled:opacity-50">{item.isActive ? 'Archive' : 'Reactivate'}</button>
                         </div>
                       </td>
                    </tr>)}
                    {!inventory.length&&<tr><td colSpan={9} className="p-6 text-center text-[#64748B]">No inventory items yet. Add the first item above.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form onSubmit={handleInventoryMovement} className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-bold text-[#132A29]">Record stock movement</h3>
              <label className="block text-xs font-medium text-[#475569]">Inventory item<select required value={movementItemId} onChange={e=>setMovementItemId(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2"><option value="">Select item</option>{inventory.filter(i=>i.isActive).map(i=><option key={i.id} value={i.id}>{i.name} · {i.quantityOnHand} {i.unit}</option>)}</select></label>
              <label className="block text-xs font-medium text-[#475569]">Movement type<select value={movementType} onChange={e=>setMovementType(e.target.value as any)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2"><option value="stock_in">Stock in</option><option value="stock_out">Stock out</option><option value="adjustment">Adjustment (+/-)</option></select></label>
              <label className="block text-xs font-medium text-[#475569]">Quantity<input required type="number" step="0.01" value={movementQuantity} onChange={e=>setMovementQuantity(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="block text-xs font-medium text-[#475569]">Unit cost (optional)<input type="number" min="0" step="0.01" value={movementUnitCost} onChange={e=>setMovementUnitCost(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" /></label>
              <label className="block text-xs font-medium text-[#475569]">Reference<input maxLength={160} value={movementReference} onChange={e=>setMovementReference(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" placeholder="Invoice or issue reference" /></label>
              <label className="block text-xs font-medium text-[#475569]">Note<textarea maxLength={2000} value={movementNote} onChange={e=>setMovementNote(e.target.value)} className="mt-1 w-full rounded border border-[#CBD5E1] p-2" rows={2} /></label>
              <button type="submit" disabled={isReadOnly||movementSaving||!movementItemId} className="rounded bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{movementSaving?'Saving…':'Save stock movement'}</button>
              <p className="text-[11px] text-[#64748B]">Stock in/out uses positive quantities. Adjustment accepts a positive or negative quantity. The database prevents stock from becoming negative.</p>
            </form>
            <section className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-bold text-[#132A29]">Movement history</h3>
              {!movementItemId?<p className="text-xs text-[#64748B]">Select an item to view its ledger.</p>:inventoryTransactions.length===0?<p className="text-xs text-[#64748B]">No stock movements recorded for this item.</p>:<div className="max-h-96 overflow-y-auto space-y-2">{inventoryTransactions.map(tx=><article key={tx.id} className="rounded border border-[#E2E8F0] p-3 text-xs"><div className="flex justify-between gap-2"><strong className="capitalize">{String(tx.transactionType).replace('_',' ')}</strong><span className="font-mono">{tx.quantityDelta>0?'+':''}{tx.quantityDelta}</span></div><p className="text-[#64748B] mt-1">Balance: {tx.quantityBefore} → {tx.quantityAfter} · {tx.createdAt?new Date(tx.createdAt).toLocaleString():''}</p>{tx.note&&<p className="mt-1">{tx.note}</p>}</article>)}</div>}
            </section>
          </section>
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
                  placeholder="e.g. North Jigjiga pickup route"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium">Stops / Neighborhoods (in pickup order)</label>
                <textarea
                  rows={3}
                  maxLength={15000}
                  value={routeStops}
                  onChange={e => setRouteStops(e.target.value)}
                  placeholder="Enter confirmed Jigjiga neighborhoods or pickup points, one per line"
                  className="mt-1 w-full resize-y rounded-lg border border-[#CBD5E1] px-3 py-2"
                />
                <p className="mt-1 text-[10px] text-[#64748B]">Use one verified neighborhood or pickup point per line. The stops are saved with this route.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Vehicle Plate</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium">Driver Phone</label>
                  <input
                    type="tel"
                    maxLength={50}
                    value={driverPhone}
                    onChange={e => setDriverPhone(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium">Bus Capacity (students)</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={routeCapacity}
                  onChange={e => setRouteCapacity(Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)))}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
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
                    min="0"
                    required
                    value={routeFee}
                    onChange={e => setRouteFee(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0))}
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
