import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const widths = [360, 390, 768, 1280];
const themes = ['light', 'dark'] as const;
const steps = [
  { id: 'profile', title: 'Macluumaadka dugsiga', description: 'Magaca dugsiga, koodhka, maamulaha iyo xiriirka.' },
  { id: 'year', title: 'Sanad dugsiyeed & Terms', description: 'Sannad-dugsiyeedka iyo taariikhaha semester-yada.' },
  { id: 'classes', title: 'Classes & Sections', description: 'Fasallada, grades iyo sections-ka.' },
  { id: 'subjects', title: 'Subjects & Curriculum', description: 'Maaddooyinka iyo periods-ka fasal kasta.' },
  { id: 'teachers', title: 'Macallimiinta', description: 'Macallimiinta iyo aqoonsigooda.' },
  { id: 'assign', title: 'Teacher Assignment', description: 'Form Teacher iyo macallinka maaddo kasta.' },
  { id: 'students', title: 'Students & Parents', description: 'Ardayda iyo xiriirka waalidka.' },
  { id: 'timetable', title: 'Timetable', description: 'Maalmaha, periods-ka iyo jadwalka.' },
  { id: 'finish', title: 'Hubinta ugu dambaysa & Dashboard', description: 'Tirada xogta iyo diyaar-garowga Dashboard-ka.' }
];

function referenceCard(id: string, title: string, description: string) {
  const bodies: Record<string, string> = {
    profile: '<div class="row"><label>Magaca dugsiga<input value="SchoolOS Test Academy"></label><label>Koodhka dugsiga<input value="JIG-001"></label><label>Magaca maamulaha<input value="Amina Ahmed"></label><label>Telefoonka<input value="+251911000001"></label><label>Email<input value="office@example.test"></label><label>Magaalada / Gobolka<input value="Jijiga"></label></div>',
    year: '<div class="row"><label>Magaca sannadka<input value="2026/2027"></label><label>Bilowga<input type="date" value="2026-09-01"></label><label>Dhammaadka<input type="date" value="2027-06-30"></label><label>Tirada terms<select><option>2 Semesters</option></select></label></div><div class="item"><span>Semester 1 · 2026-09-01 → 2027-01-20</span></div><div class="item"><span>Semester 2 · 2027-02-01 → 2027-06-30</span></div>',
    classes: '<div class="row"><label>Magaca fasalka<input placeholder="Grade 4"></label><label>Section<input value="A"></label><button class="btn">+ Ku dar fasal</button></div><div class="item"><span>Grade 4 · Section A</span><button class="x">×</button></div><div class="item"><span>Grade 5 · Section A</span><button class="x">×</button></div>',
    subjects: '<div class="row"><label>Maaddada<input value="Mathematics"></label><label>Fasalka<select><option>Grade 4 · A</option></select></label><label>Periods usbuucii<input type="number" value="5"></label><button class="btn">+ Ku dar maaddo</button></div><div class="item"><span>Mathematics · 5 periods · Grade 4 A</span><button class="x">×</button></div><div class="item"><span>Environmental Science · 4 periods · Grade 4 A</span><button class="x">×</button></div>',
    teachers: '<div class="row"><label>Magaca macallinka<input value="Amina Teacher"></label><label>Teacher ID<input value="TCH-001"></label><label>Telefoon<input value="+251911000001"></label><button class="btn">+ Ku dar macallin</button></div><div class="item"><span>Amina Teacher · TCH-001</span><button class="x">×</button></div>',
    assign: '<b>Form Teacher (hal fasal kasta)</b><div class="item"><span>Grade 4 · A</span><select><option>Amina Teacher</option></select></div><b>Macallinka maaddo kasta</b><div class="item"><span>Grade 4 · Mathematics</span><select><option>Amina Teacher</option></select></div><div class="load">Culayska macallinka: 5 / 30 periods</div>',
    students: '<div class="row"><label>Magaca ardayga<input value="Ayaan Test Student"></label><label>Fasalka<select><option>Grade 4 · A</option></select></label><label>Telefoonka waalidka<input value="+251911000002"></label><button class="btn">+ Ku dar arday</button></div><div class="item"><span>Ayaan Test Student · Grade 4 A</span><button class="x">×</button></div><div class="item"><span>Bilal Student · Grade 4 A</span><button class="x">×</button></div>',
    timetable: '<div class="row"><label>Maalinta<select><option>Monday</option></select></label><label>Period<input value="1"></label><label>Fasalka<select><option>Grade 4 · A</option></select></label><label>Maaddada<select><option>Mathematics</option></select></label><button class="btn">+ Ku dar slot</button></div><div class="item"><span>Monday · P1 · Grade 4 A · Mathematics</span><button class="x">×</button></div>',
    finish: '<div class="stats"><div><b>1</b>Fasal</div><div><b>2</b>Maaddo</div><div><b>1</b>Macallin</div><div><b>3</b>Arday</div><div><b>3</b>Timetable slot</div></div><p class="good">Dhammaan tallaabooyinka khasabka ah waa diyaar.</p><button class="btn">Dhammee setup-ka</button>'
  };
  return '<main><h2>' + title + '</h2><p class="sub">' + description + '</p><div class="miss good"><b>Tallaabadan waa diyaar ✓</b></div><div class="card">' + bodies[id] + '</div><div class="foot"><button class="btn sec">← Hore</button><button class="btn">Xiga →</button></div></main>';
}

