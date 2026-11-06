/**
 * Complete Multi-Language Localization Engine
 * Languages: English (en), Somali (so), Amharic (am)
 */

export type LanguageCode = 'en' | 'so' | 'am';

export interface TranslationDict {
  // Navigation & Brand
  app_name: string;
  super_admin: string;
  school_admin: string;
  teacher: string;
  parent: string;
  student: string;
  accountant: string;
  dashboard: string;
  schools: string;
  plans_billing: string;
  users: string;
  analytics: string;
  broadcasts: string;
  support_audit: string;
  help_support: string;
  platform_settings: string;
  students: string;
  teachers: string;
  parents_contacts: string;
  classes: string;
  subjects: string;
  timetable: string;
  timetable_view_class: string;
  timetable_view_teacher: string;
  timetable_view_day: string;
  timetable_generate: string;
  timetable_print: string;
  timetable_times: string;
  timetable_start_time: string;
  timetable_period_minutes: string;
  timetable_break_after: string;
  timetable_break_minutes: string;
  timetable_save_times: string;
  timetable_remove_period: string;
  timetable_unavailability: string;
  timetable_empty: string;
  timetable_swap: string;
  timetable_swap_select: string;
  timetable_swapped: string;
  timetable_unfilled: string;
  attendance: string;
  exams_results: string;
  assignments: string;
  fees_payments: string;
  events_holidays: string;
  notice_board: string;
  messages: string;
  add_notice: string;
  edit_notice: string;
  archive_notice: string;
  archive_notice_confirm: string;
  notice_title: string;
  notice_details: string;
  audience_everyone: string;
  audience_school: string;
  audience_class: string;
  pin_notice: string;
  choose_class: string;
  admissions: string;
  staff_access: string;
  staff_signin_identifier: string;
  staff_signin_placeholder: string;
  school_admin_initial_password_hint: string;
  first_time_password_hint: string;
  staff_id: string;
  staff_id_generated_hint: string;
  reports_export: string;
  report_cards: string;
  school_settings: string;
  library: string;
  transport: string;
  discipline: string;
  health_nurse: string;
  certificates_id: string;
  payroll_staff: string;
  inventory: string;
  logout: string;
  
  // Statuses
  trial: string;
  active: string;
  grace: string;
  read_only: string;
  suspended: string;
  paid: string;
  partial: string;
  unpaid: string;
  present: string;
  absent: string;
  late: string;
  excused: string;

  // Actions & Buttons
  save: string;
  cancel: string;
  submit: string;
  search: string;
  filter: string;
  export_csv: string;
  import_csv: string;
  bulk_import: string;
  import_step_template: string;
  import_step_upload: string;
  import_step_preview: string;
  import_step_confirm: string;
  import_step_result: string;
  import_download_template: string;
  import_choose_file: string;
  import_preview_button: string;
  import_error_only: string;
  import_valid_count: string;
  import_error_count: string;
  import_skipped_count: string;
  import_confirm_button: string;
  import_print_pin_slips: string;
  import_close: string;
  import_empty_preview: string;
  import_upload_help: string;
  import_loading: string;
  import_row: string;
  import_status: string;
  import_reason: string;
  import_all_rows: string;
  import_result_message: string;
  import_classes_count: string;
  import_students_count: string;
  import_parents_count: string;
  import_back: string;
  add_school: string;
  add_student: string;
  add_teacher: string;
  record_payment: string;
  print_receipt: string;
  print_id_card: string;
  print_report_card: string;
  mark_all_present: string;
  approve: string;
  reject: string;
  reset_password: string;
  suspend: string;
  reactivate: string;
  renew_subscription: string;
  run_backup: string;
  confirm: string;
  delete: string;
  edit: string;
  view_details: string;
  send_message: string;
  
  // Common Labels
  school_code: string;
  student_id: string;
  three_part_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  male: string;
  female: string;
  admission_date: string;
  student_phone: string;
  father_phone: string;
  mother_phone: string;
  class_name: string;
  amount_due: string;
  amount_paid: string;
  remaining_balance: string;
  payment_method: string;
  receipt_number: string;
  date: string;
  academic_year: string;
  semester: string;
  two_factor_code: string;
  enter_pin: string;
  read_only_banner: string;
  student_access_disabled: string;
  locked_account_msg: string;
  select_custom_fee: string;
  payroll_management: string;
  payroll_month: string;
  payroll_staff_member: string;
  payroll_salary: string;
  payroll_allowance: string;
  payroll_deduction: string;
  payroll_create: string;
  payroll_status: string;
  payroll_net: string;
  payroll_draft: string;
  payroll_approved: string;
  payroll_paid: string;
  payroll_approve: string;
  payroll_mark_paid: string;
  payroll_payslip: string;
  payroll_empty: string;
  payroll_loading: string;
  payroll_error: string;
  payroll_summary: string;
  settings_identity: string;
  settings_academics: string;
  settings_documents: string;
  settings_branches: string;
  settings_language: string;
  settings_timezone: string;
  settings_student_portal: string;
  settings_student_portal_hint: string;
  settings_academic_calendar: string;
  settings_terms: string;
  settings_grading_scale: string;
  settings_class_levels: string;
  settings_attendance_rules: string;
  settings_exam_marks: string;
  settings_pass_mark: string;
  settings_timetable: string;
  settings_report_header: string;
  settings_report_footer: string;
  settings_receipt_header: string;
  settings_receipt_footer: string;
  settings_notifications: string;
  settings_save_profile: string;
  settings_save_academics: string;
  settings_save_exam: string;
  settings_save_timetable: string;
  settings_save_documents: string;
}

