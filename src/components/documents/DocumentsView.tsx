import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Search, Copy, Trash2, RotateCcw, Printer, Save, X, WandSparkles, Files, LayoutTemplate, History, ShieldCheck, Lock, Unlock, Paperclip, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { DocumentEditor } from './DocumentEditor.tsx';
import { DocumentFileTools } from './DocumentFileTools.tsx';
import { sanitizeDocumentHtml } from '../../lib/documents/sanitize-html.ts';
import { applySchoolBrandColor } from '../../lib/documents/brand-color.ts';
import './documents.css';

type DocType = 'transfer_letter'|'certificate'|'parent_letter'|'teacher_letter'|'student_clearance'|'report_summary'|'other';
type DocumentRow = { id:string; title:string; documentType:DocType; status:'draft'|'final'; updatedAt:string; deletedAt?:string|null; studentId?:string|null; pageSize?:'A4'|'A5'|'Letter'|'CR80'; direction?:'ltr'|'rtl'; pageMargins?:number; contentHtml?:string; lockedAt?:string|null; lockReason?:string|null; canEdit?:boolean; canDownload?:boolean };
type TemplateRow = { id:string; title:string; documentType:DocType; contentHtml:string; isBuiltin?:boolean; deletedAt?:string|null };

const makeBuiltin = (id:string, title:string, documentType:DocType, contentHtml:string): TemplateRow => ({
  id, title, documentType, isBuiltin:true, contentHtml
});

