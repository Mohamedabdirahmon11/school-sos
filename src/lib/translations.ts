/**
 * Complete Multi-Language Localization Engine
 * Languages: English (en), Somali (so), Amharic (am)
 */

export type LanguageCode = 'en' | 'so' | 'am' | 'ar';

export function getLanguageDirection(language: LanguageCode): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

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
  exam_scheme: string;
  exam_active_subjects: string;
  exam_teacher_assignment: string;
  exam_form_teacher_review: string;
  exam_my_subject_mark_sheet: string;
  exam_submit_to_form_teacher: string;
  exam_forward_to_admin: string;
  exam_total: string;
  exam_rank: string;
  exam_all_active_subjects_submitted: string;
  exam_waiting_for_all_subjects: string;
  exam_drafts_autosaved: string;
  exam_publish_results: string;
  exam_withdraw_results: string;
  exam_return_for_correction: string;
  exam_marks: string;
  exam_class: string;
  exam_term: string;
  exam_search_student: string;
  exam_teacher_comment: string;
  exam_optional_comment: string;
  exam_save_drafts: string;
  exam_submit_marks: string;
  exam_loading_class_marks: string;
  exam_no_students: string;
  exam_reopen_subject: string;
  exam_sent_to_admin: string;
  exam_waiting_admin_review: string;
  exam_subjects_pending: string;
  exam_subjects_submitted: string;
  exam_class_review: string;
  exam_enter_component_marks: string;
  exam_edit_marks_help: string;
  exam_teacher_review_scope: string;
  exam_forward_ready: string;
  exam_term1: string;
  exam_term2: string;
  exam_form_teacher: string;
  exam_subjects_and_teachers: string;
  exam_subject_name: string;
  exam_subject_code: string;
  exam_classes_selected: string;
  exam_unassigned: string;
  exam_periods_per_week: string;
  exam_small_exam: string;
  exam_big_exam: string;
  exam_classes_subjects: string;
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
  setup_title: string;
  setup_subtitle: string;
  setup_progress: string;
  setup_current_step: string;
  setup_saved: string;
  setup_in_progress: string;
  setup_return: string;
  setup_open_step: string;
  setup_open_fees: string;
  setup_open_modules: string;
  setup_mark_complete: string;
  setup_skip_for_now: string;
  setup_completed: string;
  setup_pending: string;
  setup_skipped: string;
  setup_needs_attention: string;
  setup_optional: string;
  setup_required: string;
  setup_finish: string;
  setup_finish_help: string;
  setup_loading: string;
  setup_retry: string;
  setup_step_1_title: string;
  setup_step_1_help: string;
  setup_step_2_title: string;
  setup_step_2_help: string;
  setup_step_3_title: string;
  setup_step_3_help: string;
  setup_step_4_title: string;
  setup_step_4_help: string;
  setup_step_5_title: string;
  setup_step_5_help: string;
  setup_step_6_title: string;
  setup_step_6_help: string;
  setup_step_7_title: string;
  setup_step_7_help: string;
  setup_step_8_title: string;
  setup_step_8_help: string;
  setup_step_9_title: string;
  setup_step_9_help: string;
  setup_step_10_title: string;
  setup_step_10_help: string;
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
    platform_settings: 'Platform Settings',
    students: 'Students',
    teachers: 'Teachers',
    parents_contacts: 'Parents & Contacts',
    classes: 'Classes & Sections',
    subjects: 'Subjects & Curriculum',
    timetable: 'Timetable Matrix',
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
    attendance: 'Daily Attendance',
    exams_results: 'Exams & Marks Approval',
    exam_scheme: 'Mark scheme',
    exam_active_subjects: 'Active subjects',
    exam_teacher_assignment: 'Teacher assignment',
    exam_form_teacher_review: 'Form Teacher class review',
    exam_my_subject_mark_sheet: 'My subject mark sheet',
    exam_submit_to_form_teacher: 'Submit to Form Teacher',
    exam_forward_to_admin: 'Forward class to Admin',
    exam_total: 'Total',
    exam_rank: 'Rank',
    exam_all_active_subjects_submitted: 'All active subjects submitted · rankings ready',
    exam_waiting_for_all_subjects: 'Rankings and class totals appear after every active subject is submitted.',
    exam_drafts_autosaved: 'Draft marks autosaved.',
    exam_publish_results: 'Publish results',
    exam_withdraw_results: 'Withdraw published results',
    exam_return_for_correction: 'Return for correction',
    exam_marks: 'Marks',
    exam_class: 'Class',
    exam_term: 'Term',
    exam_search_student: 'Search student...',
    exam_teacher_comment: 'Teacher comment',
    exam_optional_comment: 'Optional comment for the report card',
    exam_save_drafts: 'Save drafts',
    exam_submit_marks: 'Submit marks',
    exam_loading_class_marks: 'Loading class marks...',
    exam_no_students: 'No students found in this class.',
    exam_reopen_subject: 'Reopen subject',
    exam_sent_to_admin: 'Sent to Admin · waiting for review',
    exam_waiting_admin_review: 'Waiting for Admin review',
    exam_subjects_pending: 'Waiting',
    exam_subjects_submitted: 'Submitted',
    exam_class_review: 'Class results review',
    exam_enter_component_marks: 'Enter individual assessment components',
    exam_edit_marks_help: 'Edit the subject marks below, then save or submit',
    exam_teacher_review_scope: 'Form Teacher can review every active class subject, but can enter marks only for their assigned subject.',
    exam_forward_ready: 'Class is complete and ready to forward to School Admin.',
    exam_term1: 'Term 1',
    exam_term2: 'Term 2',
    exam_form_teacher: 'Form Teacher',
    exam_subjects_and_teachers: 'Subjects and teachers',
    exam_subject_name: 'Subject name',
    exam_subject_code: 'Subject code',
    exam_classes_selected: 'classes selected',
    exam_unassigned: 'Unassigned',
    exam_periods_per_week: 'Periods/week',
    exam_small_exam: 'Small exam',
    exam_big_exam: 'Big exam',
    exam_classes_subjects: 'Classes & Subjects',
    assignments: 'Homework & Assignments',
    fees_payments: 'Student Fees & Ledger',
    events_holidays: 'Academic Calendar',
    notice_board: 'Notice Board',
    messages: 'Direct Messages',
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
    admissions: 'Admissions Pipeline',
    staff_access: 'Staff Roles & Permissions',
    staff_signin_identifier: 'Email or Staff ID',
    staff_signin_placeholder: 'name@school.com or STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'Use the temporary password from your Super Admin. Your Gmail password is not used for SchoolOS.',
    first_time_password_hint: 'Create a password different from your temporary sign-in password. It must be at least 8 characters.',
    staff_id: 'Staff ID',
    staff_id_generated_hint: 'Leave blank to generate a unique ID',
    reports_export: 'Financial & Attendance Reports',
    report_cards: 'Student Report Cards',
    school_settings: 'School Configuration',
    library: 'Library Catalogue & Loans',
    transport: 'Transport Routes & Buses',
    discipline: 'Discipline & Behaviour Logs',
    health_nurse: 'Clinic & Health Records',
    certificates_id: 'Printable ID Cards & Badges',
    payroll_staff: 'Staff Payroll & Payslips',
    inventory: 'Inventory & School Assets',
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
    setup_title: 'Set up your school',
    setup_subtitle: 'Follow these steps to prepare your school before opening the dashboard.',
    setup_progress: 'Setup progress',
    setup_current_step: 'Current step',
    setup_saved: 'Your progress is saved automatically. You can leave and continue later.',
    setup_in_progress: 'School setup is still in progress. Complete the required steps before opening the dashboard.',
    setup_return: 'Back to setup checklist',
    setup_open_step: 'Open this section',
    setup_open_fees: 'Open fees',
    setup_open_modules: 'Open modules',
    setup_mark_complete: 'Verify and mark complete',
    setup_skip_for_now: 'Skip for now',
    setup_completed: 'Completed',
    setup_pending: 'Not completed',
    setup_skipped: 'Skipped for now',
    setup_needs_attention: 'Needs attention',
    setup_optional: 'Optional',
    setup_required: 'Required',
    setup_finish: 'Complete setup and open Dashboard',
    setup_finish_help: 'Steps 1–6 and 8 are required. Steps 7 and 9 can be completed now or skipped and configured later.',
    setup_loading: 'Loading setup progress…',
    setup_retry: 'Retry',
    setup_step_1_title: 'Academic year and semesters',
    setup_step_1_help: 'Set the academic year and the start and end dates for both semesters.',
    setup_step_2_title: 'School information and admin WhatsApp',
    setup_step_2_help: 'Confirm the school identity and save the administration WhatsApp number with its international country code.',
    setup_step_3_title: 'Classes and grades',
    setup_step_3_help: 'Create the school classes, including both KG 1 and KG 2.',
    setup_step_4_title: 'Subjects',
    setup_step_4_help: 'Add the subjects taught by this school.',
    setup_step_5_title: 'Teachers and staff IDs',
    setup_step_5_help: 'Create teacher accounts with a school-specific Teacher ID and an initial PIN or password.',
    setup_step_6_title: 'Students and parents',
    setup_step_6_help: 'Register students, parent contact details, and use bulk import or PIN reset where needed.',
    setup_step_7_title: 'Timetable',
    setup_step_7_help: 'Create the class timetable. You can skip this step and return to it later.',
    setup_step_8_title: 'Attendance and exams',
    setup_step_8_help: 'Review attendance rules and exam settings for this academic year.',
    setup_step_9_title: 'Fees and other modules',
    setup_step_9_help: 'Review optional modules. Fee structures are managed by the school Accountant role.',
    setup_step_10_title: 'Final review',
    setup_step_10_help: 'Confirm the required setup is complete, then open the normal school dashboard.',
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
    platform_settings: 'Hagaajinta Nidaamka',
    students: 'Ardayda',
    teachers: 'Macallimiinta',
    parents_contacts: 'Waalidiinta & Xiriirka',
    classes: 'Fasallada & Qaybaha',
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
    attendance: 'Xaadirinta Maalinlaha ah',
    exams_results: 'Imtixaanaadka & Natiijooyinka',
    exam_scheme: 'Qaabka dhibcaha',
    exam_active_subjects: 'Maaddooyinka firfircoon',
    exam_teacher_assignment: 'Macallinka maaddada',
    exam_form_teacher_review: 'Hubinta Form Teacher-ka',
    exam_my_subject_mark_sheet: 'Warqadda maaddooyinkayga',
    exam_submit_to_form_teacher: 'U gudbi Form Teacher-ka',
    exam_forward_to_admin: 'Fasalka u gudbi Maamulka',
    exam_total: 'Wadar',
    exam_rank: 'Kaalin',
    exam_all_active_subjects_submitted: 'Dhammaan maaddooyinka waa la gudbiyey · kaalintu waa diyaar',
    exam_waiting_for_all_subjects: 'Wadarta iyo kaalintu waxay muuqanayaan marka maaddooyinka oo dhan la gudbiyo.',
    exam_drafts_autosaved: 'Qoraallada dhibcaha si toos ah ayaa loo kaydiyey.',
    exam_publish_results: 'Daabac natiijooyinka',
    exam_withdraw_results: 'Ka noqo daabacaadda natiijooyinka',
    exam_return_for_correction: 'Ku celi sixitaan',
    exam_marks: 'Dhibco',
    exam_class: 'Fasal',
    exam_term: 'Term',
    exam_search_student: 'Raadi arday...',
    exam_teacher_comment: 'Faallada macallinka',
    exam_optional_comment: 'Faallo ikhtiyaari ah oo Report Card-ka ah',
    exam_save_drafts: 'Kaydi qoraallada',
    exam_submit_marks: 'Gudbi dhibcaha',
    exam_loading_class_marks: 'Dhibcaha fasalka waa la soo rarayaa...',
    exam_no_students: 'Fasalkan arday lagama helin.',
    exam_reopen_subject: 'Dib u fur maaddada',
    exam_sent_to_admin: 'Maamulka ayaa loo gudbiyey · dib-u-eegis sugaya',
    exam_waiting_admin_review: 'Maamulka ayaa dib u eegaya',
    exam_subjects_pending: 'Sugaya',
    exam_subjects_submitted: 'La gudbiyey',
    exam_class_review: 'Dib-u-eegista natiijada fasalka',
    exam_enter_component_marks: 'Geli qaybaha dhibcaha',
    exam_edit_marks_help: 'Wax ka beddel dhibcaha maaddada, kadib kaydi ama gudbi',
    exam_teacher_review_scope: 'Form Teacher-ku wuxuu arki karaa dhammaan maaddooyinka fasalka, balse wuxuu geli karaa dhibcaha maaddada isaga loo xilsaaray oo keliya.',
    exam_forward_ready: 'Fasalku wuu dhammaystiran yahay, wuxuuna diyaar u yahay in loo gudbiyo Maamulka.',
    exam_term1: 'Term 1',
    exam_term2: 'Term 2',
    exam_form_teacher: 'Macallinka fasalka',
    exam_subjects_and_teachers: 'Maaddooyinka iyo macallimiinta',
    exam_subject_name: 'Magaca maaddada',
    exam_subject_code: 'Koodhka maaddada',
    exam_classes_selected: 'fasal ayaa la doortay',
    exam_unassigned: 'Lama qoondeyn',
    exam_periods_per_week: 'Casharro/toddobaad',
    exam_small_exam: 'Imtixaan yar',
    exam_big_exam: 'Imtixaan weyn',
    exam_classes_subjects: 'Fasallada iyo Maaddooyinka',
    assignments: 'Laylisyada & Shaqo-guri',
    fees_payments: 'Lacagaha & Kharashaadka',
    events_holidays: 'Jadwalka Fasaxyada',
    notice_board: 'Guddiga Ogeysiisyada',
    messages: 'Farriimaha Tooska ah',
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
    admissions: 'Diiwaangelinta Cusub',
    staff_access: 'Shaqaalaha & Ogolaanshaha',
    staff_signin_identifier: 'Iimayl ama Aqoonsiga Shaqaalaha',
    staff_signin_placeholder: 'name@school.com ama STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'Isticmaal furaha ku-meel-gaarka ah ee Maamulaha Guud ku siiyay. Furaha Gmail-kaaga laguma galo SchoolOS.',
    first_time_password_hint: 'Sameyso furaha sirta ah oo ka duwan kii ku-meel-gaarka ahaa ee aad ku gashay. Waa inuu ka koobnaadaa ugu yaraan 8 xaraf.',
    staff_id: 'Aqoonsiga Shaqaalaha',
    staff_id_generated_hint: 'Madhan ka tag si aqoonsi gaar ah loo sameeyo',
    reports_export: 'Warbixinnada & Dhoofinta',
    report_cards: 'Kaarka Natiijada',
    school_settings: 'Hagaajinta Dugsiga',
    library: 'Maktabadda & Buugaagta',
    transport: 'Gaadiidka & Basaska',
    discipline: 'Anshaxa & Anshax-marinta',
    health_nurse: 'Qolka Caafimaadka',
    certificates_id: 'Kaararka Aqoonsiga',
    payroll_staff: 'Mushaharka Macallimiinta',
    inventory: 'Hantida Dugsiga',
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
    setup_title: 'Deji dugsigaaga',
    setup_subtitle: 'Raac tallaabooyinkan si aad dugsiga u diyaariso ka hor inta aan Dashboard-ka la furin.',
    setup_progress: 'Horumarka dejinta',
    setup_current_step: 'Tallaabada hadda',
    setup_saved: 'Horumarka si toos ah ayaa loo kaydiyaa. Waad ka bixi kartaa oo mar dambe waad sii wadan kartaa.',
    setup_in_progress: 'Dejinta dugsigu weli way socotaa. Dhammaystir tallaabooyinka muhiimka ah ka hor Dashboard-ka.',
    setup_return: 'Ku noqo liiska dejinta',
    setup_open_step: 'Fur qaybtaan',
    setup_open_fees: 'Fur khidmadaha',
    setup_open_modules: 'Fur qaybaha kale',
    setup_mark_complete: 'Hubi oo calaamadee inay dhammaatay',
    setup_skip_for_now: 'Hadda ka bood',
    setup_completed: 'Way dhammaatay',
    setup_pending: 'Weli ma dhammaan',
    setup_skipped: 'Hadda waa laga booday',
    setup_needs_attention: 'Waxay u baahan tahay sixid',
    setup_optional: 'Ikhtiyaari',
    setup_required: 'Waajib',
    setup_finish: 'Dhammaystir dejinta oo fur Dashboard-ka',
    setup_finish_help: 'Tallaabooyinka 1–6 iyo 8 waa waajib. Tallaabooyinka 7 iyo 9 waad dhammayn kartaa ama hadda waad ka boodi kartaa.',
    setup_loading: 'Horumarka dejinta waa la soo rarayaa…',
    setup_retry: 'Mar kale isku day',
    setup_step_1_title: 'Sannad-dugsiyeedka iyo simistarrada',
    setup_step_1_help: 'Deji sannad-dugsiyeedka iyo taariikhaha bilowga iyo dhammaadka labada simistar.',
    setup_step_2_title: 'Xogta dugsiga iyo WhatsApp-ka maamulka',
    setup_step_2_help: 'Xaqiiji aqoonsiga dugsiga oo kaydi lambarka WhatsApp-ka maamulka oo leh furaha waddanka.',
    setup_step_3_title: 'Fasallada iyo heerarka',
    setup_step_3_help: 'Samee fasallada dugsiga, kuna dar KG 1 iyo KG 2 labadaba.',
    setup_step_4_title: 'Maaddooyinka',
    setup_step_4_help: 'Ku dar maaddooyinka dugsiga laga dhigo.',
    setup_step_5_title: 'Macallimiinta iyo aqoonsiga shaqaalaha',
    setup_step_5_help: 'Samee akoonnada macallimiinta oo leh Teacher ID u gaar ah dugsiga iyo PIN ama password bilow ah.',
    setup_step_6_title: 'Ardayda iyo waalidiinta',
    setup_step_6_help: 'Diiwaangeli ardayda iyo xiriirka waalidiinta; isticmaal bulk import ama PIN reset marka loo baahdo.',
    setup_step_7_title: 'Jadwalka casharrada',
    setup_step_7_help: 'Samee jadwalka fasallada. Waad ka boodi kartaa oo dib ayaad ugu soo noqon kartaa.',
    setup_step_8_title: 'Imaanshaha iyo imtixaannada',
    setup_step_8_help: 'Dib u eeg xeerarka imaanshaha iyo dejimaha imtixaannada sannad-dugsiyeedkan.',
    setup_step_9_title: 'Lacagaha iyo qaybaha kale',
    setup_step_9_help: 'Dib u eeg qaybaha ikhtiyaariga ah. Khidmadaha waxaa maamula Xisaabiyaha dugsiga.',
    setup_step_10_title: 'Hubinta ugu dambaysa',
    setup_step_10_help: 'Xaqiiji in dejinta waajibka ahi dhammaatay, kadibna fur Dashboard-ka dugsiga.',
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
    platform_settings: 'የስርዓት ቅንብሮች',
    students: 'ተማሪዎች',
    teachers: 'መምህራን',
    parents_contacts: 'ወላጆች እና አድራሻዎች',
    classes: 'ክፍሎች',
    subjects: 'የትምህርት አይነቶች',
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
    attendance: 'የዕለት መገኘት',
    exams_results: 'ፈተናዎች እና ውጤቶች',
    exam_scheme: 'የውጤት ነጥብ አወቃቀር',
    exam_active_subjects: 'ንቁ ትምህርቶች',
    exam_teacher_assignment: 'የመምህር ምደባ',
    exam_form_teacher_review: 'የክፍል አስተማሪ ግምገማ',
    exam_my_subject_mark_sheet: 'የእኔ ትምህርት ውጤት ሰንጠረዥ',
    exam_submit_to_form_teacher: 'ለክፍል አስተማሪ አስገባ',
    exam_forward_to_admin: 'ክፍሉን ለአስተዳደር አስተላልፍ',
    exam_total: 'ድምር',
    exam_rank: 'ደረጃ',
    exam_all_active_subjects_submitted: 'ሁሉም ንቁ ትምህርቶች ቀርበዋል · ደረጃዎች ዝግጁ ናቸው',
    exam_waiting_for_all_subjects: 'ደረጃዎችና ድምሮች ሁሉም ንቁ ትምህርቶች ከቀረቡ በኋላ ይታያሉ።',
    exam_drafts_autosaved: 'የጊዜያዊ ውጤቶች በራስ-ሰር ተቀምጠዋል።',
    exam_publish_results: 'ውጤቶችን አትም',
    exam_withdraw_results: 'የታተሙ ውጤቶችን አንሳ',
    exam_return_for_correction: 'ለማስተካከያ መልስ',
    exam_marks: 'ውጤቶች',
    exam_class: 'ክፍል',
    exam_term: 'ተርም',
    exam_search_student: 'ተማሪ ፈልግ...',
    exam_teacher_comment: 'የመምህር አስተያየት',
    exam_optional_comment: 'ለሪፖርት ካርዱ አማራጭ አስተያየት',
    exam_save_drafts: 'ረቂቆችን አስቀምጥ',
    exam_submit_marks: 'ውጤቶችን አስገባ',
    exam_loading_class_marks: 'የክፍል ውጤቶች በመጫን ላይ...',
    exam_no_students: 'በዚህ ክፍል ተማሪ አልተገኘም።',
    exam_reopen_subject: 'ትምህርቱን እንደገና ክፈት',
    exam_sent_to_admin: 'ለአስተዳደር ተልኳል · ግምገማ በመጠባበቅ ላይ',
    exam_waiting_admin_review: 'የአስተዳደር ግምገማ በመጠባበቅ ላይ',
    exam_subjects_pending: 'በመጠባበቅ ላይ',
    exam_subjects_submitted: 'ቀርቧል',
    exam_class_review: 'የክፍል ውጤት ግምገማ',
    exam_enter_component_marks: 'የነጥብ ክፍሎችን አስገባ',
    exam_edit_marks_help: 'የትምህርቱን ውጤት አርትዕ ከዚያ አስቀምጥ ወይም አስገባ',
    exam_teacher_review_scope: 'የክፍል አስተማሪው ሁሉንም ንቁ ትምህርቶች ማየት ይችላል፣ ግን ለእሱ የተመደበውን ትምህርት ብቻ ያስገባል።',
    exam_forward_ready: 'ክፍሉ ተጠናቋል እና ለአስተዳደር ለመላክ ዝግጁ ነው።',
    exam_term1: 'ተርም 1',
    exam_term2: 'ተርም 2',
    exam_form_teacher: 'የክፍል አስተማሪ',
    exam_subjects_and_teachers: 'ትምህርቶችና መምህራን',
    exam_subject_name: 'የትምህርት ስም',
    exam_subject_code: 'የትምህርት ኮድ',
    exam_classes_selected: 'ክፍሎች ተመርጠዋል',
    exam_unassigned: 'አልተመደበም',
    exam_periods_per_week: 'በሳምንት ክፍለ ጊዜዎች',
    exam_small_exam: 'አነስተኛ ፈተና',
    exam_big_exam: 'ትልቅ ፈተና',
    exam_classes_subjects: 'ክፍሎችና ትምህርቶች',
    assignments: 'የቤት ስራዎች',
    fees_payments: 'የተማሪ ክፍያዎች',
    events_holidays: 'የዓመቱ የቀን መቁጠሪያ',
    notice_board: 'የማስታወቂያ ሰሌዳ',
    messages: 'ቀጥታ መልዕክቶች',
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
    admissions: 'አዲስ ምዝገባ',
    staff_access: 'ሰራተኞች እና ፈቃዶች',
    staff_signin_identifier: 'ኢሜይል ወይም የሰራተኛ መታወቂያ',
    staff_signin_placeholder: 'name@school.com ወይም STF-SCHOOL-0001',
    school_admin_initial_password_hint: 'በዋና አስተዳዳሪው የተሰጠዎትን ጊዜያዊ የይለፍ ቃል ይጠቀሙ። የGmail የይለፍ ቃልዎ ወደ SchoolOS ለመግባት አይጠቅምም።',
    first_time_password_hint: 'ከጊዜያዊ የመግቢያ የይለፍ ቃልዎ የተለየ የይለፍ ቃል ይፍጠሩ። ቢያንስ 8 ቁምፊዎች መሆን አለበት።',
    staff_id: 'የሰራተኛ መታወቂያ',
    staff_id_generated_hint: 'ልዩ መታወቂያ ለማመንጨት ባዶ ይተዉ',
    reports_export: 'ሪፖርቶች',
    report_cards: 'የውጤት ካርድ',
    school_settings: 'የትምህርት ቤት ቅንብሮች',
    library: 'ቤተ-መጽሐፍት',
    transport: 'የትራንስፖርት አገልግሎት',
    discipline: 'የስነ-ምግባር መዝገብ',
    health_nurse: 'የህክምና ክፍል',
    certificates_id: 'የመታወቂያ ካርዶች',
    payroll_staff: 'የደመወዝ ክፍያ',
    inventory: 'ንብረት እና እቃዎች',
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
    setup_title: 'ትምህርት ቤትዎን ያዘጋጁ',
    setup_subtitle: 'ዳሽቦርዱን ከመክፈትዎ በፊት ትምህርት ቤቱን ለማዘጋጀት እነዚህን ደረጃዎች ይከተሉ።',
    setup_progress: 'የዝግጅት ሂደት',
    setup_current_step: 'የአሁኑ ደረጃ',
    setup_saved: 'እድገትዎ በራስ-ሰር ይቀመጣል። ወጥተው በኋላ መቀጠል ይችላሉ።',
    setup_in_progress: 'የትምህርት ቤቱ ዝግጅት ገና አልተጠናቀቀም። ዳሽቦርዱን ከመክፈትዎ በፊት አስፈላጊ ደረጃዎችን ያጠናቅቁ።',
    setup_return: 'ወደ ዝግጅት ዝርዝር ተመለስ',
    setup_open_step: 'ይህን ክፍል ክፈት',
    setup_open_fees: 'የክፍያ ክፍልን ክፈት',
    setup_open_modules: 'ሌሎች ሞጁሎችን ክፈት',
    setup_mark_complete: 'አረጋግጥ እና ተጠናቋል ብለህ ምልክት አድርግ',
    setup_skip_for_now: 'ለአሁን ዝለል',
    setup_completed: 'ተጠናቋል',
    setup_pending: 'አልተጠናቀቀም',
    setup_skipped: 'ለአሁን ተዘልሏል',
    setup_needs_attention: 'ተጨማሪ ማስተካከያ ያስፈልጋል',
    setup_optional: 'አማራጭ',
    setup_required: 'አስፈላጊ',
    setup_finish: 'ዝግጅቱን ጨርስ እና ዳሽቦርዱን ክፈት',
    setup_finish_help: 'ደረጃዎች 1–6 እና 8 አስፈላጊ ናቸው። ደረጃዎች 7 እና 9 አሁን ማጠናቀቅ ወይም ለጊዜው መዝለል ይችላሉ።',
    setup_loading: 'የዝግጅት ሂደት በመጫን ላይ…',
    setup_retry: 'እንደገና ሞክር',
    setup_step_1_title: 'የትምህርት ዓመት እና ሴሚስተሮች',
    setup_step_1_help: 'የትምህርት ዓመቱን እና የሁለቱን ሴሚስተሮች መጀመሪያና መጨረሻ ቀናት ያዘጋጁ።',
    setup_step_2_title: 'የትምህርት ቤት መረጃ እና የአስተዳደር WhatsApp',
    setup_step_2_help: 'የትምህርት ቤቱን መለያ ያረጋግጡ እና የአስተዳደሩን WhatsApp ቁጥር ከአገር መለያ ጋር ያስቀምጡ።',
    setup_step_3_title: 'ክፍሎች እና ደረጃዎች',
    setup_step_3_help: 'የትምህርት ቤቱን ክፍሎች ይፍጠሩ፤ KG 1 እና KG 2 ሁለቱንም ያካትቱ።',
    setup_step_4_title: 'ትምህርቶች',
    setup_step_4_help: 'በዚህ ትምህርት ቤት የሚሰጡ ትምህርቶችን ያክሉ።',
    setup_step_5_title: 'መምህራን እና የሰራተኛ መለያ',
    setup_step_5_help: 'ለእያንዳንዱ መምህር የትምህርት ቤቱ ልዩ Teacher ID እና የመጀመሪያ PIN ወይም password ያለው መለያ ይፍጠሩ።',
    setup_step_6_title: 'ተማሪዎች እና ወላጆች',
    setup_step_6_help: 'ተማሪዎችንና የወላጆችን የግንኙነት መረጃ ያስመዝግቡ፤ bulk import ወይም PIN reset ይጠቀሙ።',
    setup_step_7_title: 'የክፍል ጊዜ ሰሌዳ',
    setup_step_7_help: 'የክፍሎችን የጊዜ ሰሌዳ ያዘጋጁ። ይህን ደረጃ ዘልለው በኋላ መመለስ ይችላሉ።',
    setup_step_8_title: 'ክትትል እና ፈተናዎች',
    setup_step_8_help: 'የክትትል ህጎችን እና የዚህን የትምህርት ዓመት የፈተና ቅንብሮች ይመልከቱ።',
    setup_step_9_title: 'ክፍያዎች እና ሌሎች ሞጁሎች',
    setup_step_9_help: 'አማራጭ ሞጁሎችን ይመልከቱ። የክፍያ መዋቅሮችን የትምህርት ቤቱ ሂሳብ ሹም ያስተዳድራል።',
    setup_step_10_title: 'የመጨረሻ ማረጋገጫ',
    setup_step_10_help: 'አስፈላጊ ዝግጅቶች መጠናቀቃቸውን ያረጋግጡ፤ ከዚያ የትምህርት ቤቱን ዳሽቦርድ ይክፈቱ።',

  },
  ar: {
    exam_marks: 'الدرجات',
    app_name: 'SchoolOS Cloud',
    super_admin: 'مدير المنصة',
    school_admin: 'مدير المدرسة',
    teacher: 'المعلم',
    parent: 'ولي الأمر',
    student: 'الطالب',
    accountant: 'المحاسب',
    dashboard: 'لوحة التحكم',
    schools: 'المدارس',
    plans_billing: 'الخطط والفواتير',
    users: 'المستخدمون',
    analytics: 'التحليلات',
    broadcasts: 'إعلانات المنصة',
    support_audit: 'الدعم وسجل التدقيق',
    platform_settings: 'إعدادات المنصة',
    students: 'الطلاب',
    teachers: 'المعلمون',
    parents_contacts: 'أولياء الأمور وجهات الاتصال',
    classes: 'الفصول',
    subjects: 'المواد الدراسية',
    timetable: 'الجدول الدراسي',
    attendance: 'الحضور',
    exams_results: 'الامتحانات والنتائج',
    exam_scheme: 'نظام الدرجات',
    exam_active_subjects: 'المواد النشطة',
    exam_teacher_assignment: 'تعيين المعلم',
    exam_form_teacher_review: 'مراجعة معلم الصف',
    exam_my_subject_mark_sheet: 'كشف درجات موادي',
    exam_submit_to_form_teacher: 'إرسال إلى معلم الصف',
    exam_forward_to_admin: 'إرسال الصف إلى الإدارة',
    exam_total: 'المجموع',
    exam_rank: 'الترتيب',
    exam_all_active_subjects_submitted: 'تم تسليم جميع المواد النشطة · الترتيب جاهز',
    exam_waiting_for_all_subjects: 'يظهر المجموع والترتيب بعد تسليم جميع المواد النشطة.',
    exam_drafts_autosaved: 'تم حفظ مسودات الدرجات تلقائياً.',
    exam_publish_results: 'نشر النتائج',
    exam_withdraw_results: 'سحب النتائج المنشورة',
    exam_return_for_correction: 'إرجاع للتصحيح',
    exam_class: 'الصف',
    exam_term: 'الفصل',
    exam_search_student: 'ابحث عن طالب...',
    exam_teacher_comment: 'تعليق المعلم',
    exam_optional_comment: 'تعليق اختياري لبطاقة التقرير',
    exam_save_drafts: 'حفظ المسودات',
    exam_submit_marks: 'إرسال الدرجات',
    exam_loading_class_marks: 'جارٍ تحميل درجات الصف...',
    exam_no_students: 'لا يوجد طلاب في هذا الصف.',
    exam_reopen_subject: 'إعادة فتح المادة',
    exam_sent_to_admin: 'أُرسلت إلى الإدارة · بانتظار المراجعة',
    exam_waiting_admin_review: 'بانتظار مراجعة الإدارة',
    exam_subjects_pending: 'قيد الانتظار',
    exam_subjects_submitted: 'تم التسليم',
    exam_class_review: 'مراجعة نتائج الصف',
    exam_enter_component_marks: 'إدخال أجزاء الدرجات',
    exam_edit_marks_help: 'عدّل درجات المادة ثم احفظ أو أرسل',
    exam_teacher_review_scope: 'يمكن لمعلم الصف مراجعة جميع المواد النشطة، لكنه يدخل درجات المادة المعيّنة له فقط.',
    exam_forward_ready: 'اكتمل الصف وأصبح جاهزاً للإرسال إلى الإدارة.',
    exam_term1: 'الفصل الأول',
    exam_term2: 'الفصل الثاني',
    exam_form_teacher: 'معلم الصف',
    exam_subjects_and_teachers: 'المواد والمعلمون',
    exam_subject_name: 'اسم المادة',
    exam_subject_code: 'رمز المادة',
    exam_classes_selected: 'صفوف محددة',
    exam_unassigned: 'غير معيّن',
    exam_periods_per_week: 'الحصص/الأسبوع',
    exam_small_exam: 'اختبار قصير',
    exam_big_exam: 'اختبار نهائي',
    exam_classes_subjects: 'الفصول والمواد',
    assignments: 'الواجبات',
    fees_payments: 'الرسوم والمدفوعات',
    events_holidays: 'الفعاليات والعطلات',
    notice_board: 'لوحة الإعلانات',
    messages: 'الرسائل',
    add_notice: 'إضافة إعلان',
    edit_notice: 'تعديل الإعلان',
    archive_notice: 'أرشفة الإعلان',
    notice_title: 'عنوان الإعلان',
    notice_details: 'تفاصيل الإعلان',
    audience_everyone: 'الجميع',
    audience_school: 'المدرسة',
    audience_class: 'الفصل',
    admissions: 'القبول والتسجيل',
    staff_access: 'صلاحيات الموظفين',
    reports_export: 'التقارير والتصدير',
    report_cards: 'كشوف الدرجات',
    school_settings: 'إعدادات المدرسة',
    library: 'المكتبة',
    transport: 'النقل المدرسي',
    discipline: 'السلوك والانضباط',
    health_nurse: 'الصحة المدرسية',
    certificates_id: 'الشهادات والبطاقات',
    payroll_staff: 'رواتب الموظفين',
    inventory: 'المخزون',
    logout: 'تسجيل الخروج',
    trial: 'تجريبي',
    active: 'نشط',
    grace: 'فترة سماح',
    read_only: 'للقراءة فقط',
    suspended: 'موقوف',
    paid: 'مدفوع',
    partial: 'مدفوع جزئياً',
    unpaid: 'غير مدفوع',
    present: 'حاضر',
    absent: 'غائب',
    late: 'متأخر',
    excused: 'بعذر',
    save: 'حفظ',
    cancel: 'إلغاء',
    submit: 'إرسال',
    search: 'بحث',
    filter: 'تصفية',
    export_csv: 'تصدير CSV',
    import_csv: 'استيراد CSV',
    add_school: 'إضافة مدرسة',
    add_student: 'إضافة طالب',
    add_teacher: 'إضافة معلم',
    record_payment: 'تسجيل دفعة',
    print_receipt: 'طباعة إيصال',
    print_id_card: 'طباعة بطاقة الطالب',
    print_report_card: 'طباعة كشف الدرجات',
    mark_all_present: 'تحديد الجميع حاضرين',
    approve: 'اعتماد',
    reject: 'رفض',
    reset_password: 'إعادة تعيين كلمة المرور',
    suspend: 'إيقاف',
    reactivate: 'إعادة تفعيل',
    confirm: 'تأكيد',
    delete: 'حذف',
    edit: 'تعديل',
    view_details: 'عرض التفاصيل',
    send_message: 'إرسال رسالة',
    school_code: 'رمز المدرسة',
    student_id: 'رقم الطالب',
    gender: 'الجنس',
    male: 'ذكر',
    female: 'أنثى',
    class_name: 'اسم الفصل',
    academic_year: 'السنة الدراسية',
    semester: 'الفصل الدراسي',
    settings_identity: 'هوية المدرسة والعلامة التجارية',
    settings_academics: 'الشؤون الأكاديمية والقواعد',
    settings_documents: 'المستندات والتنبيهات',
    settings_language: 'اللغة الافتراضية',
    settings_timezone: 'المنطقة الزمنية',
    settings_student_portal: 'بوابة الطالب',
    settings_academic_calendar: 'السنة الدراسية والتقييم',
    settings_terms: 'مواعيد الفصول الدراسية',
    settings_grading_scale: 'مقياس الدرجات',
    settings_attendance_rules: 'قواعد الحضور',
    settings_exam_marks: 'درجات الامتحان والدرجة النهائية',
    settings_pass_mark: 'الحد الأدنى للنجاح (%)',
    settings_report_header: 'عنوان كشف الدرجات',
    settings_report_footer: 'تذييل كشف الدرجات',
    settings_save_profile: 'حفظ الملف الشخصي',
    settings_save_academics: 'حفظ القواعد الأكاديمية',
    settings_save_exam: 'حفظ قواعد الامتحان'
  } as TranslationDict
};