export const translations: Record<LanguageCode, TranslationDict> = {
  en: {
    app_name: 'SchoolOS Cloud',
    super_admin: 'Super Admin',
    school_admin: 'School Admin',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student',
    accountant: 'Accountant',
    dashboard: 'Dashboard',
    schools: 'Schools Directory',
    plans_billing: 'Plans & Invoicing',
    users: 'Global Users',
    analytics: 'SaaS Analytics',
    broadcasts: 'Platform Broadcasts',
    support_audit: 'Support & Audit Log',
    help_support: 'Help & Support',
    platform_settings: 'Platform Settings',
    students: 'Students',
    teachers: 'Teachers',
    parents_contacts: 'Parents',
    classes: 'Classes',
    subjects: 'Subjects',
    timetable: 'Timetable',
    timetable_view_class: 'View by class',
    timetable_view_teacher: 'View by teacher',
    timetable_view_day: 'View by day',
    timetable_generate: 'Generate class timetable',
    timetable_print: 'Print timetable',
    timetable_times: 'Period times',
    timetable_start_time: 'First period starts',
    timetable_period_minutes: 'Period minutes',
    timetable_break_after: 'Break after period',
    timetable_break_minutes: 'Break minutes',
    timetable_save_times: 'Save period times',
    timetable_remove_period: 'Remove period',
    timetable_unavailability: 'Teacher unavailability',
    timetable_empty: 'No timetable periods have been published.',
    timetable_swap: 'Swap periods',
    timetable_swap_select: 'Select two timetable periods to swap.',
    timetable_swapped: 'Timetable periods swapped.',
    timetable_unfilled: 'Unfilled subject periods',
    attendance: 'Attendance',
    exams_results: 'Exams & Results',
    assignments: 'Homework & Assignments',
    fees_payments: 'Fees & Payments',
    events_holidays: 'Events & Holidays',
    notice_board: 'Notice Board',
    messages: 'Messages',
    add_notice: 'Add Notice',
    edit_notice: 'Edit Notice',
    archive_notice: 'Archive',
    archive_notice_confirm: 'Archive notice "{title}"?',
    notice_title: 'Notice title',
    notice_details: 'Notice details',
    audience_everyone: 'Everyone',
    audience_school: 'Whole school',
    audience_class: 'One class',
    pin_notice: 'Pin notice',
    choose_class: 'Choose class',
    admissions: 'Admissions',
    staff_access: 'Staff & Access',
    staff_signin_identifier: 'Email or Staff ID',
    staff_signin_placeholder: 'name@school.com or STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'Use the temporary password from your Super Admin. Your Gmail password is not used for SchoolOS.',
    first_time_password_hint: 'Create a password different from your temporary sign-in password. It must be at least 8 characters.',
    staff_id: 'Staff ID',
    staff_id_generated_hint: 'Leave blank to generate a unique ID',
    reports_export: 'Reports',
    report_cards: 'Student Report Cards',
    school_settings: 'School Settings',
    library: 'Library',
    transport: 'Transport',
    discipline: 'Discipline',
    health_nurse: 'Health',
    certificates_id: 'Printable ID Cards & Badges',
    payroll_staff: 'Staff Payroll & Payslips',
    inventory: 'Inventory',
    logout: 'Sign Out',
    
    trial: 'Trial',
    active: 'Active',
    grace: 'Grace Period',
    read_only: 'Read Only',
    suspended: 'Suspended',
    paid: 'Paid',
    partial: 'Partial',
    unpaid: 'Unpaid',
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
    excused: 'Excused',

    save: 'Save Changes',
    cancel: 'Cancel',
    submit: 'Submit',
    search: 'Search...',
    filter: 'Filter',
    export_csv: 'Export CSV',
    import_csv: 'Import CSV',
    bulk_import: 'Bulk Import',
    import_step_template: 'Download template',
    import_step_upload: 'Upload file',
    import_step_preview: 'Preview',
    import_step_confirm: 'Confirm',
    import_step_result: 'Results',
    import_download_template: 'Download CSV template',
    import_choose_file: 'Choose CSV or XLSX file',
    import_preview_button: 'Preview file',
    import_error_only: 'Errors only',
    import_valid_count: 'Valid',
    import_error_count: 'Errors',
    import_skipped_count: 'Skipped examples',
    import_confirm_button: 'Confirm import',
    import_print_pin_slips: 'Print PIN slips',
    import_close: 'Close',
    import_empty_preview: 'Choose a file to preview its rows.',
    import_upload_help: 'Up to 2,000 rows and 5 MB. Example rows are skipped automatically.',
    import_loading: 'Processing import…',
    import_row: 'Row',
    import_status: 'Status',
    import_reason: 'Reason',
    import_all_rows: 'All rows',
    import_result_message: 'Import completed successfully.',
    import_classes_count: 'Classes created',
    import_students_count: 'Students imported',
    import_parents_count: 'Parent accounts linked',
    import_back: 'Back',
    add_school: 'Onboard New School',
    add_student: 'Admit New Student',
    add_teacher: 'Add Teacher',
    record_payment: 'Record Fee Payment',
    print_receipt: 'Print Official Receipt',
    print_id_card: 'Print Student ID Card',
    print_report_card: 'Print Report Card PDF',
    mark_all_present: 'Mark All Present',
    approve: 'Approve',
    reject: 'Reject',
    reset_password: 'Reset Password',
    suspend: 'Suspend Access',
    reactivate: 'Reactivate School',
    renew_subscription: 'Renew / Add Subscription',
    run_backup: 'Run Database Backup Now',
    confirm: 'Confirm Action',
    delete: 'Delete Record',
    edit: 'Edit Details',
    view_details: 'View 360 Profile',
    send_message: 'Send Message',
    
    school_code: 'School Code',
    student_id: 'Student ID',
    three_part_name: 'Three-Part Student Name',
    first_name: 'First Name',
    middle_name: 'Father Name',
    last_name: 'Grandfather Name',
    gender: 'Gender',
    male: 'Male',
    female: 'Female',
    admission_date: 'Admission Date',
    student_phone: 'Student Phone',
    father_phone: 'Father Phone',
    mother_phone: 'Mother Phone',
    class_name: 'Class & Section',
    amount_due: 'Total Amount Due',
    amount_paid: 'Amount Paid',
    remaining_balance: 'Remaining Balance',
    payment_method: 'Payment Method',
    receipt_number: 'Receipt Number',
    date: 'Date',
    academic_year: 'Academic Year',
    semester: 'Semester / Term',
    two_factor_code: '2FA Verification Code (TOTP)',
    enter_pin: 'Enter 4-Digit Security PIN',
    read_only_banner: 'Warning: This school subscription has expired and entered Read-Only mode. All additions, updates, and removals are blocked.',
    student_access_disabled: 'Student Portal access is disabled for this school by the platform administrator.',
    locked_account_msg: 'Account temporarily locked due to 5 consecutive failed login attempts. Please wait 15 minutes or contact administrator.',
    select_custom_fee: 'Select custom fee',
    payroll_management: 'Payroll and payslips', payroll_month: 'Payroll month', payroll_staff_member: 'Staff member', payroll_salary: 'Base salary',
    payroll_allowance: 'Additional allowance', payroll_deduction: 'Deduction', payroll_create: 'Create draft payroll', payroll_status: 'Status', payroll_net: 'Net salary',
    payroll_draft: 'Draft', payroll_approved: 'Approved', payroll_paid: 'Paid', payroll_approve: 'Approve', payroll_mark_paid: 'Mark paid',
    payroll_payslip: 'Download payslip', payroll_empty: 'No payroll records for this month.', payroll_loading: 'Loading payroll…', payroll_error: 'Payroll could not be loaded or saved.', payroll_summary: 'Summary',
    settings_identity: 'School Identity & Branding',
    settings_academics: 'Academics & Rules',
    settings_documents: 'Documents & Alerts',
    settings_branches: 'Branches',
    settings_language: 'Default Language',
    settings_timezone: 'Timezone',
    settings_student_portal: 'Student Portal Access',
    settings_student_portal_hint: 'Allow students to sign in. This is off by default and can be changed here or by the Platform Owner.',
    settings_academic_calendar: 'Academic Year, Terms & Grading',
    settings_terms: 'Term Dates',
    settings_grading_scale: 'Grading Scale',
    settings_class_levels: 'Class / Grade Levels Offered',
    settings_attendance_rules: 'Attendance Rules',
    settings_exam_marks: 'Exam Maximum Marks & Pass Mark',
    settings_pass_mark: 'Minimum Pass Mark (%)',
    settings_timetable: 'Timetable Period Settings',
    settings_report_header: 'Report Card Header',
    settings_report_footer: 'Report Card Footer',
    settings_receipt_header: 'Receipt Header',
    settings_receipt_footer: 'Receipt Footer',
    settings_notifications: 'Notification Preferences',
    settings_save_profile: 'Save Profile',
    settings_save_academics: 'Save Academic Rules',
    settings_save_exam: 'Save Exam Rules',
    settings_save_timetable: 'Save Timetable Settings',
    settings_save_documents: 'Save Documents & Alerts',
  },
  so: {
    app_name: 'SchoolOS Soomaaliya',
    super_admin: 'Maamulaha Guud',
    school_admin: 'Maamulaha Dugsiga',
    teacher: 'Macallin',
    parent: 'Wali',
    student: 'Arday',
    accountant: 'Xisaabiye',
    dashboard: 'Barta Guud',
    schools: 'Liiska Dugsiyada',
    plans_billing: 'Qorshooyinka & Biilasha',
    users: 'Dhammaan Isticmaalayaasha',
    analytics: 'Falanqaynta & Xogta',
    broadcasts: 'Farriimaha Madasha',
    support_audit: 'Taageerada & Diiwaanka',
    help_support: 'Caawimaad & Taageero',
    platform_settings: 'Hagaajinta Nidaamka',
    students: 'Ardayda',
    teachers: 'Macallimiinta',
    parents_contacts: 'Waalidiinta',
    classes: 'Fasallada',
    subjects: 'Maadooyinka',
    timetable: 'Jadwalka Xiisadaha',
    timetable_view_class: 'Ku eeg fasal',
    timetable_view_teacher: 'Ku eeg macallin',
    timetable_view_day: 'Ku eeg maalin',
    timetable_generate: 'Abuur jadwalka fasalka',
    timetable_print: 'Daabac jadwalka',
    timetable_times: 'Waqtiyada casharrada',
    timetable_start_time: 'Casharka koowaad wuxuu bilaabmaa',
    timetable_period_minutes: 'Daqiiqadaha casharka',
    timetable_break_after: 'Nasasho ka dib casharka',
    timetable_break_minutes: 'Daqiiqadaha nasashada',
    timetable_save_times: 'Kaydi waqtiyada',
    timetable_remove_period: 'Ka saar casharka',
    timetable_unavailability: 'Waqtiyada macallinka uusan heli karin',
    timetable_empty: 'Weli lama daabicin waqtiyada jadwalka.',
    timetable_swap: 'Beddel casharrada',
    timetable_swap_select: 'Dooro laba cashar oo jadwalka ah si loo beddelo.',
    timetable_swapped: 'Waqtiyada jadwalka waa la beddelay.',
    timetable_unfilled: 'Casharrada jadwalka ee aan la buuxin',
    attendance: 'Xaadirinta',
    exams_results: 'Imtixaanaadka & Natiijooyinka',
    assignments: 'Laylisyada & Shaqo-guri',
    fees_payments: 'Lacagaha & Bixinta',
    events_holidays: 'Munaasabadaha & Fasaxyada',
    notice_board: 'Guddiga Ogeysiisyada',
    messages: 'Farriimaha',
    add_notice: 'Ku dar ogeysiis',
    edit_notice: 'Wax ka beddel ogeysiiska',
    archive_notice: 'Kaydi',
    archive_notice_confirm: 'Kaydi ogeysiiska "{title}"?',
    notice_title: 'Cinwaanka ogeysiiska',
    notice_details: 'Faahfaahinta ogeysiiska',
    audience_everyone: 'Qof walba',
    audience_school: 'Dugsiga oo dhan',
    audience_class: 'Hal fasal',
    pin_notice: 'Ku dheji ogeysiiska',
    choose_class: 'Dooro fasal',
    admissions: 'Diiwaangelinta',
    staff_access: 'Shaqaalaha & Maamulka',
    staff_signin_identifier: 'Iimayl ama Aqoonsiga Shaqaalaha',
    staff_signin_placeholder: 'name@school.com ama STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'Isticmaal furaha ku-meel-gaarka ah ee Maamulaha Guud ku siiyay. Furaha Gmail-kaaga laguma galo SchoolOS.',
    first_time_password_hint: 'Sameyso furaha sirta ah oo ka duwan kii ku-meel-gaarka ahaa ee aad ku gashay. Waa inuu ka koobnaadaa ugu yaraan 8 xaraf.',
    staff_id: 'Aqoonsiga Shaqaalaha',
    staff_id_generated_hint: 'Madhan ka tag si aqoonsi gaar ah loo sameeyo',
    reports_export: 'Warbixinnada',
    report_cards: 'Kaarka Natiijada',
    school_settings: 'Dejinta Dugsiga',
    library: 'Maktabadda',
    transport: 'Gaadiidka',
    discipline: 'Anshaxa',
    health_nurse: 'Caafimaadka',
    certificates_id: 'Kaararka Aqoonsiga',
    payroll_staff: 'Mushaharka Macallimiinta',
    inventory: 'Alaabaha Dugsiga',
    logout: 'Ka Bax Nidaamka',
    
    trial: 'Tijaabo',
    active: 'Shaqeynaya',
    grace: 'Muddada Cafiska',
    read_only: 'Akhris Kaliya',
    suspended: 'La Joojiyay',
    paid: 'La Bixiyay',
    partial: 'Qayb Bixis',
    unpaid: 'Lama Bixin',
    present: 'Jooga',
    absent: 'Maqan',
    late: 'Soo Daahay',
    excused: 'Cudurdaar leh',

    save: 'Keydi Isbeddellada',
    cancel: 'Jooji',
    submit: 'Gudbi',
    search: 'Raadi...',
    filter: 'Kala Saar',
    export_csv: 'Dhoofi CSV',
    import_csv: 'Soo Geli CSV',
    bulk_import: 'Soo Dejinta Badan',
    import_step_template: 'Soo deji qaabka',
    import_step_upload: 'Soo geli faylka',
    import_step_preview: 'Hordhac',
    import_step_confirm: 'Xaqiiji',
    import_step_result: 'Natiijooyinka',
    import_download_template: 'Soo deji qaabka CSV',
    import_choose_file: 'Dooro faylka CSV ama XLSX',
    import_preview_button: 'Hordhac faylka',
    import_error_only: 'Khaladaadka oo keliya',
    import_valid_count: 'Sax ah',
    import_error_count: 'Khaladaad',
    import_skipped_count: 'Tusaalooyin la dhaafay',
    import_confirm_button: 'Xaqiiji soo dejinta',
    import_print_pin_slips: 'Daabac waraaqaha PIN-ka',
    import_close: 'Xir',
    import_empty_preview: 'Dooro fayl si aad u aragto safafkiisa.',
    import_upload_help: 'Ugu badnaan 2,000 saf iyo 5 MB. Safafka tusaalaha si toos ah ayaa loo dhaafaa.',
    import_loading: 'Soo dejinta ayaa socota…',
    import_row: 'Saf',
    import_status: 'Xaalad',
    import_reason: 'Sabab',
    import_all_rows: 'Dhammaan safafka',
    import_result_message: 'Soo dejintu si guul leh ayay u dhammaatay.',
    import_classes_count: 'Fasallo la sameeyay',
    import_students_count: 'Arday la soo geliyay',
    import_parents_count: 'Akoon waalid oo la xiriiriyay',
    import_back: 'Dib u noqo',
    add_school: 'Kudar Dugsi Cusub',
    add_student: 'Qor Arday Cusub',
    add_teacher: 'Kudar Macallin',
    record_payment: 'Diiwaangeli Lacag',
    print_receipt: 'Daabac Rasiidka',
    print_id_card: 'Daabac Kaarka Ardayga',
    print_report_card: 'Daabac Natiijada PDF',
    mark_all_present: 'Dhammaan Waa Joogaan',
    approve: 'Oggolow',
    reject: 'Diid',
    reset_password: 'Beddel Furaha',
    suspend: 'Jooji Dugsiga',
    reactivate: 'Dib U Fasax',
    renew_subscription: 'Cusbooneysii Dugsiga',
    run_backup: 'Qaad Kayd Hadda',
    confirm: 'Xaqiiji Tallaabada',
    delete: 'Tirtir',
    edit: 'Wax Ka Beddel',
    view_details: 'Fiiri Xogta Buuxda',
    send_message: 'Dir Farriin',
    
    school_code: 'Koodhka Dugsiga',
    student_id: 'Aqoonsiga Ardayga',
    three_part_name: 'Magaca Ardayga (Saddex-geesood)',
    first_name: 'Magaca Koowaad',
    middle_name: 'Magaca Aabaha',
    last_name: 'Magaca Awoowaha',
    gender: 'Jinsiga',
    male: 'Lab',
    female: 'Dheddig',
    admission_date: 'Taariikhda Galitaanka',
    student_phone: 'Telefoonka Ardayga',
    father_phone: 'Telefoonka Aabaha',
    mother_phone: 'Telefoonka Hooyada',
    class_name: 'Fasalka',
    amount_due: 'Wadarta Lacagta',
    amount_paid: 'Lacagta La Bixiyay',
    remaining_balance: 'Haraaga Dhiman',
    payment_method: 'Habka Lacag-bixinta',
    receipt_number: 'Lambarka Rasiidka',
    date: 'Taariikhda',
    academic_year: 'Sannad Dugsiyeedka',
    semester: 'Simistarka',
    two_factor_code: 'Koodhka 2FA (TOTP)',
    enter_pin: 'Geli PIN-ka 4-ta Lambar ah',
    read_only_banner: 'Digniin: Dugsigan muddadii ayaa ka dhacday. Wuxuu ku jiraa habka Akhris Kaliya. Lama dari karo wax xog ah.',
    student_access_disabled: 'Galitaanka ardayda waa la xanibay dugsigan xagga maamulka sare.',
    locked_account_msg: 'Koontada si ku-meel-gaar ah ayaa loo xiray 5 jeer oo furaha lagu qaldamay awgeed. Fadlan sug 15 daqiiqo.',
    select_custom_fee: 'Dooro khidmad gaar ah',
    payroll_management: 'Mushahar iyo warqadaha mushaharka', payroll_month: 'Bisha mushaharka', payroll_staff_member: 'Shaqaale', payroll_salary: 'Mushaharka aasaasiga ah',
    payroll_allowance: 'Gunno dheeraad ah', payroll_deduction: 'Jaritaan', payroll_create: 'Abuur mushahar qabyo ah', payroll_status: 'Xaalad', payroll_net: 'Mushaharka saafiga ah',
    payroll_draft: 'Qabyo', payroll_approved: 'La ansixiyay', payroll_paid: 'La bixiyay', payroll_approve: 'Ansixi', payroll_mark_paid: 'Calaamadee in la bixiyay',
    payroll_payslip: 'Soo dejiso warqadda mushaharka', payroll_empty: 'Ma jiro diiwaan mushahar bishan.', payroll_loading: 'Mushaharka waa la rarayaa…', payroll_error: 'Mushaharka lama soo dejin ama lama kaydin karin.', payroll_summary: 'Soo koobid',
    settings_identity: 'Aqoonsiga iyo Summadda Dugsiga',
    settings_academics: 'Waxbarasho & Xeerar',
    settings_documents: 'Dukumiinti & Ogeysiisyo',
    settings_branches: 'Laamaha',
    settings_language: 'Luqadda Caadiga ah',
    settings_timezone: 'Aagga Waqtiga',
    settings_student_portal: 'Gelitaanka Ardayga',
    settings_student_portal_hint: 'U ogolow ardayda inay galaan. Tan waa dami marka hore waxaana beddeli kara maamulka dugsiga ama mulkiilaha.',
    settings_academic_calendar: 'Sannad Dugsiyeed, Xilli & Qiimeyn',
    settings_terms: 'Taariikhaha Xilliyada',
    settings_grading_scale: 'Miisaanka Qiimeynta',
    settings_class_levels: 'Fasallada / Heerarka La Bixiyo',
    settings_attendance_rules: 'Xeerarka Imaanshaha',
    settings_exam_marks: 'Dhibcaha Ugu Badan & Dhibcaha Gudbinta',
    settings_pass_mark: 'Dhibcaha Ugu Yar ee Gudbinta (%)',
    settings_timetable: 'Habaynta Waqtiyada Jadwalka',
    settings_report_header: 'Cinwaanka Kaararka Natiijada',
    settings_report_footer: 'Hoose-tirin Kaararka Natiijada',
    settings_receipt_header: 'Cinwaanka Rasiidhka',
    settings_receipt_footer: 'Hoose-tirin Rasiidhka',
    settings_notifications: 'Doorashada Ogeysiisyada',
    settings_save_profile: 'Kaydi Astaanta',
    settings_save_academics: 'Kaydi Xeerarka Waxbarasho',
    settings_save_exam: 'Kaydi Xeerarka Imtixaanka',
    settings_save_timetable: 'Kaydi Habaynta Jadwalka',
    settings_save_documents: 'Kaydi Dukumiintiga & Ogeysiisyada',
  },
  am: {
    app_name: 'SchoolOS ኢትዮጵያ',
    super_admin: 'ዋና አስተዳዳሪ',
    school_admin: 'የትምህርት ቤት አስተዳዳሪ',
    teacher: 'አስተማሪ',
    parent: 'ወላጅ',
    student: 'ተማሪ',
    accountant: 'የሂሳብ ሹም',
    dashboard: 'ዳሽቦርድ',
    schools: 'የትምህርት ቤቶች ዝርዝር',
    plans_billing: 'ክፍያዎች እና እቅዶች',
    users: 'ተጠቃሚዎች',
    analytics: 'ትንታኔ እና መረጃ',
    broadcasts: 'የስርዓት መልእክቶች',
    support_audit: 'ድጋፍ እና ኦዲት ሎግ',
    help_support: 'እገዛ እና ድጋፍ',
    platform_settings: 'የስርዓት ቅንብሮች',
    students: 'ተማሪዎች',
    teachers: 'መምህራን',
    parents_contacts: 'ወላጆች',
    classes: 'ክፍሎች',
    subjects: 'የትምህርት ዓይነቶች',
    timetable: 'የክፍለ-ጊዜ ሠንጠረዥ',
    timetable_view_class: 'በክፍል ይመልከቱ',
    timetable_view_teacher: 'በመምህር ይመልከቱ',
    timetable_view_day: 'በቀን ይመልከቱ',
    timetable_generate: 'የክፍል የጊዜ ሰሌዳ ይፍጠሩ',
    timetable_print: 'የጊዜ ሰሌዳ ያትሙ',
    timetable_times: 'የትምህርት ጊዜያት',
    timetable_start_time: 'የመጀመሪያ ትምህርት መጀመሪያ',
    timetable_period_minutes: 'የትምህርት ደቂቃዎች',
    timetable_break_after: 'እረፍት ከክፍለ ጊዜ በኋላ',
    timetable_break_minutes: 'የእረፍት ደቂቃዎች',
    timetable_save_times: 'ጊዜያትን ያስቀምጡ',
    timetable_remove_period: 'ክፍለ ጊዜን ያስወግዱ',
    timetable_unavailability: 'መምህሩ የማይገኝበት ጊዜ',
    timetable_empty: 'ምንም የጊዜ ሰሌዳ ክፍለ ጊዜ አልታተመም።',
    timetable_swap: 'ክፍለ ጊዜዎችን ይቀያይሩ',
    timetable_swap_select: 'ለመቀያየር ሁለት የጊዜ ሰሌዳ ክፍለ ጊዜዎችን ይምረጡ።',
    timetable_swapped: 'የጊዜ ሰሌዳ ክፍለ ጊዜዎች ተቀይረዋል።',
    timetable_unfilled: 'ያልተሞሉ የትምህርት ክፍለ ጊዜዎች',
    attendance: 'መገኘት',
    exams_results: 'ፈተናዎች እና ውጤቶች',
    assignments: 'የቤት ስራዎች',
    fees_payments: 'ክፍያዎች',
    events_holidays: 'ዝግጅቶች እና በዓላት',
    notice_board: 'የማስታወቂያ ሰሌዳ',
    messages: 'መልዕክቶች',
    add_notice: 'Add Notice',
    edit_notice: 'Edit Notice',
    archive_notice: 'Archive',
    archive_notice_confirm: 'Archive notice "{title}"?',
    notice_title: 'Notice title',
    notice_details: 'Notice details',
    audience_everyone: 'Everyone',
    audience_school: 'Whole school',
    audience_class: 'One class',
    pin_notice: 'Pin notice',
    choose_class: 'Choose class',
    admissions: 'ምዝገባ',
    staff_access: 'ሰራተኞች እና መዳረሻ',
    staff_signin_identifier: 'ኢሜይል ወይም የሰራተኛ መታወቂያ',
    staff_signin_placeholder: 'name@school.com ወይም STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'በዋና አስተዳዳሪው የተሰጠዎትን ጊዜያዊ የይለፍ ቃል ይጠቀሙ። የGmail የይለፍ ቃልዎ ወደ SchoolOS ለመግባት አይጠቅምም።',
    first_time_password_hint: 'ከጊዜያዊ የመግቢያ የይለፍ ቃልዎ የተለየ የይለፍ ቃል ይፍጠሩ። ቢያንስ 8 ቁምፊዎች መሆን አለበት።',
    staff_id: 'የሰራተኛ መታወቂያ',
    staff_id_generated_hint: 'ልዩ መታወቂያ ለማመንጨት ባዶ ይተዉ',
    reports_export: 'ሪፖርቶች',
    report_cards: 'የውጤት ካርድ',
    school_settings: 'የትምህርት ቤት ቅንብሮች',
    library: 'ቤተ-መጻሕፍት',
    transport: 'ትራንስፖርት',
    discipline: 'ሥነ-ምግባር',
    health_nurse: 'ጤና',
    certificates_id: 'የመታወቂያ ካርዶች',
    payroll_staff: 'የደመወዝ ክፍያ',
    inventory: 'የትምህርት ቤት እቃዎች',
    logout: 'ውጣ',
    
    trial: 'የሙከራ ጊዜ',
    active: 'ንቁ',
    grace: 'የማስታረቂያ ጊዜ',
    read_only: 'ለንባብ ብቻ',
    suspended: 'የታገደ',
    paid: 'የተከፈለ',
    partial: 'በከፊል የተከፈለ',
    unpaid: 'ያልተከፈለ',
    present: 'ተገኝቷል',
    absent: 'ቀሪ',
    late: 'ዘግይቷል',
    excused: 'በፈቃድ',

    save: 'ለውጦችን መዝግብ',
    cancel: 'ሰርዝ',
    submit: 'አስገባ',
    search: 'ፈልግ...',
    filter: 'አጣራ',
    export_csv: 'በCSV አውርድ',
    import_csv: 'CSV አስገባ',
    bulk_import: 'በጅምላ አስገባ',
    import_step_template: 'ናሙናውን አውርድ',
    import_step_upload: 'ፋይል ጫን',
    import_step_preview: 'ቅድመ እይታ',
    import_step_confirm: 'አረጋግጥ',
    import_step_result: 'ውጤቶች',
    import_download_template: 'CSV ናሙና አውርድ',
    import_choose_file: 'CSV ወይም XLSX ፋይል ምረጥ',
    import_preview_button: 'ፋይሉን ተመልከት',
    import_error_only: 'ስህተቶች ብቻ',
    import_valid_count: 'ትክክል',
    import_error_count: 'ስህተቶች',
    import_skipped_count: 'የተዘለሉ ምሳሌዎች',
    import_confirm_button: 'ማስገባቱን አረጋግጥ',
    import_print_pin_slips: 'የPIN ወረቀቶችን አትም',
    import_close: 'ዝጋ',
    import_empty_preview: 'ረድፎቹን ለማየት ፋይል ምረጥ።',
    import_upload_help: 'እስከ 2,000 ረድፎች እና 5 MB። የምሳሌ ረድፎች በራስ-ሰር ይዘለላሉ።',
    import_loading: 'ማስገባት በሂደት ላይ ነው…',
    import_row: 'ረድፍ',
    import_status: 'ሁኔታ',
    import_reason: 'ምክንያት',
    import_all_rows: 'ሁሉም ረድፎች',
    import_result_message: 'ማስገባቱ በተሳካ ሁኔታ ተጠናቋል።',
    import_classes_count: 'የተፈጠሩ ክፍሎች',
    import_students_count: 'የገቡ ተማሪዎች',
    import_parents_count: 'የተገናኙ የወላጅ መለያዎች',
    import_back: 'ተመለስ',
    add_school: 'አዲስ ትምህርት ቤት መዝግብ',
    add_student: 'አዲስ ተማሪ መዝግብ',
    add_teacher: 'አስተማሪ መዝግብ',
    record_payment: 'ክፍያ መዝግብ',
    print_receipt: 'ደረሰኝ አትም',
    print_id_card: 'የተማሪ መታወቂያ አትም',
    print_report_card: 'የውጤት ካርድ አትም',
    mark_all_present: 'ሁሉም ተገኝተዋል',
    approve: 'አጽድቅ',
    reject: 'ውድቅ አድርግ',
    reset_password: 'የይለፍ ቃል ቀይር',
    suspend: 'እግድ አድርግ',
    reactivate: 'እንደገና አንቃ',
    renew_subscription: 'ምዝገባ አድስ',
    run_backup: 'የውሂብ ምትኬ አሁን ውሰድ',
    confirm: 'አረጋግጥ',
    delete: 'ሰርዝ',
    edit: 'አስተካክል',
    view_details: 'ዝርዝር መረጃ ይመልከቱ',
    send_message: 'መልእክት ላክ',
    
    school_code: 'የትምህርት ቤት ኮድ',
    student_id: 'የተማሪ መለያ ቁጥር',
    three_part_name: 'የተማሪ ሙሉ ስም (3 ቃላት)',
    first_name: 'ስም',
    middle_name: 'የአባት ስም',
    last_name: 'የአያት ስም',
    gender: 'ጾታ',
    male: 'ወንድ',
    female: 'ሴት',
    admission_date: 'የተመዘገበበት ቀን',
    student_phone: 'የተማሪ ስልክ',
    father_phone: 'የአባት ስልክ',
    mother_phone: 'የእናት ስልክ',
    class_name: 'ክፍል',
    amount_due: 'ጠቅላላ ክፍያ',
    amount_paid: 'የተከፈለ መጠን',
    remaining_balance: 'ቀሪ ሂሳብ',
    payment_method: 'የክፍያ ዘዴ',
    receipt_number: 'የደረሰኝ ቁጥር',
    date: 'ቀን',
    academic_year: 'የትምህርት ዓመት',
    semester: 'ሴሚስተር',
    two_factor_code: '2FA ማረጋገጫ ኮድ',
    enter_pin: 'የ4-አሃዝ ፒን ቁጥር ያስገቡ',
    read_only_banner: 'ማስጠንቀቂያ፡ የትምህርት ቤቱ ምዝገባ ስላለቀበት ለንባብ ብቻ ክፍት ነው። አዲስ መረጃ ማስገባት ወይም ማስተካከል አይቻልም።',
    student_access_disabled: 'ለዚህ ትምህርት ቤት የተማሪዎች መግቢያ በዋና አስተዳዳሪው ተዘግቷል።',
    locked_account_msg: 'መለያው በ5 የተሳሳቱ ሙከራዎች ምክንያት ለጊዜው ታግዷል። እባክዎ 15 ደቂቃ ይጠብቁ።',
    select_custom_fee: 'Select custom fee',
    payroll_management: 'Payroll and payslips', payroll_month: 'Payroll month', payroll_staff_member: 'Staff member', payroll_salary: 'Base salary', payroll_allowance: 'Additional allowance', payroll_deduction: 'Deduction', payroll_create: 'Create draft payroll', payroll_status: 'Status', payroll_net: 'Net salary', payroll_draft: 'Draft', payroll_approved: 'Approved', payroll_paid: 'Paid', payroll_approve: 'Approve', payroll_mark_paid: 'Mark paid', payroll_payslip: 'Download payslip', payroll_empty: 'No payroll records for this month.', payroll_loading: 'Loading payroll…', payroll_error: 'Payroll could not be loaded or saved.', payroll_summary: 'Summary',
    settings_identity: 'School Identity & Branding',
    settings_academics: 'Academics & Rules',
    settings_documents: 'Documents & Alerts',
    settings_branches: 'Branches',
    settings_language: 'Default Language',
    settings_timezone: 'Timezone',
    settings_student_portal: 'Student Portal Access',
    settings_student_portal_hint: 'Allow students to sign in. This is off by default and can be changed here or by the Platform Owner.',
    settings_academic_calendar: 'Academic Year, Terms & Grading',
    settings_terms: 'Term Dates',
    settings_grading_scale: 'Grading Scale',
    settings_class_levels: 'Class / Grade Levels Offered',
    settings_attendance_rules: 'Attendance Rules',
    settings_exam_marks: 'Exam Maximum Marks & Pass Mark',
    settings_pass_mark: 'Minimum Pass Mark (%)',
    settings_timetable: 'Timetable Period Settings',
    settings_report_header: 'Report Card Header',
    settings_report_footer: 'Report Card Footer',
    settings_receipt_header: 'Receipt Header',
    settings_receipt_footer: 'Receipt Footer',
    settings_notifications: 'Notification Preferences',
    settings_save_profile: 'Save Profile',
    settings_save_academics: 'Save Academic Rules',
    settings_save_exam: 'Save Exam Rules',
    settings_save_timetable: 'Save Timetable Settings',
    settings_save_documents: 'Save Documents & Alerts',
  }
};
