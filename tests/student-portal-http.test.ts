import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'student-portal-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const db = storage.db;
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa'}).format(new Date());
const makeSchool=(name:string,code:string)=>db.createSchool({
 name,code,address:'',city:'',phone:'',email:code.toLowerCase()+'@example.test',currency:'ETB',
 academicYear:'2026-2027',currentSemester:'Semester 1',defaultClassCapacity:30,studentAccessEnabled:true,
 subscription:{plan:'basic',cadence:'yearly',status:'active',startDate:today,validUntil:'2099-12-31',graceDays:7,pricePaid:0,autoRenew:false}
} as any);
const school=makeSchool('Student Portal Acceptance','SPACC');
const otherSchool=makeSchool('Student Portal Other Tenant','SPOT');
const makeUser=(schoolId:string,role:string,name:string,extra:Record<string,unknown>={})=>db.createUser({
 schoolId,role,fullName:name,email:name.toLowerCase().replace(/[^a-z]+/g,'.')+'@example.test',passwordHash:'',isBlocked:false,failedLoginAttempts:0,...extra
} as any);
const formUser=makeUser(school.id,'teacher','Form Teacher');
const subjectUser=makeUser(school.id,'teacher','Subject Teacher');
const otherTeacherUser=makeUser(school.id,'teacher','Other Class Teacher');
const parentUser=makeUser(school.id,'parent','Student Parent');
const adminUser=makeUser(school.id,'school_admin','Student Admin');
const formTeacher=db.createTeacher({schoolId:school.id,userId:formUser.id,staffId:'SP-FORM',fullName:formUser.fullName,email:formUser.email!,phone:'',gender:'female',qualification:'B.Ed',department:'General',assignedClasses:[],assignedSubjects:[],status:'active',joinedDate:today,monthlySalary:1000});
const subjectTeacher=db.createTeacher({schoolId:school.id,userId:subjectUser.id,staffId:'SP-SUB',fullName:subjectUser.fullName,email:subjectUser.email!,phone:'',gender:'male',qualification:'B.Ed',department:'Math',assignedClasses:[],assignedSubjects:[],status:'active',joinedDate:today,monthlySalary:1000});
const otherTeacher=db.createTeacher({schoolId:school.id,userId:otherTeacherUser.id,staffId:'SP-OTHER',fullName:otherTeacherUser.fullName,email:otherTeacherUser.email!,phone:'',gender:'male',qualification:'B.Ed',department:'Science',assignedClasses:[],assignedSubjects:[],status:'active',joinedDate:today,monthlySalary:1000});
const klass=db.createClass({schoolId:school.id,name:'Grade 8',gradeLevel:8,section:'A',roomNumber:'',capacity:30,monthlyFee:0,classTeacherId:formUser.id} as any);
const otherClass=db.createClass({schoolId:school.id,name:'Grade 9',gradeLevel:9,section:'B',roomNumber:'',capacity:30,monthlyFee:0,classTeacherId:otherTeacherUser.id} as any);
const tenantClass=db.createClass({schoolId:otherSchool.id,name:'Tenant Grade',gradeLevel:8,section:'A',roomNumber:'',capacity:30,monthlyFee:0} as any);
const subject=db.createSubject({schoolId:school.id,name:'Mathematics',code:'MATH',category:'core',isActive:true} as any);
const otherSubject=db.createSubject({schoolId:school.id,name:'Science',code:'SCI',category:'core',isActive:true} as any);
const student=db.createStudent({schoolId:school.id,studentId:'SP-ST-001',firstName:'Faadumo',middleName:'Axmed',lastName:'Cabdi',gender:'female',admissionDate:today,fatherPhone:'+251900000001',classId:klass.id,status:'active'} as any);
const sameClassStudent=db.createStudent({schoolId:school.id,studentId:'SP-ST-002',firstName:'Other',middleName:'',lastName:'Student',gender:'male',admissionDate:today,fatherPhone:'',classId:klass.id,status:'active'} as any);
const tenantStudent=db.createStudent({schoolId:otherSchool.id,studentId:'SP-OTHER-001',firstName:'Tenant',middleName:'',lastName:'Student',gender:'male',admissionDate:today,fatherPhone:'',classId:tenantClass.id,status:'active'} as any);
const studentUser=makeUser(school.id,'student','Faadumo Axmed',{studentId:student.studentId});
const sameClassStudentUser=makeUser(school.id,'student','Other Student',{studentId:sameClassStudent.studentId});
const wrongTenantLink=makeUser(school.id,'student','Wrong Tenant Link',{studentId:tenantStudent.studentId});
parentUser.linkedStudentIds=[student.id];
await db.flush();
await memory.from('class_subjects').insert([
 {id:'sp-cs-math',school_id:school.id,class_id:klass.id,subject_id:subject.id,teacher_id:subjectTeacher.id,'teachers.user_id':subjectUser.id,'teachers.school_id':school.id,periods_per_week:3,is_active:true},
 {id:'sp-cs-science',school_id:school.id,class_id:otherClass.id,subject_id:otherSubject.id,teacher_id:otherTeacher.id,'teachers.user_id':otherTeacherUser.id,'teachers.school_id':school.id,periods_per_week:2,is_active:true}
]);
await db.flush();

