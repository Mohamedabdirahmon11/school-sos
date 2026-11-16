import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Palette, RotateCcw, Save, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SidebarTheme } from '../../types/index.ts';

const DEFAULT_THEME: SidebarTheme = {
  preset: 'brand',
  backgroundColor: '#102c2a',
  textColor: '#ffffff',
  accentColor: '#0f766e',
  activeStyle: 'pill',
  radius: 'rounded',
  density: 'comfortable',
  iconStyle: 'outline',
  showGroupLabels: true,
  width: 260,
  defaultCollapsed: false,
  fontSize: 'normal',
  showLogo: true,
  showSchoolName: true,
  showUserCard: true
};

const PRESETS: Array<{ id: SidebarTheme['preset']; label: string; background: string; text: string; accent: string }> = [
  { id: 'light', label: 'Light', background: '#f8fafc', text: '#172033', accent: '#0f766e' },
  { id: 'dark', label: 'Dark', background: '#102c2a', text: '#ffffff', accent: '#14b8a6' },
  { id: 'brand', label: 'Brand', background: '#102c2a', text: '#ffffff', accent: '#0f766e' },
  { id: 'gradient', label: 'Gradient', background: '#102c2a', text: '#ffffff', accent: '#5eead4' },
  { id: 'glass', label: 'Glass', background: '#0f172a', text: '#ffffff', accent: '#38bdf8' },
  { id: 'soft', label: 'Soft', background: '#eaf2f1', text: '#183b38', accent: '#0f766e' },
  { id: 'custom', label: 'Custom', background: '#102c2a', text: '#ffffff', accent: '#0f766e' }
];