function makeReferenceHtml(source: string, theme: string, index: number) {
  const nav = '<nav class="steps" id="nav" aria-label="Talaabooyinka">' + steps.map((step, i) =>
    '<button class="st ' + (i === index ? 'cur' : '') + '"' + (i === index ? ' aria-current="step"' : '') + '><span class="dot ' + (i < index ? 'ok' : '') + '">' + (i < index ? '✓' : i + 1) + '</span>' + step.title + '<span class="tag">' + (step.id === 'timetable' ? 'optional' : 'khasab') + '</span></button>'
  ).join('') + '</nav>';
  return source.replace('data-theme="light"', 'data-theme="' + theme + '"')
    .replace(/<nav class="steps" id="nav" aria-label="Talaabooyinka">[\s\S]*?<\\/nav>/, nav)
    .replace(/<main>[\s\S]*?<\\/main>/, referenceCard(steps[index].id, steps[index].title, steps[index].description));
}

for (const width of widths) {
  for (const theme of themes) {
    test(`School Setup Wizard · ${width}px · ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await context.newPage();
      page.on('pageerror', error => console.log('[setup visual pageerror]', error.stack || error.message));
      await page.goto(`http://127.0.0.1:4173/teacher-portal-visual.html?component=setup&theme=${theme}`);
      await expect(page.locator('.school-setup-reference')).toBeVisible();
      await expect(page.getByText('Setup Wizard', { exact: true })).toBeVisible();
      await expect(page.getByText('9/9 diyaar')).toBeVisible();
      const folder = path.join(root, 'artifacts', 'school-setup', theme, String(width));
      fs.mkdirSync(folder, { recursive: true });
      const fixture = fs.readFileSync(path.join(root, 'tests', 'visual', 'reference-setup-profile.html'), 'utf8');
      const referencePage = await context.newPage();
      const pageLinks: string[] = [];
      const comparisonLinks: string[] = [];
      for (let index = 0; index < steps.length; index += 1) {
        await page.getByRole('navigation', { name: 'Tallaabooyinka' }).getByRole('button').nth(index).click();
        await expect(page.locator('.sw-main h2')).toHaveText(steps[index].title);
        const schoolosName = 'schoolos-step-' + (index + 1) + '.png';
        await page.screenshot({ path: path.join(folder, schoolosName), fullPage: true });
        const referenceHtml = makeReferenceHtml(fixture, theme, index);
        await referencePage.setContent(referenceHtml);
        const referenceName = 'reference-step-' + (index + 1) + '.png';
        await referencePage.screenshot({ path: path.join(folder, referenceName), fullPage: true });
        const referenceImage = fs.readFileSync(path.join(folder, referenceName)).toString('base64');
        const schoolosImage = fs.readFileSync(path.join(folder, schoolosName)).toString('base64');
        const comparisonHtml = '<!doctype html><meta charset="utf-8"><title>Reference comparison</title>' +
          '<style>body{font:14px system-ui;margin:16px;background:#eee;color:#222}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}figure{margin:0;background:white;padding:8px;border:1px solid #bbb}img{display:block;width:100%;height:auto}figcaption{font-weight:700;margin:0 0 8px}</style>' +
          '<h1>Reference HTML vs SchoolOS · ' + steps[index].title + ' · ' + width + 'px · ' + theme + '</h1><main>' +
          '<figure><figcaption>Reference HTML · ' + steps[index].title + '</figcaption><img src="data:image/png;base64,' + referenceImage + '"></figure>' +
          '<figure><figcaption>SchoolOS · ' + steps[index].title + '</figcaption><img src="data:image/png;base64,' + schoolosImage + '"></figure></main>';
        const comparisonName = 'comparison-step-' + (index + 1) + '.html';
        fs.writeFileSync(path.join(folder, comparisonName), comparisonHtml);
        await referencePage.setContent(comparisonHtml);
        await referencePage.screenshot({ path: path.join(folder, 'comparison-step-' + (index + 1) + '.png'), fullPage: true });
        pageLinks.push('<li><a href="' + schoolosName + '">SchoolOS · ' + steps[index].title + '</a></li>');
        comparisonLinks.push('<li><a href="comparison-step-' + (index + 1) + '.png">Reference vs SchoolOS · ' + steps[index].title + '</a></li>');
      }
      fs.writeFileSync(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>School Setup ' + width + 'px ' + theme + '</title><h1>School Setup · ' + width + 'px · ' + theme + '</h1><h2>Comparisons</h2><ol>' + comparisonLinks.join('') + '</ol><h2>SchoolOS screenshots</h2><ol>' + pageLinks.join('') + '</ol>');
      await referencePage.close();
      await context.close();
    });
  }
}

