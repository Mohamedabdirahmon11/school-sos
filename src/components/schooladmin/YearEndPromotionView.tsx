/**
 * Year-End Academic Promotion Workflow
 * Rules:
 * 1. Admin selects a class cohort.
 * 2. System ranks students by combined yearly percentage (Semester 1 + Semester 2).
 * 3. Compares with the school's pass mark and proposes decision (Promote vs Repeat).
 * 4. Admin can manually review and adjust (Promote / Repeat) for any student.
 * 5. On confirmation, moves promoted students to the next class, records promotion audit trail, and archives history.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolClass, ExamConfig } from '../../types/index.ts';
import { 
  ArrowUpRight, 
  GraduationCap, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  History, 
  Check, 
  Sliders,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

export const YearEndPromotionView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [topN, setTopN] = useState(3);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);

  const [yearlyRankings, setYearlyRankings] = useState<any[]>([]);
  const [decisionMap, setDecisionMap] = useState<Record<string, { decision: 'promoted' | 'repeated'; notes: string; adminOverride: boolean }>>({});
  const [history, setHistory] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial classes and config
  useEffect(() => {
    if (!school) return;
    setLoading(true);
    Promise.all([
      ApiClient.getClasses(),
      ApiClient.getExamConfig(),
      ApiClient.getPromotionHistory()
    ]).then(([clsList, conf, archived]) => {
      setClasses(clsList);
      setHistory(archived);
      if (clsList.length > 0) {
        setSelectedClassId(clsList[0].id);
        if (clsList.length > 1) setTargetClassId(clsList[1].id);
      }
      setExamConfig(conf);
    }).finally(() => setLoading(false));
  }, [school]);

  // Load class yearly rankings when class changes
  const loadClassRankings = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const rankings = await ApiClient.getYearlyRankings(selectedClassId);
      setYearlyRankings(rankings);

      const map: Record<string, { decision: 'promoted' | 'repeated'; notes: string; adminOverride: boolean }> = {};
      rankings.forEach(r => {
        const eligible = r.isPass && r.yearlyRank <= topN;
        map[r.student.id] = {
          decision: eligible ? 'promoted' : 'repeated',
          notes: eligible ? `Achieved ${r.yearlyPercentage}% (Rank #${r.yearlyRank})` : `Rank #${r.yearlyRank}; outside top ${topN} eligible students`,
          adminOverride: false
        };
      });
      setDecisionMap(map);
    } catch (err: any) {
      console.error(err);
      setError('Failed to calculate class academic rankings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassRankings();
  }, [selectedClassId]);

  const handleDecisionChange = (studentId: string, decision: 'promoted' | 'repeated') => {
    const rank = yearlyRankings.find(row => row.student.id === studentId);
    const eligible = Boolean(rank?.isPass && rank.yearlyRank <= topN);
    const defaultDecision = eligible ? 'promoted' : 'repeated';
    setDecisionMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        decision,
        adminOverride: decision !== defaultDecision,
        notes: decision !== defaultDecision ? 'Approved by school administrator' : (eligible ? `Achieved ${rank.yearlyPercentage}% (Rank #${rank.yearlyRank})` : `Rank #${rank?.yearlyRank}; outside top ${topN} eligible students`)
      }
    }));
  };

  const handleTopNChange = (value: number) => {
    const next = Math.max(1, Math.floor(value) || 1);
    setTopN(next);
    setDecisionMap(Object.fromEntries(yearlyRankings.map(row => {
      const eligible = row.isPass && row.yearlyRank <= next;
      return [row.student.id, {
        decision: eligible ? 'promoted' : 'repeated',
        notes: eligible ? `Achieved ${row.yearlyPercentage}% (Rank #${row.yearlyRank})` : `Rank #${row.yearlyRank}; outside top ${next} eligible students`,
        adminOverride: false
      }];
    })));
  };

  const handleConfirmPromotion = async () => {
    if (isReadOnly || !selectedClassId) return;
    if (!targetClassId) {
      setError('Please select the Target Class cohort to receive the promoted students.');
      return;
    }

    setIsConfirming(true);
    setError(null);
    setMessage(null);

    try {
      const payload = yearlyRankings.map(r => ({
        studentId: r.student.id,
        classFromId: selectedClassId,
        classToId: decisionMap[r.student.id]?.decision === 'promoted' ? targetClassId : selectedClassId,
        yearlyPercentage: r.yearlyPercentage,
        yearlyRank: r.yearlyRank,
        decision: decisionMap[r.student.id]?.decision || (r.isPass ? 'promoted' : 'repeated'),
        notes: decisionMap[r.student.id]?.notes || '',
        adminOverride: decisionMap[r.student.id]?.adminOverride || false
      }));

      await ApiClient.confirmPromotions(selectedClassId, topN, payload);
      setHistory(await ApiClient.getPromotionHistory());
      const promotedCount = payload.filter(p => p.decision === 'promoted').length;
      const repeatedCount = payload.filter(p => p.decision === 'repeated').length;

      setMessage(`Year-End Promotion confirmed! ${promotedCount} students promoted, ${repeatedCount} repeating.`);
      await loadClassRankings();
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to process promotions.');
    } finally {
      setIsConfirming(false);
    }
  };

  const currentClass = classes.find(c => c.id === selectedClassId);
  const targetClass = classes.find(c => c.id === targetClassId);
  const passMark = examConfig?.passMarkPercentage || 50;

  const promoteCandidatesCount = Object.values(decisionMap).filter(d => d.decision === 'promoted').length;
  const repeatCandidatesCount = Object.values(decisionMap).filter(d => d.decision === 'repeated').length;

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#132A29] flex items-center gap-2">
            <ArrowUpRight className="w-6 h-6 text-[#0F766E]" />
            Year-End Promotion & Academic Progression
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Review proposed advancement based on combined yearly ranks and pass marks, adjust decisions, and commit cohorts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmPromotion}
            disabled={isConfirming || isReadOnly || yearlyRankings.length === 0}
            className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-200" />
            {isConfirming ? 'Processing...' : 'Confirm & Commit Promotions'}
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cohort Selector & Advancement Bar */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">
            Current Class (Completing Academic Year)
          </label>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white focus:ring-2 focus:ring-[#0F766E]"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
            ))}
          </select>
          <label className="block text-xs font-semibold text-[#475569] mt-3 mb-1">Top eligible students</label>
          <input type="number" min={1} step={1} value={topN} onChange={e => handleTopNChange(Number(e.target.value))} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white focus:ring-2 focus:ring-[#0F766E]" />
        </div>

        <div className="flex items-center justify-center pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] bg-teal-50 px-3 py-1.5 rounded-full border border-teal-200">
            <span>Advancement Stream</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">
            Target Class (For Promoted Cohort)
          </label>
          <select
            value={targetClassId}
            onChange={e => setTargetClassId(e.target.value)}
            className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white focus:ring-2 focus:ring-[#0F766E]"
          >
            <option value="">-- Select Next Class Cohort --</option>
            {classes.filter(c => c.id !== selectedClassId).map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
          <p className="text-xs text-[#64748B]">Total Cohort Size</p>
          <p className="text-xl font-bold font-mono text-[#132A29] mt-1">{yearlyRankings.length}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm">
          <p className="text-xs text-emerald-700 font-semibold">Advancing (Promote)</p>
          <p className="text-xl font-bold font-mono text-emerald-800 mt-1">{promoteCandidatesCount}</p>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm">
          <p className="text-xs text-rose-700 font-semibold">Repeating Class</p>
          <p className="text-xl font-bold font-mono text-rose-800 mt-1">{repeatCandidatesCount}</p>
        </div>
        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 shadow-sm">
          <p className="text-xs text-teal-700 font-semibold">School Pass Threshold</p>
          <p className="text-xl font-bold font-mono text-teal-800 mt-1">{passMark}% Minimum</p>
        </div>
      </div>

      {/* Proposed Promotion List Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#132A29]">
            Class {currentClass?.name} Academic Progression Roster
          </h2>
          <span className="text-xs text-[#64748B]">Sorted by Yearly Academic Rank</span>
        </div>

        {yearlyRankings.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            No students found in this class cohort.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4 text-center">Rank</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4 text-center font-bold">Yearly Total (%)</th>
                  <th className="py-3 px-4 text-center">Auto Recommendation</th>
                  <th className="py-3 px-4 text-center">Final Decision</th>
                  <th className="py-3 px-4">Promotion Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {yearlyRankings.map(r => {
                  const currentDecision = decisionMap[r.student.id]?.decision || (r.isPass ? 'promoted' : 'repeated');
                  return (
                    <tr key={r.student.id} className={r.isTopThree ? 'bg-teal-50/20' : 'hover:bg-[#F8FAFC]'}>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {r.yearlyRank === 1 ? '🥇 1' : r.yearlyRank === 2 ? '🥈 2' : r.yearlyRank === 3 ? '🥉 3' : `#${r.yearlyRank}`}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#132A29]">{r.student.firstName} {r.student.middleName} {r.student.lastName}</p>
                        <p className="text-[11px] font-mono text-[#64748B]">{r.student.studentId}</p>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-[#0F766E]">
                        {r.yearlyPercentage}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          r.isPass && r.yearlyRank <= topN ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {r.isPass && r.yearlyRank <= topN ? 'Top-N eligible' : 'Repeat by default'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex rounded-lg border border-[#CBD5E1] p-0.5 bg-slate-50">
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleDecisionChange(r.student.id, 'promoted')}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                              currentDecision === 'promoted'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-[#64748B] hover:text-[#132A29]'
                            }`}
                          >
                            Promote
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleDecisionChange(r.student.id, 'repeated')}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                              currentDecision === 'repeated'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-[#64748B] hover:text-[#132A29]'
                            }`}
                          >
                            Repeat
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={decisionMap[r.student.id]?.notes || ''}
                          disabled={isReadOnly}
                          onChange={e => {
                            const val = e.target.value;
                            setDecisionMap(prev => ({
                              ...prev,
                              [r.student.id]: {
                                ...prev[r.student.id],
                                notes: val
                              }
                            }));
                          }}
                          placeholder="Optional audit reason..."
                          className="w-full text-xs py-1 px-2 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#0F766E]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-bold text-[#132A29]">Promotion history</h2>
        </div>
        {history.length === 0 ? <p className="p-4 text-xs text-[#64748B]">No confirmed promotion records yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[#64748B]"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Academic year</th><th className="px-4 py-2">Decision</th><th className="px-4 py-2">Notes</th></tr></thead>
              <tbody>{history.map((record: any) => <tr key={record.id} className="border-t border-[#E2E8F0]"><td className="px-4 py-2">{record.studentId}</td><td className="px-4 py-2">{record.academicYearFrom} → {record.academicYearTo}</td><td className="px-4 py-2 capitalize">{record.decision}</td><td className="px-4 py-2">{record.notes || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