const SWATCHES = ['#0f766e', '#0d9488', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#334155'];

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastRatio(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function validHex(value: string): boolean { return /^#[0-9a-f]{6}$/i.test(value); }
function readableText(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#111827') ? '#ffffff' : '#111827';
}

export const SidebarAppearanceSettings: React.FC = () => {
  const { school, refreshUser, isReadOnly } = useAuth();
  const [theme, setTheme] = useState<SidebarTheme>(() => ({ ...DEFAULT_THEME, ...(school?.sidebarTheme || {}) }));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'saving' | 'offline' | 'idle'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    setTheme({ ...DEFAULT_THEME, ...(school?.sidebarTheme || {}) });
  }, [school?.id, school?.sidebarTheme]);

  const contrast = useMemo(() => validHex(theme.backgroundColor) && validHex(theme.textColor)
    ? contrastRatio(theme.backgroundColor, theme.textColor) : 0, [theme.backgroundColor, theme.textColor]);
  const contrastPasses = contrast >= 4.5;

  useEffect(() => {
    const root = document.documentElement;
    const apply = (value: SidebarTheme) => {
      const preset = PRESETS.find(item => item.id === value.preset);
      const background = value.preset === 'gradient'
        ? 'linear-gradient(160deg, #102c2a 0%, #164e63 55%, #0f766e 100%)'
        : value.preset === 'glass'
          ? 'rgba(15, 23, 42, 0.94)'
          : value.preset === 'custom'
            ? value.backgroundColor
            : (preset?.background || value.backgroundColor);
      root.style.setProperty('--sidebar-background', background);
      root.style.setProperty('--sidebar-text', value.textColor);
      root.style.setProperty('--sidebar-accent', value.accentColor);
      root.style.setProperty('--sidebar-accent-foreground', readableText(value.accentColor));
      root.style.setProperty('--sidebar-width', `${value.width}px`);
      root.style.setProperty('--sidebar-radius', value.radius === 'sharp' ? '4px' : value.radius === 'medium' ? '10px' : '14px');
      root.style.setProperty('--sidebar-font-size', value.fontSize === 'small' ? '12px' : value.fontSize === 'large' ? '14px' : '13px');
    };
    apply(theme);
    return () => apply({ ...DEFAULT_THEME, ...(school?.sidebarTheme || {}) });
  }, [theme, school?.sidebarTheme]);

  const update = <K extends keyof SidebarTheme>(key: K, value: SidebarTheme[K]) =>
    setTheme(current => ({ ...current, [key]: value }));

  const choosePreset = (id: SidebarTheme['preset']) => {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    setTheme(current => ({
      ...current,
      preset: id,
      backgroundColor: preset.background,
      textColor: preset.text,
      accentColor: preset.accent
    }));
  };

  const save = async (nextTheme = theme) => {
    if (!school?.id) return;
    if (!validHex(nextTheme.backgroundColor) || !validHex(nextTheme.textColor) || !validHex(nextTheme.accentColor)) {
      setError('Use valid six-digit HEX colors.');
      return;
    }
    const ratio = contrastRatio(nextTheme.backgroundColor, nextTheme.textColor);
    if (ratio < 4.5) {
      setError('Contrast is too low. WCAG AA requires at least 4.5:1 for normal text. Try the suggested readable text color.');
      return;
    }
    setSaving(true);
    setStatus(navigator.onLine ? 'saving' : 'offline');
    setError('');
    try {
      await ApiClient.updateSchoolSettings({ sidebarTheme: nextTheme });
      window.localStorage.setItem(`schoolos:sidebar-theme:${school.id}`, JSON.stringify(nextTheme));
      await refreshUser();
      setStatus('saved');
    } catch (cause) {
      setStatus(navigator.onLine ? 'idle' : 'offline');
      setError(cause instanceof Error ? cause.message : 'Sidebar appearance could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setTheme(DEFAULT_THEME);
    await save(DEFAULT_THEME);
  };

  return (
    <section className="max-w-5xl space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Palette size={19}/> Sidebar appearance</h2>
          <p className="mt-1 text-sm text-slate-500">Customize the navigation style for everyone in this school. Changes are saved to this school only.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">School-wide</span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Theme preset</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map(preset => (
                <button key={preset.id} type="button" onClick={() => choosePreset(preset.id)}
                  aria-pressed={theme.preset === preset.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-semibold transition ${theme.preset === preset.id ? 'border-teal-600 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-400'}`}>
                  <span className="h-7 w-7 shrink-0 rounded-lg border border-black/10" style={{ background: preset.id === 'gradient' ? 'linear-gradient(135deg,#102c2a,#0f766e)' : preset.background }}/>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold text-slate-600">Background color
              <div className="flex gap-2"><input aria-label="Sidebar background color" type="color" value={theme.backgroundColor} onChange={e => update('backgroundColor', e.target.value)} className="h-10 w-12 rounded-lg border border-slate-200"/>
                <input aria-label="Sidebar background HEX" value={theme.backgroundColor} onChange={e => { update('preset', 'custom'); update('backgroundColor', e.target.value); }} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 font-mono text-xs"/></div>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Text color
              <div className="flex gap-2"><input aria-label="Sidebar text color" type="color" value={theme.textColor} onChange={e => { update('preset', 'custom'); update('textColor', e.target.value); }} className="h-10 w-12 rounded-lg border border-slate-200"/>
                <input aria-label="Sidebar text HEX" value={theme.textColor} onChange={e => update('textColor', e.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 font-mono text-xs"/></div>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Accent color
              <div className="flex gap-2"><input aria-label="Sidebar accent color" type="color" value={theme.accentColor} onChange={e => { update('preset', 'custom'); update('accentColor', e.target.value); }} className="h-10 w-12 rounded-lg border border-slate-200"/>
                <input aria-label="Sidebar accent HEX" value={theme.accentColor} onChange={e => update('accentColor', e.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 font-mono text-xs"/></div>
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between"><label className="text-sm font-semibold text-slate-700">Brand swatches</label><span className="text-xs text-slate-500">12 quick colors</span></div>
            <div className="flex flex-wrap gap-2">{SWATCHES.map(color => <button key={color} type="button" aria-label={`Set accent color ${color}`} aria-pressed={theme.accentColor === color}
              onClick={() => { update('preset', 'custom'); update('accentColor', color); }}
              className={`h-8 w-8 rounded-full border-2 ${theme.accentColor === color ? 'border-slate-900 ring-2 ring-slate-200' : 'border-white shadow'}`} style={{ backgroundColor: color }}/>)}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">Active item style<select value={theme.activeStyle} onChange={e => update('activeStyle', e.target.value as SidebarTheme['activeStyle'])} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="pill">Pill</option><option value="bar">Left bar</option><option value="filled">Filled</option><option value="outline">Outline</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Corner radius<select value={theme.radius} onChange={e => update('radius', e.target.value as SidebarTheme['radius'])} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="sharp">Sharp</option><option value="medium">Medium</option><option value="rounded">Rounded</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Density<select value={theme.density} onChange={e => update('density', e.target.value as SidebarTheme['density'])} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Icon style<select value={theme.iconStyle} onChange={e => update('iconStyle', e.target.value as SidebarTheme['iconStyle'])} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="outline">Outline</option><option value="filled">Filled</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Font size<select value={theme.fontSize} onChange={e => update('fontSize', e.target.value as SidebarTheme['fontSize'])} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Sidebar width: {theme.width}px<input type="range" min="240" max="320" step="4" value={theme.width} onChange={e => update('width', Number(e.target.value))} className="mt-3 w-full accent-teal-700"/></label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['showGroupLabels', 'Show group labels'],
              ['defaultCollapsed', 'Start collapsed'],
              ['showLogo', 'Show school logo'],
              ['showSchoolName', 'Show school name'],
              ['showUserCard', 'Show user profile card']
            ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2.5 text-sm text-slate-700"><input type="checkbox" checked={theme[key]} onChange={e => update(key, e.target.checked)} className="accent-teal-700"/>{label}</label>)}
          </div>

          <div className={`rounded-xl border p-3 text-sm ${contrastPasses ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            <div className="flex items-center justify-between gap-3"><span className="font-semibold">Text contrast (WCAG AA)</span><span className="font-mono font-bold">{contrast.toFixed(2)}:1</span></div>
            <p className="mt-1 text-xs">{contrastPasses ? 'Contrast is sufficient for normal text.' : 'Somali: Midabadu si fiican isuma akhrinayaan. Isticmaal midabkan qoraalka:'}</p>
            {!contrastPasses && <button type="button" onClick={() => update('textColor', readableText(theme.backgroundColor))} className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold">Use readable text: {readableText(theme.backgroundColor)}</button>}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Eye size={16}/> Live preview</div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-lg" style={{ background: theme.preset === 'gradient' ? 'linear-gradient(160deg,#102c2a,#164e63 55%,#0f766e)' : theme.preset === 'glass' ? 'rgba(15,23,42,.94)' : theme.backgroundColor, color: theme.textColor }}>
            <div className="flex items-center gap-3 border-b border-current/10 p-4">
              {theme.showLogo && <div className="grid h-9 w-9 place-items-center rounded-xl font-bold" style={{ backgroundColor: theme.accentColor, color: readableText(theme.accentColor) }}>{school?.name?.slice(0,1) || 'S'}</div>}
              {theme.showSchoolName && <span className="truncate text-sm font-bold">{school?.name || 'School name'}</span>}
            </div>
            <div className="space-y-1 p-3 text-xs">
              {theme.showGroupLabels && <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">Dashboard</p>}
              {['Overview', 'Students', 'Teachers', 'Classes', 'Settings'].map((label, index) => <div key={label} className="flex items-center gap-3 px-3 py-2.5" style={{ borderRadius: theme.radius === 'sharp' ? 4 : theme.radius === 'medium' ? 10 : 14, backgroundColor: index === 0 ? theme.accentColor : 'transparent', color: index === 0 ? readableText(theme.accentColor) : theme.textColor }}><span className="h-2 w-2 rounded-full bg-current opacity-70"/>{label}</div>)}
            </div>
            {theme.showUserCard && <div className="border-t border-current/10 p-3 text-xs opacity-80">Signed in · School Admin</div>}
          </div>
          <p className="text-xs leading-5 text-slate-500">The saved appearance is shared by users in this school only. Each user keeps their own collapsed/expanded preference.</p>
        </aside>
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">{status === 'saved' ? <><CheckCircle2 size={14}/> Saved</> : status === 'saving' ? 'Saving…' : status === 'offline' ? <><WifiOff size={14}/> Offline — not saved</> : <><Wifi size={14}/> Changes are previewed locally</>}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => void reset()} disabled={saving || isReadOnly} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RotateCcw size={15}/> Reset</button>
          <button type="button" onClick={() => void save()} disabled={saving || isReadOnly || !contrastPasses} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save size={15}/>{saving ? 'Saving…' : 'Save for school'}</button>
        </div>
      </footer>
      {isReadOnly && <p className="text-xs text-amber-700">This school is read-only. Appearance changes are disabled.</p>}
    </section>
  );
};