test('School Setup Wizard screenshot matrix index and difference notes', async () => {
  const folder = path.join(root, 'artifacts', 'school-setup');
  fs.mkdirSync(folder, { recursive: true });
  const links = themes.flatMap(theme => widths.map(width => '<li><a href="' + theme + '/' + width + '/">' + width + 'px · ' + theme + '</a></li>')).join('');
  fs.writeFileSync(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>School Setup Wizard screenshot matrix</title><style>body{font:16px system-ui;margin:40px;background:#f6f4ee;color:#1c2b26}li{margin:12px 0}a{color:#1f4d3f;font-weight:700}</style><h1>School Setup Wizard · 9 steps × 4 widths × 2 themes</h1><ul>' + links + '</ul>');
  fs.writeFileSync(path.join(folder, 'DIFFERENCES.md'), [
    '# Reference vs SchoolOS visual differences',
    '',
    '- Profile and Academic Year still open the existing SchoolOS settings editors; the reference HTML renders their inputs directly inside the wizard.',
    '- Classes, Subjects/Curriculum, Teachers, Teacher Assignment, Students and Timetable now render live database-backed forms and lists inside the wizard.',
    '- SchoolOS uses the shared SchoolOS API and authorization scope; the reference fixture is static visual sample data.',
    '- Reference copy and SchoolOS copy differ in wording and some labels; layout tokens, 290px sidebar, 860px content width, card surfaces and mobile breakpoint are aligned.',
    '- The Finish panel includes SchoolOS readiness evidence and legacy follow-up indicators that are not present in the reference HTML.'
  ].join('\\n'));
});
