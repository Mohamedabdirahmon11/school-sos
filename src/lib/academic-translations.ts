import type { LanguageCode } from './translations.ts';

const academicLabels = {
  en: {
    classes: 'Classes & Sections', academics: 'ACADEMIC MANAGEMENT', subtitle: 'Create school classes and add sections such as A, B and C.', refresh: 'Refresh',
    addClass: 'Add a class', className: 'Class name', classExample: 'e.g. Grade 9', sections: 'Sections (optional)', sectionExample: 'e.g. A, B, C',
    sectionHelp: 'Separate section names with commas. A class can exist without sections.', saveClass: 'Save class', defaults: 'Standard classes',
    defaultsHelp: 'Add KG 1 and Grades 1–8. Existing classes are skipped and duplicates are not created.', addDefaults: 'Add KG 1 – Grade 8',
    classList: 'Class list', classCount: 'classes', loading: 'Loading classes…', empty: 'No classes yet. Add your first class.',
    save: 'Save', cancel: 'Cancel', classLabel: 'CLASS', rename: 'Rename', delete: 'Delete class', noSections: 'No sections yet',
    newSection: 'New section (A, B…)', addSection: 'Add section', sectionCount: 'sections',
    savedClass: 'Class saved.', defaultsChecked: 'Standard classes checked.', renamed: 'Class name updated.', deleted: 'Class deleted.', sectionAdded: 'Section added.', sectionDeleted: 'Section deleted.',
    defaultsResult: '{created} classes created; {skipped} already existed.', confirmDelete: 'Are you sure you want to delete this class?',
    loadError: 'Could not load classes.', actionError: 'The operation failed.'
  },
  so: {
    classes: 'Fasallo iyo Qaybo', academics: 'MAAMULKA WAXBARASHADA', subtitle: 'Samee fasallada dugsiga, kuna dar qaybaha sida A, B iyo C.', refresh: 'Cusboonaysii',
    addClass: 'Ku dar fasal cusub', className: 'Magaca fasalka', classExample: 'Tusaale: Fasalka 9aad', sections: 'Qaybaha (ikhtiyaari)', sectionExample: 'Tusaale: A, B, C',
    sectionHelp: 'Kala saar magacyada qaybaha hakad (,). Fasalku wuu jiri karaa isaga oo aan qaybo lahayn.', saveClass: 'Kaydi fasalka', defaults: 'Fasallada caadiga ah',
    defaultsHelp: 'Hal mar ku dar KG 1 iyo Fasallada 1 ilaa 8. Fasallada hore u jiray waa la dhaafayaa, nuqullo lama samaynayo.', addDefaults: 'Ku dar KG 1 – Fasalka 8aad',
    classList: 'Liiska fasallada', classCount: 'fasal', loading: 'Fasallada waa la soo rarayaa…', empty: 'Weli fasallo lama samayn. Ku dar fasalka koowaad.',
    save: 'Kaydi', cancel: 'Jooji', classLabel: 'FASALKA', rename: 'Beddel magaca', delete: 'Tirtir fasalka', noSections: 'Qaybo weli ma jiraan',
    newSection: 'Qayb cusub (A, B…)', addSection: 'Ku dar qayb', sectionCount: 'qaybo',
    savedClass: 'Fasalka waa la kaydiyay.', defaultsChecked: 'Fasallada caadiga ah waa la hubiyay.', renamed: 'Magaca fasalka waa la beddelay.', deleted: 'Fasalka waa la tirtiray.', sectionAdded: 'Qaybta waa lagu daray.', sectionDeleted: 'Qaybta waa la tirtiray.',
    defaultsResult: '{created} fasal ayaa la sameeyay; {skipped} hore ayay u jireen.', confirmDelete: 'Ma hubtaa inaad tirtirayso fasalkan?',
    loadError: 'Fasallada lama soo qaadi karin.', actionError: 'Hawlgalka wuu fashilmay.'
  },
  am: {
    classes: 'ክፍሎች እና ክፍል ንዑስ ክፍሎች', academics: 'የትምህርት አስተዳደር', subtitle: 'የትምህርት ቤቱን ክፍሎች ይፍጠሩ እና እንደ A፣ B እና C ያሉ ንዑስ ክፍሎችን ያክሉ።', refresh: 'አድስ',
    addClass: 'አዲስ ክፍል ጨምር', className: 'የክፍል ስም', classExample: 'ለምሳሌ፦ 9ኛ ክፍል', sections: 'ንዑስ ክፍሎች (አማራጭ)', sectionExample: 'ለምሳሌ፦ A፣ B፣ C',
    sectionHelp: 'የንዑስ ክፍል ስሞችን በኮማ ይለዩ። ክፍሉ ንዑስ ክፍሎች ሳይኖሩትም ሊኖር ይችላል።', saveClass: 'ክፍሉን አስቀምጥ', defaults: 'መደበኛ ክፍሎች',
    defaultsHelp: 'KG 1 እና ከ1ኛ እስከ 8ኛ ክፍል ይጨምሩ። ቀድሞ ያሉ ክፍሎች ይዘለላሉ።', addDefaults: 'KG 1 – 8ኛ ክፍል ጨምር',
    classList: 'የክፍሎች ዝርዝር', classCount: 'ክፍሎች', loading: 'ክፍሎች በመጫን ላይ…', empty: 'ገና ክፍሎች አልተፈጠሩም። የመጀመሪያውን ክፍል ይጨምሩ።',
    save: 'አስቀምጥ', cancel: 'ሰርዝ', classLabel: 'ክፍል', rename: 'ስም ቀይር', delete: 'ክፍሉን ሰርዝ', noSections: 'ንዑስ ክፍሎች የሉም',
    newSection: 'አዲስ ንዑስ ክፍል (A፣ B…)', addSection: 'ንዑስ ክፍል ጨምር', sectionCount: 'ንዑስ ክፍሎች',
    savedClass: 'ክፍሉ ተቀምጧል።', defaultsChecked: 'መደበኛ ክፍሎች ተረጋግጠዋል።', renamed: 'የክፍሉ ስም ተቀይሯል።', deleted: 'ክፍሉ ተሰርዟል።', sectionAdded: 'ንዑስ ክፍሉ ተጨምሯል።', sectionDeleted: 'ንዑስ ክፍሉ ተሰርዟል።',
    defaultsResult: '{created} ክፍሎች ተፈጥረዋል፤ {skipped} ቀድሞ ነበሩ።', confirmDelete: 'ይህን ክፍል መሰረዝ ይፈልጋሉ?',
    loadError: 'ክፍሎችን መጫን አልተቻለም።', actionError: 'ተግባሩ አልተሳካም።'
  },
  ar: {
    classes: 'الفصول والشُعب', academics: 'الإدارة الأكاديمية', subtitle: 'أنشئ فصول المدرسة وأضف شعبًا مثل A وB وC.', refresh: 'تحديث',
    addClass: 'إضافة فصل', className: 'اسم الفصل', classExample: 'مثال: الصف التاسع', sections: 'الشُعب (اختياري)', sectionExample: 'مثال: A، B، C',
    sectionHelp: 'افصل أسماء الشُعب بفواصل. يمكن أن يوجد الفصل دون شُعب.', saveClass: 'حفظ الفصل', defaults: 'الفصول الافتراضية',
    defaultsHelp: 'إضافة KG 1 والصفوف من 1 إلى 8. سيتم تخطي الفصول الموجودة دون إنشاء نسخ مكررة.', addDefaults: 'إضافة KG 1 – الصف 8',
    classList: 'قائمة الفصول', classCount: 'فصول', loading: 'جارٍ تحميل الفصول…', empty: 'لا توجد فصول بعد. أضف الفصل الأول.',
    save: 'حفظ', cancel: 'إلغاء', classLabel: 'الفصل', rename: 'تغيير الاسم', delete: 'حذف الفصل', noSections: 'لا توجد شُعب بعد',
    newSection: 'شعبة جديدة (A، B…)', addSection: 'إضافة شعبة', sectionCount: 'شُعب',
    savedClass: 'تم حفظ الفصل.', defaultsChecked: 'تم التحقق من الفصول الافتراضية.', renamed: 'تم تحديث اسم الفصل.', deleted: 'تم حذف الفصل.', sectionAdded: 'تمت إضافة الشعبة.', sectionDeleted: 'تم حذف الشعبة.',
    defaultsResult: 'تم إنشاء {created} فصول؛ {skipped} موجودة بالفعل.', confirmDelete: 'هل أنت متأكد من حذف هذا الفصل؟',
    loadError: 'تعذر تحميل الفصول.', actionError: 'فشلت العملية.'
  }
} satisfies Record<LanguageCode, Record<string, string>>;

export function academicText(language: LanguageCode, key: string): string {
  return academicLabels[language]?.[key] ?? academicLabels.en[key] ?? key;
}