function cookieFor(user:any,label:string){
 const expiresAt=Date.now()+5*60_000,sessionId='student-portal-'+label;
 db.createSession({id:sessionId,userId:user.id,userRole:user.role,schoolId:user.schoolId,ipAddress:'127.0.0.1',userAgent:'student-portal-test',createdAt:new Date().toISOString(),expiresAt:new Date(expiresAt).toISOString(),lastActivityAt:new Date().toISOString()});
 return 'schoolos_session='+auth.createSignedSessionToken({sessionId,userId:user.id,role:user.role,schoolId:user.schoolId,createdAt:Date.now(),expiresAt});
}
const cookies={student:cookieFor(studentUser,'student'),otherStudent:cookieFor(sameClassStudentUser,'other-student'),wrongTenant:cookieFor(wrongTenantLink,'wrong-tenant'),teacher:cookieFor(subjectUser,'teacher'),otherTeacher:cookieFor(otherTeacherUser,'other-teacher'),form:cookieFor(formUser,'form'),parent:cookieFor(parentUser,'parent'),admin:cookieFor(adminUser,'admin')};
const setupSchool=makeSchool('Student Setup Gate','SPGATE');
const setupAdmin=makeUser(setupSchool.id,'school_admin','Setup Gate Admin');
const setupStudent=makeUser(setupSchool.id,'student','Setup Gate Student',{studentId:'SP-GATE-001'});
db.createStudent({schoolId:setupSchool.id,studentId:'SP-GATE-001',firstName:'Setup',middleName:'',lastName:'Student',gender:'female',admissionDate:today,classId:'',status:'active'} as any);
await db.flush();
const setupAdminCookie=cookieFor(setupAdmin,'setup-admin');
const setupStudentCookie=cookieFor(setupStudent,'setup-student');

const app=express();app.use(express.json());app.use(cookieParser());
const {apiRouter}=await import('../src/server/api.ts');app.use('/api',apiRouter);
const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));
const address=server.address();if(!address||typeof address==='string')throw new Error('Student Portal test server failed to bind.');
const base='http://127.0.0.1:'+address.port+'/api';
const request=(path:string,cookie:string,init:RequestInit={})=>fetch(base+path,{...init,headers:{Cookie:cookie,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}});
const post=(path:string,cookie:string,body:unknown)=>request(path,cookie,{method:'POST',body:JSON.stringify(body)});
after(async()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));

test('student profile is self-only, school-scoped, and rejects parent/teacher roles',async()=>{
 const own=await request('/student/me',cookies.student);assert.equal(own.status,200,await own.clone().text());
 const payload=await own.json() as any;assert.equal(payload.data.student.id,student.id);assert.equal(payload.data.classId,klass.id);
 assert.equal((await request('/student/me',cookies.parent)).status,403);
 assert.equal((await request('/student/me',cookies.teacher)).status,403);
 assert.equal((await request('/student/me',cookies.wrongTenant)).status,403);
});

test('student notices include school and own-class audience only with read receipts',async()=>{
 const schoolNotice=db.createNotice({schoolId:school.id,title:'School notice',content:'For all students',audience:'school',publishDate:today,isPinned:false,authorName:'Admin',authorRole:'school_admin',isActive:true} as any);
 const classNotice=db.createNotice({schoolId:school.id,title:'Grade 8 notice',content:'For Grade 8 only',audience:'class',classId:klass.id,publishDate:today,isPinned:false,authorName:'Admin',authorRole:'school_admin',isActive:true} as any);
 db.createNotice({schoolId:school.id,title:'Other class notice',content:'Not for this class',audience:'class',classId:otherClass.id,publishDate:today,isPinned:false,authorName:'Admin',authorRole:'school_admin',isActive:true} as any);
 db.createNotice({schoolId:otherSchool.id,title:'Other school notice',content:'Not for this school',audience:'school',publishDate:today,isPinned:false,authorName:'Admin',authorRole:'school_admin',isActive:true} as any);
 await db.markNoticeRead(school.id,schoolNotice.id,studentUser.id);await db.flush();
 const response=await request('/student/notices?page=1&pageSize=20',cookies.student);assert.equal(response.status,200,await response.clone().text());
 const rows=(await response.json() as any).data.items as any[];
 assert.deepEqual(new Set(rows.map(row=>row.id)),new Set([schoolNotice.id,classNotice.id]));
 assert.equal(rows.find(row=>row.id===schoolNotice.id).isRead,true);
 assert.equal(rows.find(row=>row.id===classNotice.id).isRead,false);
 assert.equal((await request('/student/notices',cookies.parent)).status,403);
});

