import React from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { EmptyState, LoadingState } from '../common/AsyncState.tsx';
import {
  Activity, AlertCircle, ArrowRight, Bell, BookOpen, CalendarCheck,
  CheckCircle2, ClipboardCheck, CreditCard, GraduationCap, Megaphone,
  Plus, School, UserPlus, Users, Wallet
} from 'lucide-react';

interface SchoolDashboardProps {
  onNavigate: (view: string) => void;
  onOpenAddStudent: () => void;
}
type DashboardRecord = Record<string, any>;

export function normalizeSchoolDashboardData(data: unknown) {
  const value: DashboardRecord = data && typeof data === 'object' ? data as DashboardRecord : {};
  const rawStats: DashboardRecord = value.stats && typeof value.stats === 'object' ? value.stats : {};
  const number = (input: unknown) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    stats: {
      totalStudents: number(rawStats.totalStudents),
      totalTeachers: number(rawStats.totalTeachers),
      totalClasses: number(rawStats.totalClasses ?? value.totalClasses),
      attendanceRate: number(rawStats.attendanceRate),
      attendanceRecordedToday: number(value.attendanceRecordedToday),
      todayAttendance: number(value.todayAttendance),
      todayCollection: number(rawStats.todayCollection ?? rawStats.totalCollected),
      totalOutstanding: number(rawStats.totalOutstanding ?? rawStats.outstandingFees)
    },
    recentStudents: Array.isArray(value.recentStudents) ? value.recentStudents : [],
    recentPayments: Array.isArray(value.recentPayments) ? value.recentPayments : [],
    notices: Array.isArray(value.notices) ? value.notices : [],
    attendanceTrend: Array.isArray(value.attendanceTrend) ? value.attendanceTrend : [],
    absentStudents: Array.isArray(value.absentStudents) ? value.absentStudents : [],
    recentActivity: Array.isArray(value.recentActivity) ? value.recentActivity : [],
    upcomingEvents: Array.isArray(value.upcomingEvents) ? value.upcomingEvents : [],
    setupReadiness: {
      checklist: value.setupReadiness && typeof value.setupReadiness === 'object'
        && Array.isArray((value.setupReadiness as DashboardRecord).checklist)
        ? (value.setupReadiness as DashboardRecord).checklist
        : [],
      canFinish: Boolean((value.setupReadiness as DashboardRecord | undefined)?.canFinish)
    },
    pendingAdmissions: number(value.pendingAdmissions),
    pendingMarks: number(value.pendingMarks)
  };
}

const StatCard = ({ label, value, note, icon: Icon, tone, onClick }: {
  label: string;
  value: React.ReactNode;
  note: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  tone: 'green' | 'gold' | 'blue' | 'red';
  onClick?: () => void;
}) => (
  <button type="button" onClick={onClick} className={`schoolos-dash-stat schoolos-dash-${tone}`} aria-label={label + ': ' + String(value)}>
    <span className="schoolos-dash-stat-top"><span>{label}</span><Icon size={19} strokeWidth={1.8} /></span>
    <strong>{value}</strong>
    <small>{note}</small>
  </button>
);

