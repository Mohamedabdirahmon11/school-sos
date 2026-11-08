/**
 * Plans & Billing Module for Super Admin
 * Pricing tier management, batch invoice generation (duplicate-safe), payment collection, and subscription receipt
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { formatMoney } from '../../lib/money.ts';
import { PlanConfig, SubscriptionInvoice, PlanTier } from '../../types/index.ts';
import { Receipt, DollarSign, CheckCircle2, Clock, FileText, Printer, Sparkles, X } from 'lucide-react';

export const PlansBillingView: React.FC = () => {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [platformCurrency, setPlatformCurrency] = useState('ETB');
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SubscriptionInvoice | null>(null);
  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [plansData, invoicesData, settingsData] = await Promise.all([
        ApiClient.getPlans(),
        ApiClient.getInvoices(),
        ApiClient.getSettings()
      ]);
      setPlans(plansData);
      setInvoices(invoicesData);
      setPlatformCurrency(String(settingsData.platformCurrency || 'ETB').toUpperCase());
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load plans and subscription invoices.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerateInvoices = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await ApiClient.generateBatchInvoices();
      setNotice(`Generated ${res.generatedCount} invoices. Skipped ${res.skippedOpenInvoiceCount} schools with open invoices, ${res.skippedLifetimeCount} lifetime subscriptions, and ${res.skippedInvalidPricingCount} schools with missing or invalid plan pricing.`);
      await fetchData();
      setTimeout(() => setNotice(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Unable to generate subscription invoices.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePayInvoice = async (id: string) => {
    if (payingInvoiceId) return;
    setPayingInvoiceId(id);
    try {
      await ApiClient.payInvoice(id);
      setNotice('Invoice marked as paid and receipt generated. Subscription access was updated according to its plan.');
      await fetchData();
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Invoice payment could not be completed.');
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      await ApiClient.updatePlan(editingPlan.id, editingPlan);
      setEditingPlan(null);
      setNotice(`Tier ${editingPlan.name} updated successfully.`);
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading plans and invoices…</div>;
  if (loadError) return (
    <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800" role="alert">
      <p className="font-semibold">Plans and invoices could not be loaded.</p>
      <p className="mt-1">{loadError}</p>
      <button type="button" onClick={() => void fetchData()} className="mt-3 font-semibold underline">Retry loading</button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Plans, Pricing & Subscription Invoicing
          </h1>
          <p className="text-xs text-[#64748B]">
            Configure SaaS pricing tiers, generate duplicate-safe recurring invoices, and issue receipts
          </p>
        </div>
        <button
          onClick={handleGenerateInvoices}
          disabled={isGenerating}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isGenerating ? 'Generating…' : 'Generate Invoices (Batch)'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Plan Tier Configuration Cards */}
      <div>
        <h2 className="text-sm font-bold text-[#132A29] mb-3">Subscription Tier Offerings</h2>
        {plans.length === 0 && <p className="mb-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-[#64748B]">No subscription plans are available.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#132A29]">{p.name}</h3>
                  <span className="text-[11px] font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-0.5 rounded border border-[#CCFBF1] uppercase">
                    {p.id}
                  </span>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-[#132A29]">{formatMoney(p.monthlyPrice, platformCurrency)}</span>
                    <span className="text-xs text-[#64748B]">/ month</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    {formatMoney(p.yearlyPrice, platformCurrency)} / year · Lifetime: {formatMoney(p.lifetimePrice, platformCurrency)}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#F1F5F9] text-xs space-y-1.5">
                  <p className="text-[#64748B]">Max Students: <strong className="text-[#132A29] font-mono">{p.maxStudents}</strong></p>
                  <p className="text-[#64748B]">Max Teachers: <strong className="text-[#132A29] font-mono">{p.maxTeachers}</strong></p>
                  <p className="text-[#64748B]">Support: <strong className="text-[#132A29] capitalize">{p.supportLevel.replace(/_/g, ' ')}</strong></p>
                  <div className="mt-2">
                    <span className="text-[11px] text-[#64748B] block mb-1">Included Modules ({p.modules.length}):</span>
                    <div className="flex flex-wrap gap-1">
                      {p.modules.slice(0, 6).map(m => (
                        <span key={m} className="text-[10px] bg-[#F1F5F9] text-[#334155] px-1.5 py-0.5 rounded">
                          {m}
                        </span>
                      ))}
                      {p.modules.length > 6 && (
                        <span className="text-[10px] bg-[#F1F5F9] text-[#334155] px-1.5 py-0.5 rounded">
                          +{p.modules.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setEditingPlan({ ...p })}
                className="mt-4 w-full py-1.5 px-3 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] rounded-lg text-xs font-semibold transition-colors"
              >
                Edit Tier Pricing
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription Invoices Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#132A29]">Platform Subscription Invoices</h2>
            <p className="text-[11px] text-[#64748B]">All tenant billing records and receipt states</p>
          </div>
          <span className="text-xs font-mono text-[#64748B]">{invoices.length} Invoices</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Tenant School</th>
                <th className="px-4 py-3">Plan & Cadence</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Issued Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#64748B]">
                    No invoices generated yet. Click "Generate Invoices (Batch)" to bill schools.
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-[#132A29]">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-semibold text-[#132A29]">{inv.schoolName}</td>
                    <td className="px-4 py-3 capitalize text-[#334155]">
                      {inv.plan} ({inv.cadence})
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[#132A29]">
                      {formatMoney(inv.amount, inv.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">
                      {inv.issuedDate.split('T')[0]}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold ${
                        inv.status === 'paid' ? 'text-emerald-700' :
                        inv.status === 'overdue' ? 'text-rose-700' :
                        'text-amber-700'
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== 'paid' && (
                          <button
                            onClick={() => handlePayInvoice(inv.id)}
                            disabled={payingInvoiceId !== null}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {payingInvoiceId === inv.id ? 'Processing…' : 'Mark Paid'}
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="px-2.5 py-1 text-xs font-medium text-[#334155] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded transition-colors flex items-center gap-1"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT PLAN MODAL */}
      {editingPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29]">
                Edit Plan Tier: {editingPlan.name}
              </h2>
              <button onClick={() => setEditingPlan(null)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Monthly Price ({platformCurrency})</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingPlan.monthlyPrice}
                    onChange={e => setEditingPlan({ ...editingPlan, monthlyPrice: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Yearly Price ({platformCurrency})</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingPlan.yearlyPrice}
                    onChange={e => setEditingPlan({ ...editingPlan, yearlyPrice: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Lifetime Access Price ({platformCurrency})</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={editingPlan.lifetimePrice}
                  onChange={e => setEditingPlan({ ...editingPlan, lifetimePrice: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Max Students</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingPlan.maxStudents}
                    onChange={e => setEditingPlan({ ...editingPlan, maxStudents: parseInt(e.target.value, 10) || 100 })}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Max Teachers</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingPlan.maxTeachers}
                    onChange={e => setEditingPlan({ ...editingPlan, maxTeachers: parseInt(e.target.value, 10) || 10 })}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold"
                >
                  Save Tier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION RECEIPT MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29]">Official Platform Receipt</h2>
              <button onClick={() => setSelectedInvoice(null)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-3 font-mono">
              <div className="text-center pb-2 border-b border-[#E2E8F0]">
                <p className="font-bold text-sm text-[#132A29]">SchoolOS Cloud Platform</p>
                <p className="text-[10px] text-[#64748B]">SaaS Subscription License Receipt</p>
                <p className="text-[11px] text-[#0F766E] font-bold mt-1">
                  {selectedInvoice.receiptNumber || 'OFFICIAL RECEIPT'}
                </p>
              </div>

              <div className="flex justify-between">
                <span className="text-[#64748B]">Tenant School:</span>
                <span className="font-bold text-[#132A29]">{selectedInvoice.schoolName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Invoice ID:</span>
                <span>{selectedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Subscription Plan:</span>
                <span className="capitalize">{selectedInvoice.plan} ({selectedInvoice.cadence})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Date:</span>
                <span>{(selectedInvoice.paidDate || selectedInvoice.issuedDate).split('T')[0]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Status:</span>
                <span className="font-bold uppercase text-emerald-700">{selectedInvoice.status}</span>
              </div>
              <div className="pt-2 border-t border-[#E2E8F0] flex justify-between text-sm font-bold text-[#132A29]">
                <span>Total Paid:</span>
                <span>{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</span>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center gap-2">
              <span className="text-[10px] text-[#64748B]">System Verified Electronic Receipt</span>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded font-medium flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