test('student timetable ignores requested foreign class and reads only current class slots',async()=>{
 await memory.from('timetable_slots').insert([
  {id:'sp-slot-own',school_id:school.id,class_id:klass.id,day_of_week:'Monday',period_number:1,start_time:'08:00',end_time:'08:45',subject_id:subject.id,teacher_id:subjectTeacher.id,is_active:true},
  {id:'sp-slot-other',school_id:school.id,class_id:otherClass.id,day_of_week:'Monday',period_number:1,start_time:'08:00',end_time:'08:45',subject_id:otherSubject.id,teacher_id:otherTeacher.id,is_active:true},
  {id:'sp-slot-tenant',school_id:otherSchool.id,class_id:tenantClass.id,day_of_week:'Monday',period_number:1,start_time:'08:00',end_time:'08:45',subject_id:otherSubject.id,teacher_id:otherTeacher.id,is_active:true}
 ]);
 await db.flush();
 const own=await request('/timetable',cookies.student);assert.equal(own.status,200,await own.clone().text());
 const slots=await own.json() as any[];assert.ok(slots.some(row=>row.id==='sp-slot-own'));assert.equal(slots.some(row=>row.id==='sp-slot-other'||row.id==='sp-slot-tenant'),false);
 const foreign=await request('/timetable?classId='+encodeURIComponent(otherClass.id),cookies.student);assert.equal(foreign.status,403);
});

test('student homework is current-class-only and submissions always bind to the authenticated student',async()=>{
 const ownAssignment=db.createAssignment({schoolId:school.id,classId:klass.id,subjectId:subject.id,teacherId:subjectUser.id,title:'Own class task',description:'Submit your own work',dueDate:today,maxPoints:20} as any);
 db.createAssignment({schoolId:school.id,classId:otherClass.id,subjectId:otherSubject.id,teacherId:otherTeacherUser.id,title:'Other class task',description:'Not visible',dueDate:today,maxPoints:20} as any);
 await db.flush();
 const list=await request('/assignments',cookies.student);assert.equal(list.status,200);
 const rows=await list.json() as any[];assert.ok(rows.some(row=>row.id===ownAssignment.id));assert.equal(rows.some(row=>row.title==='Other class task'),false);
 const submit=await post('/assignments/'+ownAssignment.id+'/submissions',cookies.student,{content:'My work',studentId:sameClassStudent.id});
 assert.equal(submit.status,201,await submit.clone().text());
 await db.flush();
 const submissions=memory.rows('assignment_submissions').filter(row=>row.assignment_id===ownAssignment.id);
 assert.equal(submissions.length,1);assert.equal(submissions[0].student_id,student.id);
});

test('student and teacher messages are limited to current assignment classes',async()=>{
 const contacts=await request('/messages/contacts',cookies.student);assert.equal(contacts.status,200);
 const studentContacts=await contacts.json() as any[];
 assert.ok(studentContacts.some(row=>row.id===subjectUser.id));assert.ok(studentContacts.some(row=>row.id===formUser.id));
 assert.equal(studentContacts.some(row=>row.id===otherTeacherUser.id),false);
 assert.equal((await post('/messages',cookies.student,{recipientId:otherTeacherUser.id,content:'Cross-class message'})).status,403);
 const firstMessage=await post('/messages',cookies.student,{recipientId:subjectUser.id,content:'Question for my teacher'});assert.equal(firstMessage.status,201);
 assert.equal((await post('/messages',cookies.teacher,{recipientId:sameClassStudentUser.id,content:'Your homework'})).status,201);
 assert.equal((await post('/messages',cookies.teacher,{recipientId:otherTeacherUser.id,content:'Wrong role pairing'})).status,403);
 await memory.from('class_subjects').update({teacher_id:otherTeacher.id,'teachers.user_id':otherTeacherUser.id}).eq('id','sp-cs-math');
 await db.flush();
 const refreshed=await request('/messages/contacts',cookies.student);const refreshedContacts=await refreshed.json() as any[];
 assert.equal(refreshedContacts.some(row=>row.id===subjectUser.id),false);
 assert.ok(refreshedContacts.some(row=>row.id===otherTeacherUser.id));
 assert.equal((await post('/messages',cookies.student,{recipientId:subjectUser.id,content:'Old assignment'})).status,403);
 const history=await request('/messages?contactId='+encodeURIComponent(subjectUser.id),cookies.student);
 assert.equal(history.status,200);assert.ok((await history.json() as any[]).some(row=>row.content==='Question for my teacher'));
 const newTeacherContacts=await request('/messages/contacts',cookies.otherTeacher);
 assert.ok((await newTeacherContacts.json() as any[]).some(row=>row.id===studentUser.id));
});