const BUILTIN_TEMPLATES: TemplateRow[] = [
  makeBuiltin('builtin-transfer','Warqadda ka sii dhaafidda ardayga','transfer_letter',
    '<h2 style="text-align:center">WARQADDA KA SII DAAFIDDA ARDAYGA</h2><p>Taariikh: {date}</p><p>Ku: Cidda ay khusayso</p><p>Waxaan caddeynaynaa in <strong>{student_name}</strong>, aqoonsiga <strong>{student_id}</strong>, uu wax ka bartay fasalka <strong>{class}</strong> ee {school_name}.</p><p>Waalidka/masuulka: {parent_name}</p><p>Sanad-dugsiyeedka: {academic_year}</p><p>Fadlan ardayga u fududeeya sii wadashada waxbarashadiisa.</p><p>Mahadsanidiin.</p><p>Maamulaha dugsiga: __________________</p>'),
  makeBuiltin('builtin-replacement-certificate','Codsiga shahaado beddel ah','student_clearance',
    '<h2 style="text-align:center">CODSIGA SHAHAADO / AQOONSI BEDDEL AH</h2><p>Taariikh: {date}</p><p>Magaca ardayga: {student_name}</p><p>Aqoonsiga: {student_id}</p><p>Fasal: {class}</p><p>Waalid: {parent_name}</p><p>Waxaan codsanayaa in la ii soo saaro nuqul beddel ah maadaama kii hore lumay ama dhaawacmay.</p><p>Nooca dukumentiga: __________________</p><p>Saxiixa codsadaha: __________________</p><p>Go’aanka maamulka: __________________</p>'),
  makeBuiltin('builtin-admission-letter','Warqadda oggolaanshaha gelitaanka','parent_letter',
    '<h2 style="text-align:center">WARQADDA OGOLAANSHAHA GELITAANKA</h2><p>Taariikh: {date}</p><p>Ku: {parent_name}</p><p>Waxaan ku faraxsanahay inaan ku ogeysiino in ardayga <strong>{student_name}</strong> (ID: {student_id}) loo oggolaaday gelitaanka {school_name}.</p><p>Fasalka: {class}</p><p>Sanad-dugsiyeedka: {academic_year}</p><p>Fadlan la xiriir maamulka si loo dhammeystiro diiwaangelinta.</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-withdrawal-letter','Warqadda ka bixitaanka ardayga','student_clearance',
    '<h2 style="text-align:center">WARQADDA KA BIXITAANKA ARDAYGA</h2><p>Taariikh: {date}</p><p>Arday: {student_name} · ID: {student_id}</p><p>Fasal: {class}</p><p>Waalid: {parent_name}</p><p>Waxaa la diiwaangeliyey codsiga ka bixitaanka ardayga ee {school_name}. Taariikhda ugu dambeysa: __________.</p><p>Sababta: __________________</p><p>Hubinta lacagaha iyo agabka: __________________</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-parent-invitation','Casuumadda waalidka','parent_letter',
    '<h2 style="text-align:center">CASUUMAD WAALID</h2><p>Taariikh: {date}</p><p>Ku: {parent_name}</p><p>Waalid/masuul, waxaa lagugu martiqaadayaa inaad timaaddo {school_name} si aan uga wada hadalno horumarka ardayga {student_name}, fasalka {class}.</p><p>Waqtiga: __________ · Goobta: __________</p><p>Mahadsanidiin.</p><p>Maamulka dugsiga</p>'),
  makeBuiltin('builtin-parent-warning','Digniin waalidka loo diro','parent_letter',
    '<h2 style="text-align:center">OGEYSIIS / DIGNIIN WAALID</h2><p>Taariikh: {date}</p><p>Ku: {parent_name}</p><p>Arday: {student_name} · Fasal: {class}</p><p>Waxaan ku wargelinaynaa arrin u baahan wada-shaqayn iyo dabagal. Fadlan la xiriir {school_name} si xal waara loo gaaro.</p><p>Faahfaahinta: __________________</p><p>Tallaabada xigta: __________________</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-discipline-notice','Ogeysiiska anshaxa','parent_letter',
    '<h2 style="text-align:center">OGEYSIIS ANSHAX</h2><p>Taariikh: {date}</p><p>Arday: {student_name} · ID: {student_id} · Fasal: {class}</p><p>Waalid: {parent_name}</p><p>Arrinta la diiwaangeliyey: __________________</p><p>Tallaabada waxbarasho ee la qaaday: __________________</p><p>Fadlan la shaqee dugsiga si loo taageero anshaxa iyo horumarka ardayga.</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-good-conduct','Caddeynta akhlaaqda wanaagsan','certificate',
    '<h1 style="text-align:center;color:#0f766e">CADDEYNTA AKHLAAQDA WANAAGSAN</h1><p style="text-align:center">Waxaa halkan lagu caddeynayaa in</p><h2 style="text-align:center">{student_name}</h2><p style="text-align:center">Aqoonsi: {student_id} · Fasal: {class}</p><p style="text-align:center">uu muujiyey akhlaaq iyo edeb wanaagsan intii uu joogay {school_name}.</p><p style="text-align:center">Taariikh: {date}</p><p style="text-align:center">Maamule: __________________</p>'),
  makeBuiltin('builtin-absence-notice','Ogeysiiska maqnaanshaha','parent_letter',
    '<h2 style="text-align:center">OGEYSIIS MAQNAANSHAHA</h2><p>Taariikh: {date}</p><p>Waalid: {parent_name}</p><p>Arday: {student_name} · Fasal: {class}</p><p>Diiwaanka xaadirinta wuxuu muujiyey maqnaansho u baahan xaqiijin. Fadlan nala soo xiriir oo noo soo gudbi sababta maqnaanshaha.</p><p>Maalmaha: __________________</p><p>Maamulka dugsiga</p>'),
  makeBuiltin('builtin-fee-reminder','Xusuusinta lacagta dugsiga (ETB)','parent_letter',
    '<h2 style="text-align:center">XUSUUSINTA LACAGTA DUGSIGA</h2><p>Taariikh: {date}</p><p>Waalid: {parent_name}</p><p>Arday: {student_name} · Fasal: {class}</p><p>Haraaga lacagta: ETB {fee_balance}</p><p>Fadlan la xiriir xafiiska maaliyadda ee {school_name} si aad u xaqiijiso una bixiso lacagta harsan.</p><p>Mahadsanidiin.</p>'),
  makeBuiltin('builtin-teacher-appointment','Warqadda magacaabista macallinka','teacher_letter',
    '<h2 style="text-align:center">WARQADDA MAGACAABISTA MACALLINKA</h2><p>Taariikh: {date}</p><p>Ku: {teacher_name}</p><p>{school_name} waxay kuu magacaabaysaa xilka macallinnimo laga bilaabo: __________.</p><p>Maaddada / fasalka: __________________</p><p>Shuruudaha shaqada waxaa lagu faahfaahinayaa heshiiska shaqada.</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-teacher-experience','Caddeynta khibradda macallinka','teacher_letter',
    '<h2 style="text-align:center">CADDEYNTA KHIBRADDA SHAQO</h2><p>Taariikh: {date}</p><p>Waxaa la caddeynayaa in {teacher_name} uu/ay ka soo shaqeeyey {school_name}.</p><p>Jagada: __________________</p><p>Muddada shaqada: __________________</p><p>Waxqabad / waajibaad: __________________</p><p>Saxiixa iyo shaabadda: __________________</p>'),
  makeBuiltin('builtin-leave-approval','Oggolaanshaha fasaxa macallinka','teacher_letter',
    '<h2 style="text-align:center">OGGOLAANSHAHA FASAXA</h2><p>Taariikh: {date}</p><p>Macallin: {teacher_name}</p><p>Codsiga fasaxa waa la oggolaaday.</p><p>Nooca fasaxa: __________________</p><p>Laga bilaabo: __________ Ilaa: __________</p><p>Qofka beddelaya: __________________</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-recommendation','Warqadda talo-bixinta','teacher_letter',
    '<h2 style="text-align:center">WARQADDA TALO-BIXINTA</h2><p>Taariikh: {date}</p><p>Ku: Cidda ay khusayso</p><p>Waxaan si kalsooni leh ugu talinaynaa {student_name} (ID: {student_id}), oo wax ka bartay {school_name}, fasalka {class}.</p><p>Awoodaha iyo dabeecadda: __________________</p><p>Sanad-dugsiyeed: {academic_year}</p><p>Saxiixa maamulka: __________________</p>'),
  makeBuiltin('builtin-exam-result-letter','Warqadda natiijada imtixaanka','report_summary',
    '<h2 style="text-align:center">WARBIXINTA NATIIJADA IMTIXAANKA</h2><p>Arday: {student_name} · ID: {student_id}</p><p>Fasal: {class} · Xilli: {term} · Sanad: {academic_year}</p><p>Wadarta: {total_marks} · Celcelis: {average} · Darajo: {grade} · Kaalin: {rank}</p><p>Faallo: {teacher_comment}</p><p>Taariikh: {date}</p><p>Saxiixa macallinka: __________ · Maamulaha: __________</p>'),
  makeBuiltin('builtin-letter-design-classic','Warqad rasmi ah — naqshad Classic','parent_letter',
    '<h2 style="text-align:center">WARQAD RASMI AH</h2><p>{school_name}</p><p>Taariikh: {date}</p><hr/><p>Ku: {parent_name}</p><p>Ujeeddo: __________________</p><p>Arday: {student_name} · Fasal: {class}</p><p>____________________________________________</p><p>____________________________________________</p><p>Mahadsanidiin.</p><p>Saxiix: __________________</p>'),
  makeBuiltin('builtin-letter-design-modern','Warqad rasmi ah — naqshad Modern','parent_letter',
    '<div style="border-left:6px solid #0f766e;padding:10px 16px"><h2 style="color:#0f766e">WARQAD RASMI AH</h2><p>{school_name} · {date}</p></div><p>Ku: {parent_name}</p><p>Arday: {student_name} · Fasal: {class}</p><p>Ujeeddo: __________________</p><p>____________________________________________</p><p>____________________________________________</p><p>Maamulka dugsiga</p>'),
  makeBuiltin('builtin-letter-design-minimal','Warqad rasmi ah — naqshad Minimal','parent_letter',
    '<h2>WARQAD</h2><p>{school_name} · {date}</p><p>Ku: {parent_name}</p><p>Arday: {student_name} · Fasal: {class}</p><p>____________________________________________</p><p>____________________________________________</p><p>Mahadsanidiin.</p>'),
  makeBuiltin('builtin-letter-design-formal','Warqad rasmi ah — naqshad Formal','parent_letter',
    '<div style="text-align:center"><h2>{school_name}</h2><p>WARQAD RASMI AH</p><hr/></div><p>Ref: __________ · Taariikh: {date}</p><p>Ku: {parent_name}</p><p>Ujeeddo: __________________</p><p>Arday: {student_name} · Fasal: {class}</p><p>____________________________________________</p><p>____________________________________________</p><p>Si xushmad leh,</p><p>Maamulka dugsiga</p>'),
  makeBuiltin('builtin-certificate-achievement','Shahaadada guusha','certificate',
    '<div style="border:8px double #b7791f;padding:28px;text-align:center"><h1 style="color:#b7791f">SHAHAADADA GUUSHA</h1><p>Waxaa la guddoonsiinayaa</p><h1>{student_name}</h1><p>Aqoonsi: {student_id} · Fasal: {class}</p><p>Iyadoo lagu maamuusayo dadaal iyo guul waxbarasho oo heer sare ah.</p><p>{school_name} · {academic_year}</p><p>Taariikh: {date}</p><p>Maamule: __________</p></div>'),
  makeBuiltin('builtin-certificate-completion','Shahaadada dhammaystirka','certificate',
    '<h1 style="text-align:center">SHAHAADADA DHAMMAYSTIRKA</h1><p style="text-align:center">Waxaa la xaqiijinayaa in</p><h1 style="text-align:center">{student_name}</h1><p style="text-align:center">uu/ay dhammaystiray heerka waxbarasho ee {class} ee {school_name}.</p><p style="text-align:center">Sanad: {academic_year} · Taariikh: {date}</p><p style="text-align:center">Saxiix: __________</p>'),
  makeBuiltin('builtin-certificate-graduation','Shahaadada qalin-jabinta','certificate',
    '<div style="border:5px solid #0f766e;padding:24px;text-align:center"><h1>SHAHAADADA QALIN-JABINTA</h1><p>Waxaa la guddoonsiinayaa</p><h1>{student_name}</h1><p>ID: {student_id}</p><p>Maadaama uu/ay si guul leh u dhammaystiray waxbarashada {school_name}.</p><p>Sanad-dugsiyeed: {academic_year}</p><p>Taariikh: {date}</p><p>Maamule: __________</p></div>'),
  makeBuiltin('builtin-certificate-attendance','Shahaadada xaadirinta','certificate',
    '<h1 style="text-align:center">SHAHAADADA XAADIRINTA</h1><p style="text-align:center">Waxaa la guddoonsiinayaa</p><h2 style="text-align:center">{student_name}</h2><p style="text-align:center">Fasal: {class}</p><p style="text-align:center">Abaalmarin joogitaan iyo xaadirin wanaagsan.</p><p style="text-align:center">{school_name} · {academic_year}</p><p style="text-align:center">Taariikh: {date}</p>'),
  makeBuiltin('builtin-certificate-honor','Shahaadada ardayga sharafta leh','certificate',
    '<div style="text-align:center;border:4px double #92400e;padding:24px"><h1 style="color:#92400e">ARDAYGA SHARAFTA LEH</h1><h1>{student_name}</h1><p>Waxaa lagu aqoonsaday dadaal, anshax iyo waxqabad sare.</p><p>Fasal: {class} · Kaalin: {rank}</p><p>{school_name} · {date}</p><p>Saxiix: __________</p></div>'),
  makeBuiltin('builtin-certificate-sports','Shahaadada ciyaaraha','certificate',
    '<h1 style="text-align:center">SHAHAADADA CIYAARAHA</h1><h2 style="text-align:center">{student_name}</h2><p style="text-align:center">Waxaa lagu maamuusayaa ka-qaybgal iyo waxqabad ciyaareed.</p><p style="text-align:center">Nooca ciyaarta: __________________</p><p style="text-align:center">{school_name} · {date}</p><p style="text-align:center">Saxiix: __________</p>'),
  makeBuiltin('builtin-certificate-quran','Shahaadada xifdiga Qur’aanka','certificate',
    '<h1 style="text-align:center">شهادة حفظ القرآن الكريم</h1><h2 style="text-align:center">{student_name}</h2><p style="text-align:center">Waxaa lagu guddoonsiinayaa shahaadadan xifdiga Qur’aanka Kariimka ah.</p><p style="text-align:center">Qaybta / Juz: __________________</p><p style="text-align:center">{school_name} · {date}</p><p style="text-align:center">Macallinka: __________</p>'),
  makeBuiltin('builtin-certificate-participation','Shahaadada ka-qaybgalka','certificate',
    '<h1 style="text-align:center">SHAHAADADA KA-QAYBGALKA</h1><p style="text-align:center">Waxaa la guddoonsiinayaa</p><h2 style="text-align:center">{student_name}</h2><p style="text-align:center">Ka-qaybgalka barnaamijka / munaasabadda: __________________</p><p style="text-align:center">{school_name} · {date}</p>'),
  makeBuiltin('builtin-certificate-design-royal','Shahaado — naqshad Royal','certificate',
    '<div style="border:10px ridge #b7791f;padding:26px;text-align:center"><h1 style="color:#92400e">SHAHAADO</h1><p>Waxaa la guddoonsiinayaa</p><h1>{student_name}</h1><p>{school_name}</p><p>Taariikh: {date} · Sanad: {academic_year}</p><p>Maamule: __________</p></div>'),
  makeBuiltin('builtin-certificate-design-modern','Shahaado — naqshad Modern','certificate',
    '<div style="border-top:12px solid #0f766e;padding:24px;text-align:center"><h1 style="color:#0f766e">SHAHAADO</h1><h1>{student_name}</h1><p>{school_name}</p><p>Fasal: {class} · Sanad: {academic_year}</p><p>Taariikh: {date}</p><p>Saxiix: __________</p></div>'),
  makeBuiltin('builtin-certificate-design-minimal','Shahaado — naqshad Minimal','certificate',
    '<div style="text-align:center;padding:32px"><p>{school_name}</p><h1>SHAHAADO</h1><h2>{student_name}</h2><p>Waxaa lagu guddoonsiiyey aqoonsigan.</p><p>{class} · {academic_year} · {date}</p><p>__________________</p></div>'),
  makeBuiltin('builtin-id-student-front','Kaarka aqoonsiga ardayga — Front','other',
    '<div style="border:2px solid #0f766e;border-radius:12px;padding:12px;max-width:360px"><h3 style="text-align:center;color:#0f766e">{school_name}</h3><p style="text-align:center">KAARKA AQOONSIGA ARDAYGA</p><p style="text-align:center">[SAWIRKA ARDAYGA]</p><h2 style="text-align:center">{student_name}</h2><p>ID: {student_id}</p><p>Fasal: {class}</p><p>Sanad: {academic_year}</p></div>'),
  makeBuiltin('builtin-id-student-back','Kaarka aqoonsiga ardayga — Back','other',
    '<div style="border:2px solid #0f766e;border-radius:12px;padding:12px;max-width:360px"><h3 style="text-align:center">MACLUUMAADKA KAARKA</h3><p>Dugsi: {school_name}</p><p>Waalid: {parent_name}</p><p>Telefoonka waalidka: __________________</p><p>Haddii la helo, fadlan ku celi dugsiga.</p><p>Saxiixa maamulka: __________</p></div>'),
  makeBuiltin('builtin-id-teacher','Kaarka aqoonsiga macallinka','other',
    '<div style="border:2px solid #0f766e;padding:12px;max-width:360px"><h3 style="text-align:center">{school_name}</h3><h2 style="text-align:center">MACALLIN</h2><p style="text-align:center">[SAWIRKA MACALLINKA]</p><h2 style="text-align:center">{teacher_name}</h2><p>Shaqaale ID: __________</p><p>Saxiix / shaabad: __________</p></div>'),
  makeBuiltin('builtin-id-staff','Kaarka aqoonsiga shaqaalaha','other',
    '<div style="border:2px solid #334155;padding:12px;max-width:360px"><h3 style="text-align:center">{school_name}</h3><h2 style="text-align:center">SHAQAALE</h2><p style="text-align:center">[SAWIRKA SHAQAALAHA]</p><h2 style="text-align:center">{staff_name}</h2><p>Staff ID: {staff_id}</p><p>Saxiix / shaabad: __________</p></div>'),
  makeBuiltin('builtin-id-design-four','Kaarka aqoonsiga — naqshad afar','other',
    '<div style="border:3px double #0f766e;padding:14px;max-width:360px"><p style="text-align:center">{school_name}</p><h2 style="text-align:center">AQOONSI</h2><p style="text-align:center">[SAWIR]</p><h2 style="text-align:center">{student_name}</h2><p>ID: {student_id} · Fasal: {class}</p></div>'),
  makeBuiltin('builtin-report-term-classic','Report card — Term Classic','report_summary',
    '<h2 style="text-align:center">WARQADDA NATIIJADA XILLI-DUGSIYEEDKA</h2><p>Arday: {student_name} · ID: {student_id} · Fasal: {class}</p><p>Xilli: {term} · Sanad: {academic_year}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #64748b;padding:6px">Maaddada</th><th style="border:1px solid #64748b;padding:6px">Dhibco</th><th style="border:1px solid #64748b;padding:6px">Darajo</th></tr></thead><tbody><tr><td style="border:1px solid #64748b;padding:6px">________________</td><td style="border:1px solid #64748b;padding:6px">____</td><td style="border:1px solid #64748b;padding:6px">____</td></tr></tbody></table><p>Wadar: {total_marks} · Celcelis: {average} · Grade: {grade} · Kaalin: {rank}</p><p>Xaadirin: {attendance} · Faallo: {teacher_comment}</p><p>Macallin: __________ · Maamule: __________</p>'),
  makeBuiltin('builtin-report-term-modern','Report card — Term Modern','report_summary',
    '<div style="border-top:8px solid #0f766e;padding:12px"><h2 style="color:#0f766e">NATIIJADA ARDAYGA</h2><p>{school_name} · {term} · {academic_year}</p><h3>{student_name} — {class}</h3><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">Maaddo</th><th style="border:1px solid #94a3b8">Dhibco</th><th style="border:1px solid #94a3b8">Grade</th></tr><tr><td style="border:1px solid #94a3b8">________</td><td style="border:1px solid #94a3b8">____</td><td style="border:1px solid #94a3b8">____</td></tr></table><p>Celcelis: {average} · Kaalin: {rank} · Xaadirin: {attendance}</p><p>Faallo: {teacher_comment}</p></div>'),
  makeBuiltin('builtin-report-annual','Report card — Annual','report_summary',
    '<h2 style="text-align:center">WARBIXINTA SANAD-DUGSIYEEDKA</h2><p>Arday: {student_name} · ID: {student_id} · Fasal: {class}</p><p>Sanad: {academic_year}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">Xilli</th><th style="border:1px solid #94a3b8">Celcelis</th><th style="border:1px solid #94a3b8">Darajo</th></tr><tr><td style="border:1px solid #94a3b8">1</td><td style="border:1px solid #94a3b8">____</td><td style="border:1px solid #94a3b8">____</td></tr><tr><td style="border:1px solid #94a3b8">2</td><td style="border:1px solid #94a3b8">____</td><td style="border:1px solid #94a3b8">____</td></tr><tr><td style="border:1px solid #94a3b8">3</td><td style="border:1px solid #94a3b8">____</td><td style="border:1px solid #94a3b8">____</td></tr></table><p>Wadar: {total_marks} · Celcelis: {average} · Grade: {grade} · Kaalin: {rank}</p><p>Xaadirin: {attendance} · Faallo: {teacher_comment}</p>'),
  makeBuiltin('builtin-report-design-minimal','Report card — Minimal','report_summary',
    '<h2>WARQADDA NATIIJADA</h2><p>{school_name} · {academic_year} · {term}</p><p>{student_name} · {student_id} · {class}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">Maaddo</th><th style="border:1px solid #94a3b8">Dhibco</th><th style="border:1px solid #94a3b8">Grade</th></tr><tr><td style="border:1px solid #94a3b8">________</td><td style="border:1px solid #94a3b8">____</td><td style="border:1px solid #94a3b8">____</td></tr></table><p>Average: {average} · Rank: {rank} · Attendance: {attendance}</p><p>{teacher_comment}</p>'),
  makeBuiltin('builtin-payment-receipt','Rasiidka lacag-bixinta','other',
    '<h2 style="text-align:center">RASIIDKA LACAG-BIXINTA</h2><p>{school_name}</p><p>Taariikh: {date} · Rasiid No: {serial_number}</p><p>Arday: {student_name} · ID: {student_id} · Fasal: {class}</p><p>Lacagta: ETB {amount}</p><p>Ujeeddo: __________________</p><p>Habka bixinta: __________________</p><p>Qaatay: __________ · Saxiix: __________</p>'),
  makeBuiltin('builtin-exam-admit','Kaarka gelitaanka imtixaanka','other',
    '<div style="border:2px solid #0f766e;padding:18px"><h2 style="text-align:center">KAARKA GELITAANKA IMTIXAANKA</h2><p>{school_name}</p><h2>{student_name}</h2><p>ID: {student_id} · Fasal: {class}</p><p>Xilli: {term} · Sanad: {academic_year}</p><p>Imtixaan: __________________</p><p>Taariikh / Saacad: __________________</p><p>Goobta: __________________</p><p>Saxiix / shaabad: __________</p></div>'),
  makeBuiltin('builtin-class-list','Liiska ardayda fasalka','other',
    '<h2 style="text-align:center">LIISKA ARDAYDA FASALKA</h2><p>{school_name} · Fasal: {class} · {academic_year}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">#</th><th style="border:1px solid #94a3b8">Magaca ardayga</th><th style="border:1px solid #94a3b8">ID</th><th style="border:1px solid #94a3b8">Saxiix</th></tr><tr><td style="border:1px solid #94a3b8">1</td><td style="border:1px solid #94a3b8">{student_name}</td><td style="border:1px solid #94a3b8">{student_id}</td><td style="border:1px solid #94a3b8"></td></tr></table>'),
  makeBuiltin('builtin-attendance-sheet','Xaashida xaadirinta','other',
    '<h2 style="text-align:center">XAASHIDA XAADIRINTA</h2><p>{school_name} · Fasal: {class} · Taariikh: {date}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">#</th><th style="border:1px solid #94a3b8">Arday</th><th style="border:1px solid #94a3b8">Joog</th><th style="border:1px solid #94a3b8">Maqan</th><th style="border:1px solid #94a3b8">Saxiix</th></tr><tr><td style="border:1px solid #94a3b8">1</td><td style="border:1px solid #94a3b8">{student_name}</td><td style="border:1px solid #94a3b8"></td><td style="border:1px solid #94a3b8"></td><td style="border:1px solid #94a3b8"></td></tr></table>'),
  makeBuiltin('builtin-exam-timetable','Jadwalka imtixaanka','other',
    '<h2 style="text-align:center">JADWALKA IMTIXAANKA</h2><p>{school_name} · Fasal: {class} · {term} · {academic_year}</p><table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #94a3b8">Taariikh</th><th style="border:1px solid #94a3b8">Saacad</th><th style="border:1px solid #94a3b8">Maaddo</th><th style="border:1px solid #94a3b8">Qol</th></tr><tr><td style="border:1px solid #94a3b8">________</td><td style="border:1px solid #94a3b8">________</td><td style="border:1px solid #94a3b8">________</td><td style="border:1px solid #94a3b8">________</td></tr></table>')
];