const PanelTitle = ({ eyebrow, title, icon: Icon, action }: {
  eyebrow?: string;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  action?: React.ReactNode;
}) => (
  <div className="schoolos-dash-panel-head">
    <div className="min-w-0">
      {eyebrow && <span className="schoolos-dash-eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
    </div>
    <span className="schoolos-dash-panel-icon"><Icon size={18} strokeWidth={1.8} /></span>
    {action}
  </div>
);

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ onNavigate, onOpenAddStudent }) => {
  const { school, isReadOnly, user } = useAuth();
  const { data, loading, error, retry } = useApi(
    () => ApiClient.getSchoolDashboard(school?.id),
    [school?.id],
    Boolean(school)
  );

  if (loading) return <div className="schoolos-dash-loading"><LoadingState label="Dashboard-ka waa la soo rarayaa…" className="max-w-7xl" /></div>;
  if (error) return <ErrorState error={error} onRetry={retry} />;

  const result = normalizeSchoolDashboardData(data);
  const canViewFinance = user?.role === 'accountant' || user?.role === 'super_admin';
  const canManageStudents = user?.role === 'school_admin' || user?.role === 'super_admin';
  const { totalStudents, totalTeachers, totalClasses, attendanceRate, attendanceRecordedToday, todayAttendance, todayCollection, totalOutstanding } = result.stats;
  const currency = school?.currency || 'ETB';
  const today = new Intl.DateTimeFormat('so-ET', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const greetingName = String(user?.fullName || 'Maamulaha').trim().split(/\s+/)[0];
  const maxTrend = Math.max(100, ...result.attendanceTrend.map((item: DashboardRecord) => Number(item.rate ?? item.attendanceRate ?? 0) || 0));
  const actions = [
    { label: 'Diiwaangeli arday', description: 'Ku dar arday cusub', icon: UserPlus, action: onOpenAddStudent, visible: canManageStudents, disabled: isReadOnly },
    { label: 'Imaanshaha maanta', description: 'Fur diiwaanka fasallada', icon: ClipboardCheck, action: () => onNavigate('sch_attendance'), visible: true },
    { label: 'Ogeysiis cusub', description: 'La wadaag war dugsiga', icon: Megaphone, action: () => onNavigate('sch_notices'), visible: true },
    { label: 'Macallimiinta', description: 'Eeg shaqaalaha wax dhiga', icon: Users, action: () => onNavigate('sch_teachers'), visible: true },
    { label: 'Fasallada', description: 'Maamul fasallada iyo qaybaha', icon: School, action: () => onNavigate('sch_classes'), visible: true },
    { label: 'Warbixinnada', description: 'Eeg xogta dugsiga', icon: Activity, action: () => onNavigate('sch_reports'), visible: true },
    { label: 'Diiwaangeli lacag', description: 'Cusboonaysii fee ledger', icon: CreditCard, action: () => onNavigate('sch_fees'), visible: canViewFinance }
  ].filter(item => item.visible);

  return (
    <div className="schoolos-reference-dashboard" aria-label="School dashboard">
      <header className="schoolos-dash-welcome">
        <div className="schoolos-dash-welcome-copy">
          <span className="schoolos-dash-kicker">SCHOOLOS · GUUDMAR</span>
          <h1>Dashboard</h1>
          <p>Soo dhawoow, {greetingName} <span aria-hidden="true">·</span> {today}</p>
          <div className="schoolos-dash-school-line">
            {school?.logoUrl
              ? <img src={school.logoUrl} alt="" />
              : <span className="schoolos-dash-school-mark">{school?.name?.trim().charAt(0).toUpperCase() || 'S'}</span>}
            <span className="min-w-0"><b>{school?.name || 'Dugsigaaga'}</b><small>{[school?.academicYear, school?.currentSemester].filter(Boolean).join(' · ') || 'Maamulka dugsiga'}</small></span>
          </div>
        </div>
        <div className="schoolos-dash-welcome-actions">
          {canViewFinance && <button type="button" className="schoolos-dash-button schoolos-dash-button-light" onClick={() => onNavigate('sch_fees')}><Wallet size={16} /> Diiwaangeli lacag</button>}
          {canManageStudents && <button type="button" className="schoolos-dash-button schoolos-dash-button-primary" onClick={onOpenAddStudent} disabled={isReadOnly}><Plus size={17} /> Arday cusub</button>}
        </div>
      </header>

      <section className="schoolos-dash-stats" aria-label="Tirakoobka dugsiga">
        <StatCard label="Ardayda firfircoon" value={totalStudents.toLocaleString()} note="Arday diiwaangashan" icon={GraduationCap} tone="green" onClick={() => onNavigate('sch_students')} />
        <StatCard label="Macallimiinta" value={totalTeachers.toLocaleString()} note="Shaqaalaha wax dhiga" icon={Users} tone="blue" onClick={() => onNavigate('sch_teachers')} />
        <StatCard label="Fasallada" value={totalClasses.toLocaleString()} note="Fasallo aan la xirin" icon={School} tone="gold" onClick={() => onNavigate('sch_classes')} />
        <StatCard label="Joogay maanta" value={attendanceRecordedToday > 0 ? todayAttendance.toLocaleString() : '—'} note={attendanceRecordedToday > 0 ? `${attendanceRate}% heerka imaanshaha` : 'Weli lama diiwaangelin'} icon={CalendarCheck} tone="green" onClick={() => onNavigate('sch_attendance')} />
        <StatCard label="Maqan maanta" value={result.absentStudents.length.toLocaleString()} note="Ardayda u baahan dabagal" icon={AlertCircle} tone="red" onClick={() => onNavigate('sch_attendance')} />
        <StatCard label="Ogeysiisyada firfircoon" value={result.notices.length.toLocaleString()} note="Ogeysiisyadii ugu dambeeyay" icon={Bell} tone="blue" onClick={() => onNavigate('sch_notices')} />
        {canManageStudents && <StatCard label="Codsiyada cusub" value={result.pendingAdmissions.toLocaleString()} note="Codsiyo sugaya dib-u-eegis" icon={UserPlus} tone="gold" onClick={() => onNavigate('sch_admissions')} />}
        {canManageStudents && <StatCard label="Natiijooyin sugaya ansixin" value={result.pendingMarks.toLocaleString()} note="Dhibcaha macallimiintu soo gudbiyeen" icon={ClipboardCheck} tone="blue" onClick={() => onNavigate('sch_marks_approval')} />}
        {canViewFinance && <StatCard label="Lacag maanta la qabtay" value={formatMoney(todayCollection, currency)} note="Wadarta lacag ururinta maanta" icon={Wallet} tone="gold" onClick={() => onNavigate('sch_fees')} />}
        {canViewFinance && <StatCard label="Lacagta dhiman" value={formatMoney(totalOutstanding, currency)} note="Haraaga lacagaha" icon={CreditCard} tone="red" onClick={() => onNavigate('sch_fees')} />}
      </section>

      <section className="schoolos-dash-grid schoolos-dash-grid-main">
        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="IMAANSHAHA" title="Imaanshaha 7-dii maalmood" icon={Activity} action={<button type="button" className="schoolos-dash-text-link" onClick={() => onNavigate('sch_attendance')}>Fur diiwaanka <ArrowRight size={14} /></button>} />
          {result.attendanceTrend.length ? (
            <div className="schoolos-dash-chart" role="img" aria-label="Heerka imaanshaha toddobadii maalmood ee u dambeeyay">
              {result.attendanceTrend.map((item: DashboardRecord, index: number) => {
                const rate = Math.max(0, Math.min(100, Number(item.rate ?? item.attendanceRate ?? 0) || 0));
                return <div className="schoolos-dash-chart-day" key={item.date ?? item.day ?? index}>
                  <b>{rate}%</b>
                  <div className="schoolos-dash-chart-track"><span style={{ height: `${Math.max(3, rate / maxTrend * 100)}%` }} /></div>
                  <small>{item.day ?? (typeof item.date === 'string' ? item.date.slice(5) : `Maalin ${index + 1}`)}</small>
                </div>;
              })}
            </div>
          ) : <EmptyState title="Xogta imaanshaha wali ma jirto" description="Jaantusku wuxuu soo muuqan doonaa marka imaansho la diiwaangeliyo." className="schoolos-dash-empty" />}
          <div className="schoolos-dash-chart-foot"><span><i className="schoolos-dash-dot" /> Heerka ardayda joogtay</span><b>{attendanceRecordedToday > 0 ? `${attendanceRate}% maanta` : 'Maanta lama diiwaangelin'}</b></div>
        </article>

        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="DABAGAL" title="Ardayda maanta maqan" icon={AlertCircle} action={<button type="button" className="schoolos-dash-text-link" onClick={() => onNavigate('sch_attendance')}>Dhammaan <ArrowRight size={14} /></button>} />
          {result.absentStudents.length ? <div className="schoolos-dash-list">
            {result.absentStudents.slice(0, 5).map((student: DashboardRecord, index: number) => <div className="schoolos-dash-list-row" key={student.id ?? index}>
              <span className="schoolos-dash-avatar">{String(student.name ?? 'A').trim().charAt(0).toUpperCase()}</span>
              <span className="schoolos-dash-list-copy"><b>{student.name ?? student.studentName ?? 'Arday'}</b><small>{student.className ?? student.class ?? 'Fasal lama cayimin'} · {student.studentId ?? ''}</small></span>
              <span className="schoolos-dash-status schoolos-dash-status-red">Maqan</span>
            </div>)}
          </div> : <div className="schoolos-dash-success"><CheckCircle2 size={19} /><span><b>Ma jiraan arday maqnaansho loo diiwaangeliyey</b><small>Liiskani wuxuu ku salaysan yahay diiwaanka maanta.</small></span></div>}
        </article>
      </section>

      <section className="schoolos-dash-grid schoolos-dash-grid-lower">
        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="DIIWAANGELIN" title="Ardaydii ugu dambeysay" icon={GraduationCap} action={<button type="button" className="schoolos-dash-text-link" onClick={() => onNavigate('sch_students')}>Liiska ardayda <ArrowRight size={14} /></button>} />
          {result.recentStudents.length ? <div className="schoolos-dash-list">
            {result.recentStudents.slice(0, 5).map((student: DashboardRecord, index: number) => {
              const name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') || student.name || 'Arday cusub';
              return <div className="schoolos-dash-list-row" key={student.id ?? index}>
                <span className="schoolos-dash-avatar schoolos-dash-avatar-green">{name.charAt(0).toUpperCase()}</span>
                <span className="schoolos-dash-list-copy"><b>{name}</b><small>{student.studentId ?? 'ID lama hayo'} · {student.admissionDate ?? 'Taariikh lama hayo'}</small></span>
                <span className="schoolos-dash-status schoolos-dash-status-green">Arday</span>
              </div>;
            })}
          </div> : <EmptyState title="Weli arday cusub ma jiro" description="Marka arday la diiwaangeliyo, halkan ayuu ka muuqan doonaa." className="schoolos-dash-empty" />}
        </article>

        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="ISGAARSIIN" title="Ogeysiisyadii ugu dambeeyay" icon={Megaphone} action={<button type="button" className="schoolos-dash-text-link" onClick={() => onNavigate('sch_notices')}>Dhammaan <ArrowRight size={14} /></button>} />
          {result.notices.length ? <div className="schoolos-dash-list">
            {result.notices.slice(0, 4).map((notice: DashboardRecord, index: number) => <div className="schoolos-dash-notice" key={notice.id ?? index}>
              <span className="schoolos-dash-notice-mark"><Bell size={15} /></span>
              <div className="schoolos-dash-list-copy"><b>{notice.title ?? 'Ogeysiis dugsi'}</b><small>{notice.publishDate ?? ''}{notice.isPinned ? ' · Muhiim' : ''}</small><p>{notice.content ?? ''}</p></div>
            </div>)}
          </div> : <EmptyState title="Ogeysiis ma jiro" description="Ogeysiisyada dugsiga halkan ayay ka soo muuqan doonaan." className="schoolos-dash-empty" />}
        </article>
      </section>

      <section className="schoolos-dash-grid schoolos-dash-grid-lower">
        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="DIYAAR-GAROW" title="Diyaarnimada Setup" icon={CheckCircle2} />
          {result.setupReadiness.checklist.length ? (
            <div className="schoolos-dash-list">
              {result.setupReadiness.checklist.map((item: DashboardRecord) => (
                <div className="schoolos-dash-list-row" key={item.id}>
                  <span className={`schoolos-dash-status ${item.ready ? 'schoolos-dash-status-green' : 'schoolos-dash-status-red'}`}>
                    {item.ready ? 'Diyaar' : 'Maqan'}
                  </span>
                  <span className="schoolos-dash-list-copy">
                    <b>{item.label}</b>
                    {item.reason && !item.ready && <small>{item.reason}</small>}
                  </span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Xogta diyaar-garowga lama helin" description="Dib u cusboonaysii si loo hubiyo setup-ka dugsiga." className="schoolos-dash-empty" />}
        </article>
        <article className="schoolos-dash-panel">
          <PanelTitle eyebrow="JADWALKA" title="Dhacdooyinka soo socda" icon={CalendarCheck} />
          {result.upcomingEvents.length ? (
            <div className="schoolos-dash-list">
              {result.upcomingEvents.map((event: DashboardRecord) => (
                <div className="schoolos-dash-list-row" key={event.id}>
                  <span className="schoolos-dash-notice-mark"><CalendarCheck size={15} /></span>
                  <span className="schoolos-dash-list-copy">
                    <b>{event.title || 'Dhacdo dugsi'}</b>
                    <small>{event.startDate || event.start_date}{event.endDate && event.endDate !== event.startDate ? ` – ${event.endDate}` : ''} · {event.type || 'Dhacdo'}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Dhacdo soo socota ma jirto" description="Dhacdooyinka lagu daro Academic Calendar halkan ayay ka muuqanayaan." className="schoolos-dash-empty" />}
        </article>
      </section>

      <section className="schoolos-dash-panel">
        <PanelTitle eyebrow="DHAQDHAQAAQ" title="Waxqabadkii ugu dambeeyay" icon={Activity} />
        {result.recentActivity.length ? (
          <div className="schoolos-dash-list">
            {result.recentActivity.map((item: DashboardRecord) => (
              <div className="schoolos-dash-list-row" key={item.id}>
                <span className="schoolos-dash-notice-mark"><Activity size={15} /></span>
                <span className="schoolos-dash-list-copy">
                  <b>{item.details || item.action || 'Waxqabad cusub'}</b>
                  <small>{item.userName || item.user_name || 'Shaqaale'} · {item.timestamp ? new Date(item.timestamp).toLocaleString('so-ET') : ''}</small>
                </span>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Waxqabad cusub lama hayo" description="Dhaqdhaqaaqyada maamulka dugsiga halkan ayay ka muuqanayaan." className="schoolos-dash-empty" />}
      </section>

      <section className="schoolos-dash-panel schoolos-dash-actions-panel">
        <PanelTitle eyebrow="HABAB GAAGAABAN" title="Tallaabo degdeg ah" icon={BookOpen} />
        <div className="schoolos-dash-actions">
          {actions.map(item => <button type="button" key={item.label} onClick={item.action} disabled={item.disabled} className="schoolos-dash-action">
            <span className="schoolos-dash-action-icon"><item.icon size={19} /></span>
            <span><b>{item.label}</b><small>{item.description}</small></span>
            <ArrowRight size={15} className="schoolos-dash-action-arrow" />
          </button>)}
        </div>
      </section>
    </div>
  );
};
