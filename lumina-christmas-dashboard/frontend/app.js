const $=id=>document.getElementById(id);
let cfg=null, auth=null, firebaseApi=null, currentUser=null, currentTerm='', charts=[], dashboardData=null, mode='login';
const money=n=>'฿'+Math.round(Number(n)||0).toLocaleString('en-US');
const number=n=>Math.round(Number(n)||0).toLocaleString('en-US');
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>s.length>17?s.slice(0,15)+'…':s;
const notify=(message)=>{const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,3800);};

function switchAuth(tab){mode=tab;$('login-tab').classList.toggle('active',tab==='login');$('signup-tab').classList.toggle('active',tab==='signup');$('auth-title').innerHTML=tab==='login'?'Welcome back<span class="red-dot">.</span>':'Join the club<span class="red-dot">.</span>';$('auth-subtitle').textContent=tab==='login'?'Your community dashboard is ready for you.':'Make your club moments count, starting today.';$('email-auth-btn').innerHTML=(tab==='login'?'Log in':'Create account')+' <span>↗</span>';$('password').autocomplete=tab==='login'?'current-password':'new-password';$('auth-error').textContent='';}
function showAuth(){currentUser=null;$('auth-screen').hidden=false;$('dashboard-screen').hidden=true;}
async function showDashboard(user){currentUser=user;$('auth-screen').hidden=true;$('dashboard-screen').hidden=false;
const userLabel = $('user-label');
const userAvatar = $('user-avatar');

const displayName = user?.email?.split('@')[0] || 'Demo Member';

if (userLabel) {
  userLabel.textContent = displayName;
}

if (userAvatar) {
  userAvatar.textContent = displayName.charAt(0).toUpperCase();
}
await loadDashboard();}
async function bootstrap(){
 try{cfg=await (await fetch('/api/config')).json();}catch{$('auth-error').textContent='Could not reach the server. Start it using npm start.';return;}
 const demo=!cfg.authEnabled&&cfg.demoAllowed;
 $('demo-btn').hidden=!demo;
 if(cfg.authEnabled){
  try{
   const [appModule,authModule]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js')]);
   const app=appModule.initializeApp(cfg.firebase);auth=authModule.getAuth(app);firebaseApi=authModule;
   authModule.onAuthStateChanged(auth,async user=>{if(user)await showDashboard(user);else showAuth();});
  }catch(e){$('auth-error').textContent='Firebase failed to initialize: '+e.message;}
 }else if(!demo){$('auth-error').textContent='Authentication is not configured. Set Firebase environment variables.';}
 else {$('auth-error').textContent='';}
}
$('login-tab').addEventListener('click',()=>switchAuth('login'));
$('signup-tab').addEventListener('click',()=>switchAuth('signup'));
// Email/Password only: Firebase Authentication stores the login accounts.
function emailAuthErrorMessage(error, action) {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Your password is too weak. Please choose a stronger password.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Sign-in failed. Check your email and password, or sign up if you do not have an account.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please try again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password authentication is not enabled in Firebase.';
    default:
      console.error('Firebase email authentication failed:', action, error);
      return action === 'login' ? 'Unable to sign in. Please try again.' : 'Unable to create your account. Please try again.';
  }
}