const TYPE_LABELS: Record<DocType,string> = {
  transfer_letter:'Warqad wareejin', certificate:'Shahaado', parent_letter:'Warqad waalid', teacher_letter:'Warqad macallin',
  student_clearance:'Caddeyn arday', report_summary:'Soo koobid warbixin', other:'Kale'
};

function localDate(value: string, timezone?: string) {
  try { return new Intl.DateTimeFormat('en-GB',{timeZone:timezone || 'Africa/Addis_Ababa',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)); }
  catch { return new Date(value).toLocaleDateString('en-GB'); }
}


export const DocumentsView: React.FC = () => {
  const { school, user } = useAuth();
  const isAdmin = ['school_admin','super_admin'].includes(user?.role || '');
  const [documents,setDocuments] = useState<DocumentRow[]>([]);
  const [templates,setTemplates] = useState<TemplateRow[]>(BUILTIN_TEMPLATES);
  const [showArchivedTemplates,setShowArchivedTemplates] = useState(false);
  const [selected,setSelected] = useState<DocumentRow|null>(null);
  const [title,setTitle] = useState('');
  const [html,setHtml] = useState('');
  const [direction,setDirection] = useState<'ltr'|'rtl'>('ltr');
  const [pageSize,setPageSize] = useState<'A4'|'A5'|'Letter'|'CR80'>('A4');
  const [margins,setMargins] = useState(20);
  const [status,setStatus] = useState<'draft'|'final'>('draft');
  const [search,setSearch] = useState('');
  const [typeFilter,setTypeFilter] = useState('all');
  const [statusFilter,setStatusFilter] = useState('all');
  const [includeDeleted,setIncludeDeleted] = useState(false);
  const [loading,setLoading] = useState(true);
  const [saveState,setSaveState] = useState<'saved'|'saving'|'unsaved'|'error'>('saved');
  const [templateId,setTemplateId] = useState(BUILTIN_TEMPLATES[0].id);
  const [showTemplates,setShowTemplates] = useState(false);
  const [templateTitle,setTemplateTitle] = useState('');
  const [templateHtml,setTemplateHtml] = useState('');
  const [editingTemplateId,setEditingTemplateId] = useState<string|null>(null);
  const [templateType,setTemplateType] = useState<DocType>('transfer_letter');
  const [classes,setClasses] = useState<any[]>([]);
  const [classId,setClassId] = useState('');
  const [studentId,setStudentId] = useState('');
  const [showGenerate,setShowGenerate] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [generateWarnings,setGenerateWarnings] = useState<any[]>([]);
  const [previewHtml,setPreviewHtml] = useState('');
  const [previewMissing,setPreviewMissing] = useState<string[]>([]);
  const [previewStudent,setPreviewStudent] = useState('');
  const [message,setMessage] = useState('');
  const [versions,setVersions] = useState<any[]>([]);
  const [auditEvents,setAuditEvents] = useState<any[]>([]);
  const [attachments,setAttachments] = useState<any[]>([]);
  const [showHistory,setShowHistory] = useState(false);
  const [showAudit,setShowAudit] = useState(false);
  const [attachmentBusy,setAttachmentBusy] = useState(false);
  const [permissions,setPermissions] = useState<any[]>([]);
  const [showPermissions,setShowPermissions] = useState(false);
  const [permissionUserId,setPermissionUserId] = useState('');
  const [permissionRole,setPermissionRole] = useState('teacher');
  const [permissionCanEdit,setPermissionCanEdit] = useState(false);
  const [permissionCanDownload,setPermissionCanDownload] = useState(false);
  const savedSnapshot = useRef({title:'',html:''});
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ApiClient.getDocuments({search,type:typeFilter,status:statusFilter,includeDeleted});
      setDocuments(result as DocumentRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Dukumentiyada lama soo dejin karin.');
    } finally { setLoading(false); }
  },[search,typeFilter,statusFilter,includeDeleted]);

  const loadTemplates = useCallback(async () => {
    try {
      const saved = await ApiClient.getDocumentTemplates(showArchivedTemplates) as TemplateRow[];
      setTemplates([...BUILTIN_TEMPLATES,...saved]);
    } catch { setTemplates(BUILTIN_TEMPLATES); }
  },[showArchivedTemplates]);

  useEffect(() => { void loadDocuments(); },[loadDocuments]);
  useEffect(() => { if(isAdmin) void loadTemplates(); },[loadTemplates,isAdmin]);
  useEffect(() => { if(isAdmin) void ApiClient.getClasses().then(setClasses).catch(()=>setClasses([])); },[isAdmin]);

  const markDirty = useCallback((nextTitle: string, nextHtml: string, nextDirection = direction, nextPageSize = pageSize, nextMargins = margins) => {
    dirtyRef.current = nextTitle !== savedSnapshot.current.title || nextHtml !== savedSnapshot.current.html || nextDirection !== (selected?.direction || 'ltr') || nextPageSize !== (selected?.pageSize || 'A4') || nextMargins !== (selected?.pageMargins || 20);
    setSaveState(dirtyRef.current ? 'unsaved' : 'saved');
  },[direction,pageSize,margins,selected]);

  const saveNow = useCallback(async () => {
    if (!selected || !dirtyRef.current || savingRef.current) return;
    const nextTitle = title.trim() || 'Dukumenti aan cinwaan lahayn';
    const nextHtml = html;
    const patch: Record<string,unknown> = {};
    if (nextTitle !== savedSnapshot.current.title) patch.title = nextTitle;
    if (nextHtml !== savedSnapshot.current.html) patch.contentHtml = nextHtml;
    if (direction !== (selected.direction || 'ltr')) patch.direction = direction;
    if (pageSize !== (selected.pageSize || 'A4')) patch.pageSize = pageSize;
    if (margins !== (selected.pageMargins || 20)) patch.pageMargins = margins;
    if (!Object.keys(patch).length) { dirtyRef.current = false; setSaveState('saved'); return; }
    savingRef.current = true;
    setSaveState('saving');
    try {
      const updated = await ApiClient.updateDocument(selected.id,patch) as DocumentRow;
      savedSnapshot.current = {title:nextTitle,html:nextHtml};
      dirtyRef.current = false;
      setTitle(nextTitle);
      setSelected(current => current ? {...current,...updated} : current);
      setSaveState('saved');
      setDocuments(current => current.map(item => item.id === selected.id ? {...item,...updated} : item));
    } catch (error) {
      setSaveState('error');
      setMessage(error instanceof Error ? error.message : 'Kaydintu way fashilantay.');
    } finally { savingRef.current = false; }
  },[selected,title,html,direction,pageSize,margins]);

  useEffect(() => {
    if (!selected || !dirtyRef.current) return;
    const timer = window.setTimeout(() => { void saveNow(); },1500);
    return () => window.clearTimeout(timer);
  },[title,html,direction,pageSize,margins,selected,saveNow]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload',protect);
    return () => window.removeEventListener('beforeunload',protect);
  },[]);

  const openDocument = async (item: DocumentRow) => {
    if (dirtyRef.current) await saveNow();
    try {
      const full = await ApiClient.getDocument(item.id) as DocumentRow;
      setSelected(full);
      setTitle(full.title);
      setHtml(full.contentHtml || '');
      setDirection(full.direction || 'ltr');
      setPageSize(full.pageSize || 'A4');
      setMargins(full.pageMargins || 20);
      setStatus(full.status || 'draft');
      savedSnapshot.current = {title:full.title,html:full.contentHtml || ''};
      dirtyRef.current = false;
      setSaveState('saved');
      setMessage('');
      void ApiClient.getDocumentVersions(full.id).then(setVersions).catch(()=>setVersions([]));
      void ApiClient.getDocumentAudit(full.id).then(setAuditEvents).catch(()=>setAuditEvents([]));
      if (isAdmin) void ApiClient.getDocumentPermissions(full.id).then(setPermissions).catch(()=>setPermissions([]));
      else setPermissions([]);
      if (full.studentId) void ApiClient.getStudentDocumentAttachments(full.studentId).then(setAttachments).catch(()=>setAttachments([]));
      else setAttachments([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dukumentiga lama furi karin.'); }
  };

  const createDocument = async (template?: TemplateRow) => {
    try {
      const source = applySchoolBrandColor(template?.contentHtml || '<h2>Dukumenti cusub</h2><p>Halkan ka bilow qoraalkaaga…</p>', school?.brandColor);
      const created = await ApiClient.createDocument({
        title:template?.title || 'Dukumenti cusub',
        documentType:template?.documentType || 'other',
        contentHtml:source,
        templateId:template?.isBuiltin ? undefined : template?.id,
        status:'draft',pageSize:'A4',direction:'ltr',pageMargins:20
      }) as DocumentRow;
      await loadDocuments();
      await openDocument(created);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dukumenti lama abuuri karin.'); }
  };

  const duplicateDocument = async (id:string) => {
    try { await ApiClient.duplicateDocument(id); await loadDocuments(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nuqul lama samayn karin.'); }
  };
  const deleteDocument = async (id:string) => {
    if (!window.confirm('Ma hubtaa inaad dukumentigan tirtirayso?')) return;
    try {
      await ApiClient.deleteDocument(id);
      if (selected?.id === id) { setSelected(null); dirtyRef.current = false; }
      await loadDocuments();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dukumentiga lama tirtiri karin.'); }
  };
  const restoreDocument = async (id:string) => {
    try { await ApiClient.restoreDocument(id); await loadDocuments(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Dukumentiga lama soo celin karin.'); }
  };

  const selectedTemplate = useMemo(() => templates.find(item => item.id === templateId && !item.deletedAt) || templates.find(item => !item.deletedAt) || BUILTIN_TEMPLATES[0],[templates,templateId]);
  const saveTemplate = async () => {
    if (!templateTitle.trim() || !templateHtml.trim()) return;
    try {
      if (editingTemplateId) await ApiClient.updateDocumentTemplate(editingTemplateId,{title:templateTitle.trim(),documentType:templateType,contentHtml:templateHtml});
      else await ApiClient.createDocumentTemplate({title:templateTitle.trim(),documentType:templateType,contentHtml:templateHtml});
      setEditingTemplateId(null); setTemplateTitle(''); setTemplateHtml(''); await loadTemplates(); setMessage('Template-ka waa la kaydiyey.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Template-ka lama kaydin karin.'); }
  };
  const duplicateTemplate = async (template:TemplateRow) => {
    try {
      if (template.isBuiltin) {
        setEditingTemplateId(null);
        setTemplateTitle(template.title + ' — nuqul');
        setTemplateHtml(template.contentHtml);
        setTemplateType(template.documentType);
      } else {
        await ApiClient.duplicateDocumentTemplate(template.id);
        await loadTemplates();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Template-ka lama koobi karin.'); }
  };

  const deleteTemplate = async (id:string) => {
    if (!window.confirm('Template-kan ma u raraysaa kaydka? Waad soo celin kartaa mar dambe.')) return;
    try { await ApiClient.deleteDocumentTemplate(id); await loadTemplates(); if (editingTemplateId===id) setEditingTemplateId(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Template-ka lama tirtiri karin.'); }
  };

  const restoreTemplate = async (id:string) => {
    try {
      await ApiClient.restoreDocumentTemplate(id);
      await loadTemplates();
      setMessage('Template-ka waa laga soo celiyey kaydka.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Template-ka lama soo celin karin.'); }
  };

  const previewGeneration = async () => {
    try {
      const result = await ApiClient.previewDocumentGeneration({templateHtml:applySchoolBrandColor(selectedTemplate.contentHtml,school?.brandColor),templateId:selectedTemplate.isBuiltin ? undefined : selectedTemplate.id,studentId:studentId || undefined,classId:classId || undefined});
      setPreviewHtml(result.html || ''); setPreviewMissing(result.missing || []); setPreviewStudent(result.studentName || '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Horudhaca lama diyaarin karin.'); }
  };

  const generate = async () => {
    setGenerating(true); setGenerateWarnings([]);
    const input = {
      templateHtml:applySchoolBrandColor(selectedTemplate.contentHtml,school?.brandColor),
      templateId:selectedTemplate.isBuiltin ? undefined : selectedTemplate.id,
      title:selectedTemplate.title,
      documentType:selectedTemplate.documentType,
      classId:classId || undefined,
      studentIds:studentId ? [studentId] : undefined
    };
    try {
      let result = await ApiClient.generateDocuments(input) as {documents:DocumentRow[];warnings:any[];requiresConfirmation?:boolean};
      if (result.requiresConfirmation) {
        const warnings = result.warnings || [];
        setGenerateWarnings(warnings);
        const affected = warnings.length;
        const missing = [...new Set(warnings.flatMap(warning => warning.missing || []))];
        const proceed = window.confirm(
          'Xog ayaa ka maqan ' + affected + ' arday. Dukumentiyada weli lama kaydin. Xogta maqan: ' +
          missing.join(', ') + '. Ma sii wadaysaa adigoo og in meelahaas ay madhnaan doonaan?'
        );
        if (!proceed) {
          setMessage('Samaynta waa la joojiyey; wax dukumenti ah lama kaydin.');
          return;
        }
        result = await ApiClient.generateDocuments({...input,confirmMissing:true}) as {documents:DocumentRow[];warnings:any[];requiresConfirmation?:boolean};
      }
      setGenerateWarnings(result.warnings || []);
      setMessage('Waxaa la sameeyey ' + (result.documents?.length || 0) + ' dukumenti.');
      setShowGenerate((result.warnings || []).length > 0);
      await loadDocuments();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dukumentiyada lama abuuri karin.'); }
    finally { setGenerating(false); }
  };

  const uploadImage = async (file:File) => {
    const result = await ApiClient.uploadDocumentImage(file);
    return result.url;
  };

  const startTemplateFromSelected = () => {
    setTemplateTitle(selectedTemplate.title + ' — nuqul');
    setTemplateHtml(selectedTemplate.contentHtml);
    setTemplateType(selectedTemplate.documentType);
    setShowTemplates(true);
  };

  return (
    <div className="documents-view mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Files className="h-6 w-6 text-teal-700" /><h1 className="text-2xl font-bold text-slate-900">Dukumentiyada</h1></div><p className="mt-1 text-sm text-slate-500">Qor, habee, samee oo daabac waraaqaha dugsiga.</p></div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <><button type="button" onClick={() => setShowGenerate(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal-700 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50"><WandSparkles size={16}/> U samee arday</button>
          <button type="button" onClick={() => setShowTemplates(value=>!value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><LayoutTemplate size={16}/> Qaab-dhismeedyo</button>
          <button type="button" onClick={() => void createDocument()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16}/> Dukumenti cusub</button></>}
        </div>
      </div>

      {message && <div role="status" className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"><span>{message}</span><button type="button" aria-label="Xir fariinta" onClick={()=>setMessage('')}><X size={16}/></button></div>}

      {isAdmin && showTemplates && <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <div><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Dooro template</h2><button type="button" onClick={()=>setShowArchivedTemplates(value=>!value)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{showArchivedTemplates?'Qari kuwa kaydsan':'Tus kuwa kaydsan'}</button></div><div className="space-y-2">{templates.map(template=><div key={template.id} className={'flex items-center justify-between gap-2 rounded-lg border p-2 ' + (template.id===templateId?'border-teal-500 bg-teal-50':'border-slate-200')}><button type="button" disabled={!!template.deletedAt} onClick={()=>setTemplateId(template.id)} className="min-w-0 flex-1 text-left text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{template.title}<span className="block text-xs text-slate-500">{TYPE_LABELS[template.documentType]}{template.deletedAt?' · Kaydsan':''}</span></button><>{!template.isBuiltin && !template.deletedAt && <><button type="button" aria-label="Wax ka beddel template" onClick={()=>{setEditingTemplateId(template.id);setTemplateTitle(template.title);setTemplateHtml(template.contentHtml);setTemplateType(template.documentType);}} className="rounded-md px-2 py-1 text-xs text-teal-700 hover:bg-teal-50">Wax ka beddel</button><button type="button" aria-label="Kaydi template" onClick={()=>void deleteTemplate(template.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" title="U rar kaydka"><Trash2 size={14}/></button><button type="button" aria-label="Nuqul ka samee template" title="Nuqul ka samee" onClick={()=>void duplicateTemplate(template)} className="rounded-md p-2 hover:bg-slate-100"><Copy size={15}/></button></>}{!template.isBuiltin && template.deletedAt && <button type="button" aria-label="Soo celi template" onClick={()=>void restoreTemplate(template.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50">Soo celi</button>}</></div>)}</div><button type="button" disabled={!!selectedTemplate.deletedAt} onClick={()=>void createDocument(selectedTemplate)} className="mt-3 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Ka samee dukumenti</button></div>
        <div><h2 className="mb-3 font-bold text-slate-900">{editingTemplateId?'Wax ka beddel template':'Samee template cusub'}</h2><label className="mb-2 block text-xs font-semibold text-slate-600">Magaca template-ka<input value={templateTitle} onChange={event=>setTemplateTitle(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label><label className="mb-2 block text-xs font-semibold text-slate-600">Nooca<select value={templateType} onChange={event=>setTemplateType(event.target.value as DocType)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">{Object.entries(TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600">Qoraalka template-ka<textarea rows={7} value={templateHtml} onChange={event=>setTemplateHtml(event.target.value)} placeholder="<p>Magaca ardayga: {student_name}</p>" className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs" /></label><p className="mt-1 text-xs text-slate-500">Doorsoomayaal: {'{student_name}'} · {'{student_id}'} · {'{class}'} · {'{parent_name}'} · {'{date}'} · {'{school_name}'} · {'{teacher_name}'} · {'{term}'} · {'{academic_year}'} · {'{total_marks}'} · {'{average}'} · {'{grade}'} · {'{rank}'} · {'{attendance}'} · {'{teacher_comment}'} · {'{fee_balance}'} · {'{staff_name}'} · {'{staff_id}'}</p><button type="button" onClick={()=>void saveTemplate()} className="mt-3 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Kaydi template-ka</button></div>
      </section>}

      {isAdmin && showGenerate && <section className="rounded-xl border border-teal-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">U samee arday</h2><button type="button" aria-label="Xir" onClick={()=>setShowGenerate(false)}><X size={18}/></button></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Template<select value={templateId} onChange={event=>setTemplateId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{templates.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Fasal<select value={classId} onChange={event=>{setClassId(event.target.value);setStudentId('');}} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Dooro fasal (dhammaan ardayda fasalka)</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name} {item.section || ''}</option>)}</select></label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Ama hal arday (haddii la doorto fasalka waa la iska indhatirayaa)<input value={studentId} onChange={event=>{setStudentId(event.target.value);if(event.target.value.trim())setClassId('');}} placeholder="Geli aqoonsiga ardayga" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label></div>
        <p className="mt-2 text-xs text-slate-500">Xogta ardayga waxaa si toos ah looga soo qaadanayaa diiwaanka dugsiga. Meelaha xogtoodu maqan tahay waxaa lagu soo bandhigayaa digniin.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!classId && !studentId} onClick={()=>void previewGeneration()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Eeg horudhac</button><button type="button" disabled={generating || (!classId && !studentId)} onClick={()=>void generate()} className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{generating?'Waa la samaynayaa…':'Samee dukumentiyada'}</button></div>
        {previewHtml && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-xs font-semibold text-slate-600">Horudhac: {previewStudent}</p><div className="max-h-64 overflow-auto bg-white p-4 text-sm" dangerouslySetInnerHTML={{__html:sanitizeDocumentHtml(previewHtml)}} />{previewMissing.length>0 && <p className="mt-2 text-xs text-amber-800">Xog maqan: {previewMissing.join(', ')}</p>}</div>}
        {generateWarnings.length>0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">{generateWarnings.map((warning,index)=><li key={index}>{warning.studentName}: xog maqan — {warning.missing.join(', ')}</li>)}</ul>}
      </section>}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-slate-400"/><input aria-label="Raadi dukumentiyada" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Raadi dukumenti…" className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"/></div>
          <div className="mb-3 grid grid-cols-2 gap-2"><select aria-label="Kala saar nooca" value={typeFilter} onChange={event=>setTypeFilter(event.target.value)} className="min-h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs"><option value="all">Nooc kasta</option>{Object.entries(TYPE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select aria-label="Kala saar xaaladda" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="min-h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs"><option value="all">Xaalad kasta</option><option value="draft">Qabyo</option><option value="final">Dhammaad</option></select></div>
          {isAdmin && <label className="mb-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeDeleted} onChange={event=>setIncludeDeleted(event.target.checked)}/> Tus kuwa la tirtiray</label>}
          <div className="max-h-[68vh] space-y-1 overflow-y-auto">
            {loading && <p className="p-3 text-sm text-slate-500">Waa la soo dejinayaa…</p>}
            {!loading && documents.length===0 && <p className="p-3 text-sm text-slate-500">Weli dukumenti ma jiro.</p>}
            {documents.map(item=><div key={item.id} className={'rounded-lg border p-2 ' + (selected?.id===item.id?'border-teal-500 bg-teal-50':'border-transparent hover:bg-slate-50')}>
              <button type="button" onClick={()=>void openDocument(item)} className="block w-full min-w-0 text-left"><span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-[11px] text-slate-500">{TYPE_LABELS[item.documentType] || TYPE_LABELS.other} · {item.status==='final'?'Dhammaad':'Qabyo'} · {localDate(item.updatedAt,school?.timezone)}</span></button>
              {isAdmin && <div className="mt-1 flex gap-1">{item.deletedAt ? <button type="button" aria-label="Soo celi dukumentiga" onClick={()=>void restoreDocument(item.id)} className="rounded p-1.5 text-teal-700 hover:bg-teal-100"><RotateCcw size={14}/></button> : <><button type="button" aria-label="Nuqul ka samee dukumentiga" onClick={()=>void duplicateDocument(item.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Copy size={14}/></button><button type="button" aria-label="Tirtir dukumentiga" onClick={()=>void deleteDocument(item.id)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 size={14}/></button></>}</div>}
            </div>)}
          </div>
        </aside>

        <main className="min-w-0">
          {!selected ? <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><FileText size={42} className="mb-3 text-slate-300"/><h2 className="font-bold text-slate-700">Dooro dukumenti ama mid cusub samee</h2><p className="mt-1 max-w-md text-sm text-slate-500">Dukumentiyada waxaa loo kaydiyaa si gaar ah dugsigan.</p></div> :
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <input aria-label="Cinwaanka dukumentiga" value={title} disabled={(!isAdmin && !selected.canEdit) || Boolean(selected.lockedAt) || status==='final'} onChange={event=>{setTitle(event.target.value);markDirty(event.target.value,html);}} className="min-h-10 min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold"/>
              {isAdmin && <select aria-label="Xaaladda dukumentiga" value={status} disabled={Boolean(selected.lockedAt) || status==='final'} onChange={async event=>{const next=event.target.value as 'draft'|'final';try{await saveNow();if(dirtyRef.current)return;const result=await ApiClient.updateDocument(selected.id,{status:next});setSelected(result);setStatus(next);await loadDocuments();}catch(error){setMessage(error instanceof Error?error.message:'Xaaladda lama beddeli karin.');}}} className="min-h-10 rounded-lg border border-slate-200 px-2 text-xs"><option value="draft">Qabyo</option><option value="final">Dhammaad</option></select>}
              <span className="min-w-16 text-xs text-slate-500" role="status">{saveState==='saving'?'Waa la kaydinayaa…':saveState==='error'?'Kaydintu way fashilantay':saveState==='unsaved'?'Isbeddel lama kaydin':'Waa kaydsan yahay'}</span>
              {(isAdmin || selected.canEdit) && <button type="button" onClick={()=>void saveNow()} disabled={Boolean(selected.lockedAt) || status==='final'} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-40"><Save size={14}/> Kaydi</button>}

              {isAdmin && <button type="button" onClick={()=>{setShowHistory(value=>!value);setShowAudit(false);void ApiClient.getDocumentVersions(selected.id).then(setVersions).catch(error=>setMessage(error.message));}} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><History size={14}/> Taariikh</button>}
              {isAdmin && <button type="button" onClick={()=>{setShowAudit(value=>!value);setShowHistory(false);void ApiClient.getDocumentAudit(selected.id).then(setAuditEvents).catch(error=>setMessage(error.message));}} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><ShieldCheck size={14}/> Audit</button>}
              {isAdmin && (selected.lockedAt || status==='final' ? <button type="button" onClick={async()=>{try{const result=await ApiClient.unlockDocument(selected.id);setSelected(result);setStatus('draft');await loadDocuments();setMessage('Dukumentiga waa la furay.');}catch(error){setMessage(error instanceof Error?error.message:'Dukumentiga lama furi karin.');}}} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800"><Unlock size={14}/> Fur</button> : <button type="button" onClick={async()=>{try{await saveNow();if(dirtyRef.current)return;const result=await ApiClient.lockDocument(selected.id,'Manually locked');setSelected(result);await loadDocuments();setMessage('Dukumentiga waa la xiray.');}catch(error){setMessage(error instanceof Error?error.message:'Dukumentiga lama xiri karin.');}}} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><Lock size={14}/> Xir</button>)}

              <button type="button" disabled={!isAdmin && !selected.canDownload} onClick={()=>window.print()} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white disabled:opacity-40"><Printer size={14}/> Daabac / PDF</button>
              {isAdmin && <button type="button" onClick={startTemplateFromSelected} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><Copy size={14}/> Template ka dhig</button>}
            </div>


            {isAdmin && <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-800">Ogolaanshaha dukumentiga</h3><button type="button" onClick={()=>{setShowPermissions(value=>!value);if(!showPermissions)void ApiClient.getDocumentPermissions(selected.id).then(setPermissions).catch(error=>setMessage(error.message));}} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">{showPermissions?'Qari':'Maamul ogolaanshaha'}</button></div>
              {showPermissions && <><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">User ID (ikhtiyaari)<input value={permissionUserId} onChange={event=>setPermissionUserId(event.target.value)} placeholder="Geli user ID ama dooro role" className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Role<select value={permissionRole} onChange={event=>setPermissionRole(event.target.value)} disabled={Boolean(permissionUserId.trim())} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"><option value="teacher">Teacher</option><option value="accountant">Accountant</option></select></label></div><div className="mt-2 flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={permissionCanEdit} onChange={event=>setPermissionCanEdit(event.target.checked)}/> Wax ka beddel</label><label className="flex items-center gap-1"><input type="checkbox" checked={permissionCanDownload} onChange={event=>setPermissionCanDownload(event.target.checked)}/> Download</label></div><button type="button" onClick={async()=>{try{await ApiClient.setDocumentPermission(selected.id,{userId:permissionUserId.trim()||undefined,role:permissionUserId.trim()?undefined:permissionRole,canView:true,canEdit:permissionCanEdit,canDownload:permissionCanDownload});setPermissionUserId('');setPermissions(await ApiClient.getDocumentPermissions(selected.id));setMessage('Ogolaanshaha waa la kaydiyey.');}catch(error){setMessage(error instanceof Error?error.message:'Ogolaanshaha lama kaydin karin.');}}} className="mt-3 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white">Ku dar ogolaansho</button><div className="mt-3 space-y-2">{permissions.map(permission=><div key={permission.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"><div className="text-xs"><p className="font-semibold">{permission.userId?'User: '+permission.userId:'Role: '+permission.role}</p><p className="text-slate-500">{permission.canView?'Akhris':''} {permission.canEdit?'· Wax-ka-beddel':''} {permission.canDownload?'· Download':''}</p></div><button type="button" onClick={async()=>{try{await ApiClient.deleteDocumentPermission(selected.id,permission.id);setPermissions(await ApiClient.getDocumentPermissions(selected.id));}catch(error){setMessage(error instanceof Error?error.message:'Ogolaanshaha lama tirtiri karin.');}}} className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700">Ka saar</button></div>)}</div></>}
            </section>}
            {isAdmin && showHistory && <section className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800"><History size={16}/> Taariikhda versions</h3>{versions.length===0?<p className="text-sm text-slate-500">Weli version hore ma jiro.</p>:<div className="max-h-64 space-y-2 overflow-auto">{versions.map(version=><div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"><div><p className="text-sm font-semibold">Version {version.versionNumber} · {version.title}</p><p className="text-xs text-slate-500">{localDate(version.createdAt,school?.timezone)} · {version.status==='final'?'Final':'Qabyo'}</p></div><button type="button" disabled={Boolean(selected.lockedAt)||status==='final'} onClick={async()=>{if(!window.confirm('Ma soo celinaysaa version-kan? Isbeddelka hadda jira wuxuu noqonayaa version cusub.'))return;try{const result=await ApiClient.restoreDocumentVersion(selected.id,version.id);setSelected(result);setTitle(result.title);setHtml(result.contentHtml||'');setStatus(result.status);savedSnapshot.current={title:result.title,html:result.contentHtml||''};dirtyRef.current=false;setSaveState('saved');setVersions(await ApiClient.getDocumentVersions(selected.id));await loadDocuments();setMessage('Version-ka waa la soo celiyey.');}catch(error){setMessage(error instanceof Error?error.message:'Version-ka lama soo celin karin.');}}} className="rounded-lg border border-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-800 disabled:opacity-40">Soo celi</button></div>)}</div>}</section>}
            {isAdmin && showAudit && <section className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800"><ShieldCheck size={16}/> Audit log</h3>{auditEvents.length===0?<p className="text-sm text-slate-500">Audit event ma jiro.</p>:<div className="max-h-64 space-y-2 overflow-auto">{auditEvents.map(event=><div key={event.id} className="rounded-lg border border-slate-100 p-2"><p className="text-sm font-semibold">{event.action}</p><p className="text-xs text-slate-500">{localDate(event.createdAt,school?.timezone)} · {event.actorUserId||'System'}</p></div>)}</div>}</section>}
            {isAdmin && selected.studentId && <section className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800"><Paperclip size={16}/> Lifaaqyada ardayga</h3><div className="mb-3 flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white">{attachmentBusy?'Waa la soo gelinayaa…':'Ku dar PDF / sawir'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={attachmentBusy} className="hidden" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setAttachmentBusy(true);try{await ApiClient.uploadStudentDocumentAttachment(selected.studentId!,file);setAttachments(await ApiClient.getStudentDocumentAttachments(selected.studentId!));setMessage('Lifaaqa waa la kaydiyey.');}catch(error){setMessage(error instanceof Error?error.message:'Lifaaqa lama soo gelin karin.');}finally{setAttachmentBusy(false);event.target.value='';}}}/></label><span className="text-xs text-slate-500">PDF, JPG, PNG ama WebP · ugu badnaan 10 MB</span></div>{attachments.length===0?<p className="text-sm text-slate-500">Ardaygani weli lifaaq ma leh.</p>:<div className="space-y-2">{attachments.map(file=><div key={file.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{file.fileName}</p><p className="text-xs text-slate-500">{Math.ceil(file.fileSize/1024)} KB · {localDate(file.createdAt,school?.timezone)}</p></div><div className="flex gap-1"><a href={ApiClient.studentDocumentAttachmentDownloadUrl(selected.studentId!,file.id)} className="rounded p-2 text-teal-700" aria-label="Soo dejiso lifaaqa"><Download size={15}/></a><button type="button" onClick={async()=>{if(!window.confirm('Ma tirtiraysaa lifaaqan?'))return;try{await ApiClient.deleteStudentDocumentAttachment(selected.studentId!,file.id);setAttachments(await ApiClient.getStudentDocumentAttachments(selected.studentId!));}catch(error){setMessage(error instanceof Error?error.message:'Lifaaqa lama tirtiri karin.');}}} className="rounded p-2 text-rose-600" aria-label="Tirtir lifaaqa"><Trash2 size={15}/></button></div></div>)}</div>}</section>}
            {(selected.lockedAt || status==='final') ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="flex items-center gap-2 font-bold"><Lock size={16}/> Dukumentigan waa la xiray</p><p className="mt-1">Wax ka beddelka waa la xannibay. Riix “Fur” si aad ugu celiso qabyo una sii waddo tafatirka.</p>{selected.lockReason && <p className="mt-1 text-xs">Sabab: {selected.lockReason}</p>}</div> : (isAdmin || selected.canEdit) ? <>
              <DocumentEditor html={html} onChange={value=>{setHtml(value);markDirty(title,value);}} onSaveNow={saveNow} direction={direction} onDirectionChange={value=>{setDirection(value);markDirty(title,html,value,pageSize,margins);}} pageSize={pageSize} onPageSizeChange={value=>{setPageSize(value);markDirty(title,html,direction,value,margins);}} margins={margins} onMarginsChange={value=>{setMargins(value);markDirty(title,html,direction,pageSize,value);}} school={school} onUploadImage={uploadImage} canUploadImage={isAdmin}/>
              {(isAdmin || selected.canDownload) && <DocumentFileTools html={html} title={title} onImport={value=>{setHtml(value);markDirty(title,value);}}/>}
            </> : <div className="min-h-[420px] rounded-xl border border-slate-200 bg-white p-5" dir={direction} style={{padding: margins+'mm'}}><div className="mx-auto max-w-[800px] bg-white" dangerouslySetInnerHTML={{__html:sanitizeDocumentHtml(html)}}/></div>}

          </div>}
        </main>
      </div>
    </div>
  );
};
