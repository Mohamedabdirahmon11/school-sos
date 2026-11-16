import React, { useEffect, useRef, useState } from 'react';
import { sanitizeDocumentHtml } from '../../lib/documents/sanitize-html.ts';
import { isArtworkBelow200Dpi } from '../../lib/documents/artwork.ts';

type Props = {
  html: string;
  onChange: (html: string) => void;
  onSaveNow: () => void;
  direction: 'ltr' | 'rtl';
  onDirectionChange: (value: 'ltr' | 'rtl') => void;
  pageSize: 'A4' | 'A5' | 'Letter' | 'CR80';
  onPageSizeChange: (value: 'A4' | 'A5' | 'Letter' | 'CR80') => void;
  margins: number;
  onMarginsChange: (value: number) => void;
  school: any;
  onUploadImage: (file: File) => Promise<string>;
  canUploadImage?: boolean;
};

export const DocumentEditor: React.FC<Props> = ({
  html, onChange, onSaveNow, direction, onDirectionChange, pageSize, onPageSizeChange,
  margins, onMarginsChange, school, onUploadImage, canUploadImage = true
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCellColor, setActiveCellColor] = useState('#ffffff');
  const [cellBorderColor, setCellBorderColor] = useState('#94a3b8');
  const [cellBorderWidth, setCellBorderWidth] = useState('1');
  const [cellBorderStyle, setCellBorderStyle] = useState<'solid'|'dashed'|'dotted'|'double'>('solid');
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) editor.innerHTML = sanitizeDocumentHtml(html);
  }, [html]);

  const emit = () => {
    if (editorRef.current) onChange(sanitizeDocumentHtml(editorRef.current.innerHTML));
  };

  const command = (name: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    emit();
  };

  const selectedCell = (): HTMLTableCellElement | null => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return (element?.closest('td,th') as HTMLTableCellElement | null) || null;
  };

  const insertTable = () => {
    const cells = '<td style="border:1px solid #94a3b8;padding:7px;min-width:70px"><br></td>';
    const row = '<tr>' + cells.repeat(3) + '</tr>';
    command('insertHTML', '<table style="border-collapse:collapse;width:100%;margin:10px 0"><tbody>' + row.repeat(3) + '</tbody></table><p><br></p>');
  };

  const addRow = () => {
    const cell = selectedCell();
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const table = row.closest('table');
    if (!table) return;
    const clone = row.cloneNode(true) as HTMLTableRowElement;
    clone.querySelectorAll('td,th').forEach(item => { item.innerHTML = '<br>'; });
    row.parentElement?.insertBefore(clone, row.nextSibling);
    emit();
  };

  const removeRow = () => {
    const cell = selectedCell();
    const row = cell?.parentElement;
    if (!row || !row.closest('table')) return;
    row.remove();
    emit();
  };

  const addColumn = () => {
    const cell = selectedCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = row?.closest('table');
    if (!cell || !row || !table) return;
    const index = Array.from(row.cells).indexOf(cell);
    Array.from(table.rows).forEach(tableRow => {
      const next = tableRow.insertCell(index + 1);
      next.innerHTML = '<br>';
      next.setAttribute('style', 'border:1px solid #94a3b8;padding:7px;min-width:70px');
    });
    emit();
  };

  const removeColumn = () => {
    const cell = selectedCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = row?.closest('table');
    if (!cell || !row || !table) return;
    const index = Array.from(row.cells).indexOf(cell);
    Array.from(table.rows).forEach(tableRow => tableRow.cells[index]?.remove());
    emit();
  };

  const mergeRight = () => {
    const cell = selectedCell();
    const next = cell?.nextElementSibling as HTMLTableCellElement | null;
    if (!cell || !next || cell.rowSpan !== 1 || next.rowSpan !== 1) return;
    cell.colSpan = Math.max(1, cell.colSpan) + Math.max(1, next.colSpan);
    cell.innerHTML += '<br>' + next.innerHTML;
    next.remove();
    emit();
  };

  const mergeDown = () => {
    const cell = selectedCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = row?.closest('table');
    if (!cell || !row || !table || cell.colSpan !== 1 || cell.rowSpan !== 1) return;
    const nextRow = row.nextElementSibling as HTMLTableRowElement | null;
    if (!nextRow) return;
    const logicalColumn = Array.from(row.cells).slice(0, cell.cellIndex)
      .reduce((total, item) => total + item.colSpan, 0);
    let nextColumn = 0;
    const next = Array.from(nextRow.cells).find(candidate => {
      const start = nextColumn;
      nextColumn += candidate.colSpan;
      return logicalColumn >= start && logicalColumn < nextColumn;
    }) || null;
    if (!next || next.colSpan !== 1 || next.rowSpan !== 1) return;
    cell.rowSpan = 2;
    cell.innerHTML += '<br>' + next.innerHTML;
    next.remove();
    emit();
  };

  const setCellBorder = () => {
    const cell = selectedCell();
    if (!cell) return;
    cell.style.border = `${cellBorderWidth}px ${cellBorderStyle} ${cellBorderColor}`;
    emit();
  };

  const setCellColor = (color: string) => {
    const cell = selectedCell();
    if (!cell) return;
    cell.style.backgroundColor = color;
    emit();
  };

  const rotateSelectedImage = (degrees: number) => {
    if (!selectedImage || !editorRef.current?.contains(selectedImage)) return;
    selectedImage.style.transform = 'rotate(' + Math.max(-180,Math.min(180,degrees)) + 'deg)';
    selectedImage.style.transformOrigin = 'center center';
    emit();
  };

  const alignSelectedImage = (alignment: 'left'|'center'|'right') => {
    if (!selectedImage || !editorRef.current?.contains(selectedImage)) return;
    selectedImage.style.display = 'block';
    selectedImage.style.float = 'none';
    selectedImage.style.marginLeft = alignment === 'left' ? '0' : 'auto';
    selectedImage.style.marginRight = alignment === 'right' ? '0' : 'auto';
    if (alignment === 'left') { selectedImage.style.marginLeft = '0'; selectedImage.style.marginRight = 'auto'; }
    emit();
  };

  const nudgeSelectedImage = (dx: number, dy: number) => {
    if (!selectedImage || !editorRef.current?.contains(selectedImage)) return;
    const left = Math.max(-500,Math.min(500,(Number.parseFloat(selectedImage.style.left)||0)+dx));
    const top = Math.max(-500,Math.min(500,(Number.parseFloat(selectedImage.style.top)||0)+dy));
    selectedImage.style.position = 'relative';
    selectedImage.style.left = left + 'px';
    selectedImage.style.top = top + 'px';
    emit();
  };

  const changeSelectedImageLayer = (direction: 'front'|'back') => {
    if (!selectedImage || !editorRef.current?.contains(selectedImage)) return;
    const current = Number(selectedImage.style.zIndex || 0);
    selectedImage.style.zIndex = String(Math.max(-10,Math.min(10,current + (direction === 'front' ? 1 : -1))));
    selectedImage.style.position = 'relative';
    emit();
  };

  const setImageWidth = (width: string) => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const image = element?.closest('img') as HTMLImageElement | null;
    if (image) {
      image.style.width = width;
      image.style.maxWidth = '100%';
      emit();
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10_485_760) {
      window.alert('Sawirka waa inuu noqdaa PNG, JPEG ama WebP, kana yaraadaa 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Sawirku aad buu u weyn yahay; xadka waa 40 megapixels.');
        if (isArtworkBelow200Dpi(bitmap.width,bitmap.height,pageSize) &&
            !window.confirm('Xallinta sawirku waxay ka hooseysaa qiyaasta 200 DPI ee boggan. Tayada daabacaaddu way yaraan kartaa. Ma sii wadaysaa?')) return;
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Sawirka dib looma habayn karin.');
        context.drawImage(bitmap,0,0);
        // Re-encoding removes EXIF and other embedded metadata before private upload.
        const cleaned = await new Promise<Blob>((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Metadata-ga sawirka lama nadiifin karin.')),file.type,0.92));
        const safeFile = new File([cleaned],file.name,{type:cleaned.type || file.type,lastModified:Date.now()});
        const url = await onUploadImage(safeFile);
        command('insertHTML', '<img src="' + url + '" alt="Sawir dukumenti" style="max-width:100%;height:auto;width:320px">');
      } finally { bitmap.close(); }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Sawirka lama gelin karin.');
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const changeParagraphDirection = (value: 'ltr' | 'rtl') => {
    editorRef.current?.focus();
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const paragraph = element?.closest('p,div,h1,h2,h3,h4,h5,h6,li,td,th') as HTMLElement | null;
    if (paragraph && editorRef.current?.contains(paragraph)) paragraph.dir = value;
    else if (editorRef.current) editorRef.current.dir = value;
    emit();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedImage && editor.contains(selectedImage) && document.activeElement === selectedImage) {
        const delta = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelectedImage(-delta,0); return; }
        if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSelectedImage(delta,0); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSelectedImage(0,-delta); return; }
        if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSelectedImage(0,delta); return; }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') { event.preventDefault(); onSaveNow(); }
      else if (['b','i','u','z'].includes(key)) {
        event.preventDefault();
        command(key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : ({ b:'bold', i:'italic', u:'underline' } as Record<string,string>)[key]);
      }
    };
    editor.addEventListener('keydown', onKeyDown);
    return () => editor.removeEventListener('keydown', onKeyDown);
  }, [onSaveNow, selectedImage]);

  const button = (label: string, title: string, action: () => void) => (
    <button type="button" aria-label={label} title={title} onMouseDown={event => event.preventDefault()} onClick={action}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600">
      {label}
    </button>
  );

  return (
    <section className="documents-editor-shell min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <select aria-label="Geli doorsoome" defaultValue="" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" onChange={event => { if (event.target.value) command('insertText',event.target.value); event.target.value=''; }}><option value="">Doorsoome…</option><option value="{student_name}">Magaca ardayga</option><option value="{student_id}">Aqoonsiga ardayga</option><option value="{class}">Fasalka</option><option value="{parent_name}">Magaca waalidka</option><option value="{date}">Taariikhda</option><option value="{school_name}">Magaca dugsiga</option><option value="{teacher_name}">Magaca macallinka</option><option value="{term}">Xilli-dugsiyeedka</option><option value="{academic_year}">Sanad-dugsiyeedka</option><option value="{total_marks}">Wadarta dhibcaha</option><option value="{average}">Celceliska</option><option value="{grade}">Darajada</option><option value="{rank}">Kaalinta fasalka</option><option value="{attendance}">Xaadirinta</option><option value="{teacher_comment}">Faallada macallinka</option><option value="{fee_balance}">Haraaga lacagta (ETB)</option><option value="{staff_name}">Magaca shaqaalaha</option><option value="{staff_id}">Aqoonsiga shaqaalaha</option></select>
        {button('B','Qoraal madow',() => command('bold'))}
        {button('I','Qoraal jiifa',() => command('italic'))}
        {button('U','Hoosta xarriiq',() => command('underline'))}
        {button('H1','Cinwaan weyn',() => command('formatBlock','h1'))}
        {button('H2','Cinwaan',() => command('formatBlock','h2'))}
        <select aria-label="Cabbirka qoraalka" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" defaultValue="3" onChange={event => command('fontSize',event.target.value)}>
          <option value="2">Yar</option><option value="3">Dhexdhexaad</option><option value="4">Weyn</option><option value="5">Aad u weyn</option>
        </select>
        <label className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs">Midab <input aria-label="Midabka qoraalka" type="color" className="h-6 w-7" onChange={event => command('foreColor',event.target.value)} /></label>
        <label className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs">Iftiimin <input aria-label="Midabka iftiiminta" type="color" defaultValue="#fff2a8" className="h-6 w-7" onChange={event => command('hiliteColor',event.target.value)} /></label>
        {button('Liis •','Liis dhibco leh',() => command('insertUnorderedList'))}
        {button('Liis 1.','Liis tiro leh',() => command('insertOrderedList'))}
        {button('Bidix','Isku hagaaji bidix',() => command('justifyLeft'))}
        {button('Dhexe','Isku hagaaji dhexda',() => command('justifyCenter'))}
        {button('Midig','Isku hagaaji midig',() => command('justifyRight'))}
        <select aria-label="Kala fogaanta sadaradda" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" defaultValue="1.5" onChange={event => {
          const selection = window.getSelection();
          const node = selection?.anchorNode;
          const element = node instanceof Element ? node : node?.parentElement;
          const paragraph = element?.closest('p,div,li') as HTMLElement | null;
          if (paragraph) paragraph.style.lineHeight = event.target.value;
          emit();
        }}>
          <option value="1">Sadar 1</option><option value="1.5">Sadar 1.5</option><option value="2">Sadar 2</option>
        </select>
        {button('LTR','Qoraal bidix ilaa midig',() => { onDirectionChange('ltr'); changeParagraphDirection('ltr'); })}
        {button('RTL','Qoraal midig ilaa bidix',() => { onDirectionChange('rtl'); changeParagraphDirection('rtl'); })}
        <span className="mx-1 hidden h-6 w-px bg-slate-300 sm:inline-block" />
        {button('Jadwal +','Geli jadwal 3×3',insertTable)}
        {button('Sadar +','Ku dar sadar jadwalka',addRow)}
        {button('Sadar −','Ka saar sadarka la doortay',removeRow)}
        {button('Tiir +','Ku dar tiir jadwalka',addColumn)}
        {button('Tiir −','Ka saar tiirka la doortay',removeColumn)}
        {button('Isku dar →','Isku dar unugga midigta',mergeRight)}
        {button('Isku dar ↓','Isku dar unugga hoose',mergeDown)}
        <label className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs">Midabka unugga <input aria-label="Midabka unugga jadwalka" type="color" value={activeCellColor} className="h-6 w-7" onChange={event => { setActiveCellColor(event.target.value); setCellColor(event.target.value); }} /></label>
        <label className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs">Xadka <input aria-label="Midabka xadka unugga" type="color" value={cellBorderColor} className="h-6 w-7" onChange={event => setCellBorderColor(event.target.value)} /></label>
        <select aria-label="Ballaca xadka unugga" value={cellBorderWidth} onChange={event => setCellBorderWidth(event.target.value)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="0">Xad la'aan</option><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="4">4 px</option></select>
        <select aria-label="Nooca xadka unugga" value={cellBorderStyle} onChange={event => setCellBorderStyle(event.target.value as typeof cellBorderStyle)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="solid">Joogto</option><option value="dashed">Jajaban</option><option value="dotted">Dhibco</option><option value="double">Laba xariiq</option></select>
        {button('Adeegso xadka','Ku dabaq xadka unugga la doortay',setCellBorder)}
        {canUploadImage && <>{button('Sawir','Geli sawir',() => imageInputRef.current?.click())}
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void uploadImage(event.target.files?.[0])} /></>}
        <select aria-label="Wareeji sawirka la doortay" defaultValue="0" onChange={event => rotateSelectedImage(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
          <option value="0">Wareeg 0°</option><option value="90">Wareeg 90°</option><option value="180">Wareeg 180°</option><option value="-90">Wareeg -90°</option>
        </select>
        <select aria-label="Hagaajinta sawirka la doortay" defaultValue="center" onChange={event => alignSelectedImage(event.target.value as 'left'|'center'|'right')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="left">Sawir bidix</option><option value="center">Sawir dhexda</option><option value="right">Sawir midig</option></select>
        {button('Lakab +','Sawirka hore u soo qaad',() => changeSelectedImageLayer('front'))}
        {button('Lakab −','Sawirka gadaal u dhig',() => changeSelectedImageLayer('back'))}
        <select aria-label="Ballaca sawirka" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" defaultValue="320px" onChange={event => setImageWidth(event.target.value)}>
          <option value="160px">Sawir yar</option><option value="320px">Sawir dhexe</option><option value="640px">Sawir weyn</option><option value="100%">Buuxa</option>
        </select>
        {button('Xariiq','Geli xariiq',() => command('insertHorizontalRule'))}
        {button('Bog cusub','Geli kala goyn bog',() => command('insertHTML','<div class="document-page-break" data-page-break="true"></div>'))}
        {button('↶','Dib u celi',() => command('undo'))}
        {button('↷','Hore u celi',() => command('redo'))}
        {uploading && <span className="text-xs text-teal-700" role="status">Sawirka waa la gelinayaa…</span>}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Cabbirka bogga
          <select value={pageSize} onChange={event => onPageSizeChange(event.target.value as Props['pageSize'])} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option><option value="CR80">ID Card (85.6 × 54 mm)</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Jiho qoraal
          <select value={direction} onChange={event => onDirectionChange(event.target.value as 'ltr'|'rtl')} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="ltr">Bidix ilaa midig</option><option value="rtl">Midig ilaa bidix</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Margin (mm)
          <input type="number" min={5} max={40} value={margins} onChange={event => onMarginsChange(Math.min(40,Math.max(5,Number(event.target.value)||20)))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
        </label>
      </div>

      <div className="documents-paper mx-auto max-w-[900px] rounded-lg border border-slate-200 bg-white shadow-sm" data-page-size={pageSize} style={{ padding: margins + 'mm' }}>
        <header className="document-page-header mb-6 flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: school?.brandColor || '#0F766E' }}>
          {school?.logoUrl && <img src={school.logoUrl} alt="Astaanta dugsiga" className="h-16 w-16 object-contain" />}
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-xl font-bold text-slate-900">{school?.name || ''}</h2>
            {school?.nameArabic && <div dir="rtl" className="text-lg font-semibold text-slate-800">{school.nameArabic}</div>}
            <p className="text-xs text-slate-600">{[school?.address,school?.city].filter(Boolean).join(' · ')}</p>
          </div>
        </header>
        <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label="Meesha qoraalka dukumentiga" aria-multiline="true"
          dir={direction} onInput={emit} onBlur={emit} onClick={event => { const target = event.target as HTMLElement; const image = target.closest('img') as HTMLImageElement | null; if (selectedImage && selectedImage !== image) selectedImage.classList.remove('document-image-selected'); if (image && editorRef.current?.contains(image)) { image.classList.add('document-image-selected'); image.tabIndex = 0; image.focus(); setSelectedImage(image); } else setSelectedImage(null); }} onPaste={event => {
            const clipboard = event.clipboardData;
            const pasted = clipboard.getData('text/html');
            if (pasted) {
              event.preventDefault();
              command('insertHTML',sanitizeDocumentHtml(pasted));
            }
          }}
          className="document-editable min-h-[620px] outline-none text-slate-900"
          style={{ direction, unicodeBidi:'plaintext', fontFamily:'"Noto Naskh Arabic", "Amiri", "Arial", serif', lineHeight:1.65 }} />
        <footer className="document-page-footer mt-8 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-500">
          {school?.receiptFooter || ''}
        </footer>
      </div>
    </section>
  );
};
