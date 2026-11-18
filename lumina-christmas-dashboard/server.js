import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { google } from 'googleapis';

const app=express();
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=process.env.PORT || 3000;
const stricter=process.env.REQUIRE_LIVE_SERVICES==='true';
const names=['Members','Events','Attendance','Budget'];
const firebaseConfig={apiKey:process.env.FIREBASE_API_KEY||'',authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',projectId:process.env.FIREBASE_PROJECT_ID||'',appId:process.env.FIREBASE_APP_ID||''};
const firebaseReady=Object.values(firebaseConfig).every(Boolean);
let firebaseAdminReady=false;
if (firebaseReady) {
 try {
  const cert=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  admin.initializeApp({credential:cert?admin.credential.cert(JSON.parse(cert)):admin.credential.applicationDefault(),projectId:firebaseConfig.projectId});
  firebaseAdminReady=true;
 } catch (e) { console.warn('Firebase Admin not available:',e.message); }
}

app.disable('x-powered-by');
app.use(express.static(path.join(root,'frontend')));
app.get('/api/config',(req,res)=>res.json({firebase:firebaseConfig,authEnabled:firebaseReady&&firebaseAdminReady,sheetsEnabled:!!(process.env.GOOGLE_SHEET_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY),demoAllowed:!stricter}));

async function authorize(req,res,next){
 if (!firebaseAdminReady) {
  if (stricter) return res.status(503).json({error:'Firebase authentication is not configured'});
  return next();
 }
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if (!token) return res.status(401).json({error:'Sign in is required'});
 try{req.user=await admin.auth().verifyIdToken(token);next();}
 catch{return res.status(401).json({error:'Invalid or expired sign-in token'});}
}
function parseCSV(text){
 const lines=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.length))lines.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);lines.push(row);}
 const [heads=[],...entries]=lines;
 return entries.map(r=>Object.fromEntries(heads.map((h,i)=>[h.replace(/^\uFEFF/,''),r[i]??''])));
}
async function loadDemo(){
 const entries=await Promise.all(names.map(async name=>[name,parseCSV(await fs.readFile(path.join(root,'data',name+'.csv'),'utf8'))]));
 return Object.fromEntries(entries);
}
async function loadGoogleSheets(){
 const jwt=new google.auth.JWT({email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets']});
 const sheets=google.sheets({version:'v4',auth:jwt});
 const resp=await sheets.spreadsheets.values.batchGet({spreadsheetId:process.env.GOOGLE_SHEET_ID,ranges:names.map(n=>`'${n}'!A:Z`)});
 return Object.fromEntries(names.map((n,i)=>{
  const [headers=[],...rows]=resp.data.valueRanges?.[i]?.values||[];
  return [n,rows.filter(r=>r.length).map(r=>Object.fromEntries(headers.map((h,j)=>[h,r[j]??''])))];
 }));
}
const n=v=>Number(v)||0;
function summarize(data,term){
 const available=[...new Set(data.Events.map(e=>e.semester).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
 if(!available.length)throw new Error('No semester data found. Add a semester column to all 4 Google Sheet tabs.');
 const selected=available.includes(term)?term:available[0];
 const members=data.Members.filter(x=>x.semester===selected);
 const events=data.Events.filter(x=>x.semester===selected).sort((a,b)=>a.event_date.localeCompare(b.event_date));
 const attendance=data.Attendance.filter(x=>x.semester===selected);
 const budgets=data.Budget.filter(x=>x.semester===selected);
 const spent=budgets.reduce((s,x)=>s+n(x.actual_spent),0);
 const planned=budgets.reduce((s,x)=>s+n(x.planned_budget),0);
 const budgetByEvent=new Map();
 for(const b of budgets){const curr=budgetByEvent.get(b.event_id)||{planned:0,spent:0};curr.planned+=n(b.planned_budget);curr.spent+=n(b.actual_spent);budgetByEvent.set(b.event_id,curr);}
 const attendanceByEvent=new Map();
 for(const a of attendance){if(String(a.attended).trim().toLowerCase()==='true')attendanceByEvent.set(a.event_id,(attendanceByEvent.get(a.event_id)||0)+1);}
 const today=new Date();const todayString=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const dayFromISO=s=>Date.parse(`${s}T12:00:00Z`);
 const budgetPercent=planned?spent/planned*100:0;
 const notices=[];
 if(planned>0&&budgetPercent>80) notices.push({type:'budget',title:'Budget threshold reached',detail:`${budgetPercent.toFixed(1)}% of the semester budget has been used.`});
 for(const e of events){
  const days=Math.round((dayFromISO(e.event_date)-dayFromISO(todayString))/86400000);
  if(Number.isFinite(days)&&days>=0&&days<=3)notices.push({type:'event',title:`${e.event_name} is coming up`,detail:days===0?'Happening today':`Happening in ${days} day${days===1?'':'s'}`,date:e.event_date});
 }
 return {term:selected,terms:available,stats:{members:members.filter(m=>String(m.status).toLowerCase()==='active').length,events:events.length,spent,planned,budgetPercent},attendance:events.map(e=>({name:e.event_name,count:attendanceByEvent.get(e.event_id)||0,date:e.event_date})),budgets:events.map(e=>({name:e.event_name,...(budgetByEvent.get(e.event_id)||{planned:0,spent:0})})),notifications:notices,source:'',today:todayString};
}
app.get('/api/dashboard',authorize,async(req,res)=>{
 try{
  let data,source='demo';
  if(process.env.GOOGLE_SHEET_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY){data=await loadGoogleSheets();source='google-sheets';}
  else if(!stricter)data=await loadDemo();
  else return res.status(503).json({error:'Google Sheets is not configured'});
  const result=summarize(data,typeof req.query.term==='string'?req.query.term:'');result.source=source;
  res.set('Cache-Control','no-store').json(result);
 }catch(e){console.error(e);res.status(500).json({error:e.message||'Cannot load dashboard data'});}
});

app.get("/api/me", async (req, res) => {
  try {
    if (!firebaseAdminReady) {
      return res.status(503).json({
        error: "Firebase Admin is not configured"
      });
    }

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing Firebase token"
      });
    }

    const token = authHeader.substring(7);

    const decoded = await admin.auth().verifyIdToken(token);

    res.json({
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || null
    });

  } catch (error) {
    res.status(401).json({
      error: "Invalid Firebase token"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Lumina Dashboard at http://localhost:${PORT}`);
});