test('teacher attendance is visible in the student attendance endpoint and other student IDs are forbidden',async()=>{
 const attendance=await post('/attendance',cookies.form,{classId:klass.id,date:today,records:[{studentId:student.id,status:'present'}]});
 assert.equal(attendance.status,200,await attendance.clone().text());
 const own=await request('/attendance/student?studentId='+encodeURIComponent(student.id),cookies.student);
 assert.equal(own.status,200,await own.clone().text());assert.ok((await own.json() as any[]).some(row=>row.studentId===student.id||row.student_id===student.id));
 const other=await request('/attendance/student?studentId='+encodeURIComponent(sameClassStudent.id),cookies.student);
 assert.equal(other.status,403);
});

test('submitted marks stay hidden from the student until the admin publishes them',async()=>{
 const config=await db.getExamConfig(school.id,'2026-2027');
 const assessmentScores=Object.fromEntries(config.assessmentComponents.map((component:any)=>[component.id,Math.min(5,component.maxMarks)]));
 const [saved]=await db.saveStudentMarks(school.id,klass.id,subject.id,'Semester 1',[{studentId:student.id,assessmentScores,status:'submitted'}],subjectUser.id);
 await db.flush();
 const hidden=await request('/exams/marks?studentId='+encodeURIComponent(student.id),cookies.student);
 assert.equal(hidden.status,200,await hidden.clone().text());
 assert.equal((await hidden.json() as any[]).some(row=>row.id===saved.id),false);
 await db.forwardClassMarks(school.id,klass.id,'Semester 1',formUser.id,formUser.fullName);
 await db.approveMarks(school.id,[saved.id],adminUser.id,adminUser.fullName,adminUser.role);
 await db.flush();
 await db.publishClassSemesterResults(school.id,klass.id,'Semester 1',adminUser.id,adminUser.fullName,adminUser.role);
 await db.flush();
 const published=await request('/exams/marks?studentId='+encodeURIComponent(student.id),cookies.student);
 assert.equal(published.status,200,await published.clone().text());
 assert.equal((await published.json() as any[]).some(row=>row.id===saved.id),true);
});

test('class transfer changes student homework and timetable scope to the new enrollment class',async()=>{
 const moved=db.createAssignment({schoolId:school.id,classId:otherClass.id,subjectId:otherSubject.id,teacherId:otherTeacherUser.id,title:'New class task',description:'Current class only',dueDate:today,maxPoints:10} as any);
 await db.flush();
 await memory.from('students').update({class_id:otherClass.id}).eq('id',student.id);
 await db.flush();
 const assignments=await request('/assignments',cookies.student);
 assert.equal(assignments.status,200);const rows=await assignments.json() as any[];
 assert.ok(rows.some(row=>row.id===moved.id));assert.equal(rows.some(row=>row.classId===klass.id),false);
 const slots=await request('/timetable',cookies.student);assert.equal(slots.status,200);
 assert.equal((await slots.json() as any[]).some(row=>row.id==='sp-slot-own'),false);
 const contacts=await request('/messages/contacts',cookies.student);assert.ok((await contacts.json() as any[]).some(row=>row.id===otherTeacherUser.id));
 await memory.from('students').update({class_id:klass.id}).eq('id',student.id);
 await db.flush();
});

test('incomplete setup returns HTTP 423 and the missing checklist to student timetable',async()=>{
 const progress=await request('/school/setup-progress',setupAdminCookie);assert.equal(progress.status,200,await progress.clone().text());
 const response=await request('/timetable',setupStudentCookie);assert.equal(response.status,423,await response.clone().text());
 const payload=await response.json() as any;assert.equal(payload.code,'SCHOOL_SETUP_REQUIRED');assert.ok(Array.isArray(payload.missing)&&payload.missing.length>0);
});