$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = $('auth-error');
  const button = $('email-auth-btn');
  errorEl.textContent = '';

  if (!auth || !firebaseApi) {
    errorEl.textContent = 'Firebase is not configured. Please check the server settings.';
    return;
  }

  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) {
    errorEl.textContent = 'Please enter both your email and password.';
    return;
  }

  const action = mode; // Remember the selected tab during the request.
  button.disabled = true;
  try {
    if (action === 'login') {
      // Sign in will succeed only when the Firebase account and password match.
      await firebaseApi.signInWithEmailAndPassword(auth, email, password);
    } else {
      // Sign up rejects an email that is already registered.
      await firebaseApi.createUserWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged handles opening the dashboard after success.
  } catch (error) {
    errorEl.textContent = emailAuthErrorMessage(error, action);
  } finally {
    button.disabled = false;
  }
});
// Google sign-in has been removed; no google-btn listener is required.
$('demo-btn').addEventListener('click',()=>showDashboard({email:'demo@lumina.club',demo:true}));
$('logout-btn').addEventListener('click',async()=>{if(auth)await firebaseApi.signOut(auth);else showAuth();});
$('nav-overview').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('refresh-btn').addEventListener('click',async()=>{await loadDashboard(currentTerm);notify('Dashboard refreshed from '+(dashboardData?.source==='google-sheets'?'Google Sheets':'sample CSVs'));});
$('theme-btn').addEventListener('click',()=>{const isDark=document.body.classList.toggle('dark');$('theme-btn').textContent=isDark?'☀':'☾';localStorage.setItem('lumina_theme',isDark?'dark':'light');if(dashboardData)renderCharts(dashboardData);});
if(localStorage.getItem('lumina_theme')==='dark'){document.body.classList.add('dark');$('theme-btn').textContent='☀';}
$('bell-btn').addEventListener('click',()=>{const pop=$('notification-popover');pop.hidden=!pop.hidden;$('bell-btn').setAttribute('aria-expanded',String(!pop.hidden));});
$('close-notifications').addEventListener('click',()=>{$('notification-popover').hidden=true;$('bell-btn').setAttribute('aria-expanded','false');});

async function loadDashboard(term = '') {
  try {
    $('refresh-btn').disabled = true;
    $('refresh-btn').textContent = '↻ Loading…';

    const headers = {};

    // Check whether the user is signed in with Firebase
    if (
      currentUser &&
      !currentUser.demo &&
      typeof currentUser.getIdToken === 'function'
    ) {
      // Get the Firebase ID token
      const token = await currentUser.getIdToken();

      // Send the token to the backend
      headers.Authorization = 'Bearer ' + token;
    }

    // Call the dashboard API
    const url = '/api/dashboard' +
      (term ? '?term=' + encodeURIComponent(term) : '');

    const res = await fetch(url, { headers });

    const payload = await res.json();

    if (!res.ok) {
      throw new Error(payload.error || 'Server error');
    }

    dashboardData = payload;
    currentTerm = payload.term;

    render(payload);

  } catch (e) {
    console.error('Dashboard error:', e);

    notify('Could not load dashboard: ' + e.message);

  } finally {
    $('refresh-btn').disabled = false;
    $('refresh-btn').textContent = '↻   Refresh data';
  }
}

function render(data){
 $('data-source').textContent=data.source==='google-sheets'?'● LIVE GOOGLE SHEETS':'● SAMPLE DATA';
 $('term-caption').textContent='SEMESTER '+data.term;$('semester-badge').textContent='SEMESTER '+data.term;$('year-sticker').textContent=data.term.split('/')[0];
 $('stat-members').textContent=number(data.stats.members);$('stat-events').textContent=number(data.stats.events);$('stat-budget').textContent=money(data.stats.spent);
 $('budget-percentage').textContent=data.stats.budgetPercent.toFixed(1)+'%';
 $('term-list').innerHTML=data.terms.map(t=>`<button class="term-button ${t===data.term?'active':''}" data-term="${escapeHTML(t)}" title="Semester ${escapeHTML(t)}"><span class="term-icon">▣</span><span class="term-name">Semester ${escapeHTML(t)}</span><small>${t===data.term?'●':''}</small></button>`).join('');
 document.querySelectorAll('.term-button').forEach(el=>el.addEventListener('click',()=>loadDashboard(el.dataset.term)));
 renderNotices(data);renderCharts(data);renderSummary(data);renderUpcoming(data);
}
function renderNotices(data){
 $('notif-count').textContent=data.notifications.length;$('notif-count').hidden=!data.notifications.length;
 $('notification-items').innerHTML=data.notifications.length?data.notifications.map(n=>`<div class="notice-item"><strong>${n.type==='budget'?'⚠ ':'✦ '}${escapeHTML(n.title)}</strong><p>${escapeHTML(n.detail)}</p></div>`).join(''):'<p class="empty-note">All caught up. No active alerts ✨</p>';
 $('alerts').innerHTML=data.notifications.map(n=>`<div class="alert-banner ${n.type==='event'?'event':''}"><span class="alert-emoji">${n.type==='budget'?'⚠':'✦'}</span><span><strong>${escapeHTML(n.title)}</strong> ${escapeHTML(n.detail)}</span></div>`).join('');
}
function renderSummary(data){const s=data.stats;$('summary-spent').textContent=money(s.spent);$('summary-planned').textContent=money(s.planned);$('summary-percent').textContent=s.budgetPercent.toFixed(1)+'%';$('budget-progress').style.width=Math.min(100,s.budgetPercent)+'%';$('budget-progress').style.background=s.budgetPercent>80?'#cf6b6a':'';$('budget-status').textContent=s.budgetPercent>80?'ABOVE 80%':'ON TRACK';$('budget-status').classList.toggle('over',s.budgetPercent>80);}
function renderUpcoming(data){
 const future=data.attendance.filter(x=>x.date>=data.today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
 $('upcoming-list').innerHTML=future.length?future.map(x=>{const dt=new Date(x.date+'T12:00:00Z');return `<div class="upcoming-item"><div class="upcoming-date"><strong>${dt.getUTCDate()}</strong><span>${dt.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()}</span></div><div><div class="upcoming-name">${escapeHTML(x.name)}</div><div class="upcoming-sub">${x.count} attendees recorded · ${escapeHTML(x.date)}</div></div></div>`;}).join(''):'<div class="empty-note">No upcoming events in this semester. Time to plan something magical ✨</div>';
}
function renderCharts(data){
 if(typeof Chart==='undefined')return;
 for(const chart of charts)chart.destroy();charts=[];
 const dark=document.body.classList.contains('dark');const grid=dark?'#39493d':'#ebefea',txt=dark?'#bbcec0':'#7b8a7c';
 Chart.defaults.font.family="'DM Sans', sans-serif";Chart.defaults.color=txt;
 const opts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:dark?'#334f3c':'#1c4f3c',padding:12,cornerRadius:8}},scales:{x:{grid:{display:false},ticks:{color:txt,maxRotation:42,minRotation:0,autoSkip:false,font:{size:9},callback:function(v){return short(this.getLabelForValue(v));}}},y:{beginAtZero:true,grid:{color:grid},border:{display:false},ticks:{precision:0,font:{size:10}}}}};
 const makeOptions=()=>({...opts,plugins:{...opts.plugins,legend:{...opts.plugins.legend},tooltip:{...opts.plugins.tooltip}},scales:{x:{...opts.scales.x,grid:{...opts.scales.x.grid},ticks:{...opts.scales.x.ticks}},y:{...opts.scales.y,grid:{...opts.scales.y.grid},border:{...opts.scales.y.border},ticks:{...opts.scales.y.ticks}}}});
 charts.push(new Chart($('attendance-chart'),{type:'bar',data:{labels:data.attendance.map(d=>d.name),datasets:[{label:'Attendees',data:data.attendance.map(d=>d.count),backgroundColor:data.attendance.map((_,i)=>i%3===1?'#d8a09b':'#77a98f'),borderRadius:5,maxBarThickness:35}]},options:makeOptions()}));
 const budgetOptions=makeOptions();budgetOptions.scales.y.ticks.callback=v=>'฿'+(Number(v)/1000).toFixed(0)+'k';
 charts.push(new Chart($('budget-chart'),{type:'bar',data:{labels:data.budgets.map(d=>d.name),datasets:[{label:'Planned',data:data.budgets.map(d=>d.planned),backgroundColor:'#c7d9bc',borderRadius:4,maxBarThickness:19},{label:'Actual spent',data:data.budgets.map(d=>d.spent),backgroundColor:'#c76868',borderRadius:4,maxBarThickness:19}]},options:budgetOptions}));
}

async function copyFirebaseToken() {
  try {
    if (!currentUser || currentUser.demo) {
      notify('Please log in with Firebase first');
      return;
    }

    const token = await currentUser.getIdToken();

    await navigator.clipboard.writeText(token);

    notify('Firebase Token copied!');
  } catch (error) {
    console.error('Copy token failed:', error);
    notify('Could not copy token');
  }
}

bootstrap();
