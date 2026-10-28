"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, BadgeIndianRupee, CalendarDays, Check, ChevronDown, CircleHelp, CreditCard, LayoutDashboard, LogOut, Plus, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";

type Salary = { id:string; monthly_salary:number; effective_from:string; note:string|null };
type Expense = { id:string; item_name:string; amount:number; quantity:number; category_name:string; spent_at:string; notes:string|null };
const COLORS = ["#1d5fd6","#477dde","#719be5","#9db9ec","#c8d7f4"];
const CATEGORIES = ["Groceries","Medical","Transport","Bills","Loan","Food & Drinks","Shopping","Home & Essentials","Education","Entertainment","Investment & Savings","Other"];
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const today = () => new Date().toLocaleDateString("en-CA");
const CATEGORY_RULES: Array<{category:string;pattern:RegExp;examples:string}> = [
 {category:"Groceries",pattern:/\b(coconut|thengai|rice|arisi|milk|paal|vegetable|vegetables|kaai|tomato|thakkali|onion|vengayam|grocery|groceries|oil|ennai|dal|dhal|paruppu|fruit|fruits|pazham|egg|eggs|bread|atta|flour|sugar|salt|masala|spice|provision|wheat|maida|curd|yogurt|butter|cheese|chicken|mutton|fish|meen|prawn|water can|mineral water|snacks packet|potato|urulaikizhangu|carrot|beans|keerai|banana|vazhaipazham|apple|orange|rice bag)\b/i,examples:"rice, milk, vegetables, coconut, dal"},
 {category:"Medical",pattern:/\b(tablet|tablets|medicine|medicines|medical|doctor|hospital|pharmacy|clinic|health|blood test|scan|xray|x-ray|medical shop|syrup|paracetamol|panadol|bandage|vitamin|consultation)\b/i,examples:"medicine, doctor, tablets"},
 {category:"Transport",pattern:/\b(petrol|diesel|fuel|bus|train|auto|cab|uber|ola|rapido|taxi|parking|toll|metro|travel ticket|bike service|car service|puncture|tyre|tire|petrol bunk)\b/i,examples:"petrol, bus, auto, parking"},
 {category:"Bills",pattern:/\b(eb bill|electricity|current bill|water bill|credit card bill|credit card payment|internet|wifi|broadband|recharge|rent|gas cylinder|mobile bill|phone bill|postpaid|prepaid|dth|subscription|insurance premium)\b/i,examples:"EB bill, electricity, credit card bill, recharge, rent"},
 {category:"Loan",pattern:/\b(loan|loans|emi|principal payment|loan repayment|loan installment)\b/i,examples:"personal loan, gold loan, home loan, car loan EMI"},
 {category:"Food & Drinks",pattern:/\b(hotel|restaurant|tea|coffee|snack|snacks|lunch|dinner|breakfast|juice|swiggy|zomato|food|meals|biriyani|biryani|dosa|dosai|idli|idl(i|y)|parotta|paratha|pizza|burger|bakery|cake|ice cream|icecream|tiffin|parcel food|sweets|juice shop|sappadu|saapadu|saapad|sambar|sambhar|rasam|vadai|vada|bajji|bonda|pongal|upma|chapati|chapathi|chappathi|poori|puri|vada pav|pav bhaji|puffs|bun|biscuit|milkshake|falooda|shawarma|rolls|fried rice|noodles|kothu parotta|curd rice|lemon rice|meals parcel|mess bill|canteen|tiffin kadai|tea kadai|coffee shop)\b/i,examples:"tea, meals, biryani, snacks"},
 {category:"Shopping",pattern:/\b(shirt|shirts|dress|shoe|shoes|clothes|clothing|jeans|saree|sari|chappal|slippers|watch|bag|handbag|amazon|flipkart|myntra|online shopping|tshirt|t-shirt|uniform|belt|wallet|jewellery|jewelry|cosmetics|perfume)\b/i,examples:"shirt, shoes, clothes"},
 {category:"Home & Essentials",pattern:/\b(soap|detergent|washing powder|cleaner|bucket|utensil|vessel|broom|mop|house|home|dishwash|dish wash|toothpaste|toothbrush|shampoo|tissue|garbage bag|cleaning liquid|floor cleaner|bulb|battery|kitchen item|cooking gas stove)\b/i,examples:"soap, detergent, cleaning items"},
 {category:"Education",pattern:/\b(book|books|school|college|course|tuition|fees|school fees|college fees|notebook|pen|pencil|stationery|exam|training|class|education)\b/i,examples:"books, school fees, stationery"},
 {category:"Entertainment",pattern:/\b(movie|cinema|theatre|game|gaming|ott|netflix|prime video|hotstar|spotify|concert|outing|park ticket)\b/i,examples:"movie, OTT, games"},
 {category:"Investment & Savings",pattern:/\b(sip|s\.i\.p|crt sip|c\.r\.t\.?|mutual fund|mutual funds|stocks?|shares?|stock market|investment|investments|recurring deposit|fixed deposit|gold savings|gold scheme|chit fund|nps|ppf|elss|index fund|equity fund|mf investment|rd|fd|ppf|epf|nifty|sensex)\b/i,examples:"SIP, CRT SIP, mutual funds, stocks, savings deposits"}
];
function categorySuggestion(item:string) {
 const s=item.trim().toLowerCase();
 if(!s)return {category:"",matched:false,examples:""};
 const normalized=` ${s.normalize("NFKD").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()} `;
 const has=(phrase:string)=>normalized.includes(` ${phrase} `);
 const tokenPhrase=(phrases:string[])=>phrases.some(has);

 // Strong financial intent is resolved before restaurant and general expense words.
 if(tokenPhrase(["loan","loans","emi"]) || /\b(loan|emi)\b/.test(normalized))
  return {category:"Loan",matched:true,examples:"personal loan, gold loan, home loan, car loan EMI"};
 if(tokenPhrase(["credit card bill","credit card payment","rent","electricity bill","electricity","current bill","water bill","internet bill","wifi bill","recharge","insurance premium","gas bill","mobile bill","phone bill","subscription"]))
  return {category:"Bills",matched:true,examples:"credit card bill, electricity, recharge, rent"};
 if(tokenPhrase(["sip","crt sip","crt","mutual fund","mutual funds","stock","stocks","share","shares","share market","stock market","investment","investments","recurring deposit","fixed deposit","gold savings","gold scheme","chit fund","nps","ppf","elss","index fund","equity fund","nifty","sensex","ppf","epf","rd","fd"]))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP, mutual funds, stocks, savings deposits"};

 // Acronym-safe fallbacks for entries typed without separators (CRT-SIP, S.I.P, RD, FD).
 const compact=normalized.replace(/\s/g,"");
 if(/(?:sip|crtsip)/.test(compact)||/\bcrtsip\b/.test(compact))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP"};

 const rule=CATEGORY_RULES.find(x=>x.pattern.test(s));
 return rule?{category:rule.category,matched:true,examples:rule.examples}:{category:"Other",matched:false,examples:""};
}
function guessCategory(item:string) { return categorySuggestion(item).category || "Other"; }
function categoryHint(item:string) { const result=categorySuggestion(item); if(!item.trim()) return "Enter the item name and we’ll suggest its category automatically."; return result.matched ? `Auto-suggested: ${result.category} · based on “${item.trim()}”. You can change it if needed.` : "Category isn’t clear from that item name, so we’ve selected Other. Add a little more detail for a better suggestion."; }
export default function Home() {
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[signup,setSignup]=useState(false);
 const [salary,setSalary]=useState<Salary|null>(null),[salaryHistory,setSalaryHistory]=useState<Salary[]>([]),[expenses,setExpenses]=useState<Expense[]>([]);
 const [salaryInput,setSalaryInput]=useState(""),[salaryDate,setSalaryDate]=useState(today()),[showSalary,setShowSalary]=useState(false);
 const [item,setItem]=useState(""),[amount,setAmount]=useState(""),[qty,setQty]=useState("1"),[category,setCategory]=useState("Groceries"),[spentAt,setSpentAt]=useState(today()),[notes,setNotes]=useState("");
 const [categories,setCategories]=useState<string[]>(CATEGORIES),[newCategory,setNewCategory]=useState("");
 const [categoryManuallySelected,setCategoryManuallySelected]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[month,setMonth]=useState(today().slice(0,7));
 const user=session?.user;
 const load=useCallback(async(uid:string)=>{ const client=supabase; if(!client)return; setLoading(true); setError(""); const [s,e,c]=await Promise.all([client.from("salary_history").select("*").eq("user_id",uid).order("effective_from",{ascending:false}),client.from("expenses").select("*").eq("user_id",uid).order("spent_at",{ascending:false}).limit(1000),client.from("expense_categories").select("name").eq("user_id",uid).order("name")]); if(s.error||e.error||c.error){setError(s.error?.message||e.error?.message||c.error?.message||"Unable to load your data. Run the Supabase schema first.");setLoading(false);return;} const ss=(s.data||[]) as Salary[];setSalaryHistory(ss);setSalary(ss[0]||null);const rawExpenses=(e.data||[]) as Expense[];const corrected=rawExpenses.map(x=>{const guess=categorySuggestion(x.item_name);const isKnownCategory=CATEGORIES.includes(x.category_name);if(guess.matched&&isKnownCategory)return {...x,category_name:guess.category};return x;});setExpenses(corrected);const fixes=corrected.filter((x,i)=>x.category_name!==rawExpenses[i].category_name);if(fixes.length){await Promise.all(fixes.map(x=>client.from("expenses").update({category_name:x.category_name}).eq("id",x.id).eq("user_id",uid)));}const saved=(c.data||[]).map((x:any)=>x.name);setCategories([...new Set([...CATEGORIES,...saved])]);setLoading(false); },[]);
 useEffect(()=>{ if(!supabase){setError("Supabase configuration is missing. Add the public project URL and publishable key.");setLoading(false);return;} supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session?.user)load(data.session.user.id);else setLoading(false);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);if(s?.user)load(s.user.id);else{setSalary(null);setSalaryHistory([]);setExpenses([]);setLoading(false);}});return()=>subscription.unsubscribe();},[load]);
 const currentExpenses=useMemo(()=>expenses.filter(e=>e.spent_at.startsWith(month)),[expenses,month]);
 const monthTotal=currentExpenses.reduce((a,e)=>a+Number(e.amount),0);
 const salaryNum=Number(salary?.monthly_salary||0), balance=salaryNum-monthTotal;
 const daily=useMemo(()=>{const map=new Map<string,number>();currentExpenses.forEach(e=>map.set(e.spent_at,(map.get(e.spent_at)||0)+Number(e.amount)));return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,total])=>({date:date.slice(5),total}));},[currentExpenses]);
 const byCategory=useMemo(()=>{const map=new Map<string,number>();currentExpenses.forEach(e=>map.set(e.category_name,(map.get(e.category_name)||0)+Number(e.amount)));return Array.from(map.entries()).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);},[currentExpenses]);
 const repeats=useMemo(()=>{const map=new Map<string,{count:number,total:number,qty:number}>();expenses.filter(e=>e.spent_at.startsWith(month)).forEach(e=>{const k=e.item_name.trim().toLowerCase();const v=map.get(k)||{count:0,total:0,qty:0};v.count++;v.total+=Number(e.amount);v.qty+=Number(e.quantity||1);map.set(k,v)});return Array.from(map.entries()).map(([name,v])=>({name:name.replace(/^./,x=>x.toUpperCase()),...v})).filter(x=>x.count>1).sort((a,b)=>b.total-a.total).slice(0,5)},[expenses,month]);
 const budget=useMemo(()=>{
  // Recommend next month's category limits from the most recent 2–6 complete months.
  // Current selected month is excluded so the forecast is based on history only.
  const monthlyTotals=new Map<string,Map<string,number>>();
  for(const e of expenses){
   const expenseMonth=e.spent_at.slice(0,7);
   if(!/^\d{4}-\d{2}$/.test(expenseMonth)||expenseMonth>=month) continue;
   const byCategory=monthlyTotals.get(expenseMonth)||new Map<string,number>();
   byCategory.set(e.category_name,(byCategory.get(e.category_name)||0)+Number(e.amount||0));
   monthlyTotals.set(expenseMonth,byCategory);
  }
  const availableMonths=Array.from(monthlyTotals.keys()).sort((a,b)=>b.localeCompare(a)).slice(0,6);
  const usedMonths=availableMonths.slice(0,6);
  const categoryNames=new Set<string>();
  usedMonths.forEach(m=>monthlyTotals.get(m)?.forEach((_v,name)=>categoryNames.add(name)));
  const averages=Array.from(categoryNames).map(name=>{
   const monthValues=usedMonths.map(m=>monthlyTotals.get(m)?.get(name)||0);
   const total=monthValues.reduce((sum,value)=>sum+value,0);
   return {name,previous:total/Math.max(usedMonths.length,1),historyTotal:total};
  }).filter(x=>x.historyTotal>0);
  const historySpend=averages.reduce((sum,x)=>sum+x.previous,0);
  const salaryCap=Math.max(0,salaryNum*0.9);
  const factor=historySpend>salaryCap&&historySpend>0?salaryCap/historySpend:1;
  return averages.map(x=>({
   name:x.name,
   previous:x.previous,
   planned:Math.max(0,Math.round(x.previous*factor)),
   historyTotal:x.historyTotal
  })).sort((a,b)=>b.planned-a.planned);
 },[expenses,month,salaryNum]);
 const budgetHistoryMonths=useMemo(()=>{
  return Array.from(new Set(expenses.map(e=>e.spent_at.slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)&&m<month))).sort((a,b)=>b.localeCompare(a)).slice(0,6);
 },[expenses,month]);
 const budgetHistoryReady=budgetHistoryMonths.length>=2;
 const budgetPlannedTotal=budget.reduce((sum,x)=>sum+x.planned,0);

 async function auth(e:React.FormEvent){e.preventDefault();if(!supabase)return;setSaving(true);setError("");const res=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(res.error)setError(res.error.message);else if(signup&&!res.data.session)setNotice("Check your email to confirm your account, then sign in.");setSaving(false);}
 async function signout(){await supabase?.auth.signOut();setSession(null);}
 async function saveSalary(e:React.FormEvent){e.preventDefault();if(!supabase||!user)return;const n=Number(salaryInput);if(!Number.isFinite(n)||n<0){setError("Enter a valid salary amount.");return;}setSaving(true);const r=await supabase.from("salary_history").insert({user_id:user.id,monthly_salary:n,effective_from:salaryDate,note:salary?"Salary revised":"Initial salary"});if(r.error)setError(r.error.message);else{setNotice("Salary saved.");setSalaryInput("");setShowSalary(false);await load(user.id);}setSaving(false);}
 async function saveExpense(e:React.FormEvent){e.preventDefault();if(!supabase||!user)return;const n=Number(amount),q=Number(qty);if(!item.trim()||!Number.isFinite(n)||n<=0||!Number.isFinite(q)||q<=0){setError("Enter an item, positive amount and quantity.");return;}setSaving(true);const suggestion=categorySuggestion(item);let cat=categoryManuallySelected?category:suggestion.matched?suggestion.category:category;const cr=await supabase.from("expense_categories").upsert({user_id:user.id,name:cat},{onConflict:"user_id,name"}).select("id").single();const r=await supabase.from("expenses").insert({user_id:user.id,item_name:item.trim(),amount:n,quantity:q,category_id:cr.data?.id||null,category_name:cat,spent_at:spentAt,notes:notes.trim()||null});if(cr.error||r.error)setError(cr.error?.message||r.error?.message||"Unable to save expense.");else{setNotice(item+" saved · "+money(n)+" deducted from your balance.");setItem("");setAmount("");setQty("1");setNotes("");setCategoryManuallySelected(false);setCategory("Groceries");await load(user.id);}setSaving(false);}
 async function removeExpense(id:string){if(!supabase||!user)return;const r=await supabase.from("expenses").delete().eq("id",id).eq("user_id",user.id);if(r.error)setError(r.error.message);else await load(user.id);}
 async function addCategory(e:React.FormEvent){e.preventDefault();if(!supabase||!user||!newCategory.trim())return;const name=newCategory.trim();const r=await supabase.from("expense_categories").upsert({user_id:user.id,name},{onConflict:"user_id,name"});if(r.error)setError(r.error.message);else{setCategories(prev=>[...new Set([...prev,name])]);setCategory(name);setCategoryManuallySelected(true);setNewCategory("");setNotice("Category added.");}}
 if(!user)return (
   <main className="auth-shell">
    <section className="auth-panel" aria-labelledby="auth-title">
     <div className="auth-brand"><div className="brand-mark" aria-hidden="true">S</div><div><div className="auth-brand-name">Salary Smart</div><div className="muted">Private salary ledger</div></div></div>
     <h1 id="auth-title">{signup?"Create your account":"Welcome back"}</h1>
     <p className="auth-intro">Your financial data stays private to you.</p>
     <form onSubmit={auth} className="auth-form">
      <label>Email<input className="field" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" autoComplete="email"/></label>
      <label>Password<input className="field" type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={signup?"new-password":"current-password"}/></label>
      {error&&<p role="alert" className="state-error">{error}</p>}
      {notice&&<p role="status" aria-live="polite" className="state-success">{notice}</p>}
      <button className="btn btn-primary auth-submit" disabled={saving||!supabase}>{saving?"Please wait…":!supabase?"Supabase setup required":signup?"Create account":"Sign in"}</button>
     </form>
     <button className="auth-switch" disabled={!supabase} onClick={()=>{setSignup(!signup);setError("");}}>{signup?"Already registered? Sign in":"New here? Create an account"}</button>
     <p className="auth-security"><ShieldCheck size={15}/> Supabase Auth · Row-level security</p>
    </section>
   </main>
 );
 return (
  <main className="dashboard-shell">
   <aside className="dashboard-sidebar">
    <div className="sidebar-brand"><div className="brand-mark" aria-hidden="true">S</div><div><strong>Salary Smart</strong><span>Personal ledger</span></div></div>
    <nav className="dashboard-nav" aria-label="Dashboard sections">
     <a href="#overview">Overview</a><a href="#add-expense">Add expense</a><a href="#insights">Spending</a><a href="#budget">Budget plan</a><a href="#transactions">Transactions</a>
    </nav>
    <div className="sidebar-account"><span>{user.email}</span><button className="signout-button" onClick={signout}><LogOut size={15}/> Sign out</button></div>
   </aside>
   <section className="dashboard-canvas">
    <header className="mobile-header"><div className="mobile-brand"><div className="brand-mark" aria-hidden="true">S</div><strong>Salary Smart</strong></div><button className="btn btn-muted" onClick={signout}>Sign out</button></header>
    <nav className="mobile-nav" aria-label="Dashboard sections"><a href="#overview">Overview</a><a href="#add-expense">Add expense</a><a href="#insights">Spending</a><a href="#budget">Budget</a><a href="#transactions">Transactions</a></nav>
    <div className="dashboard-content">
     <section id="overview" className="page-title-row">
      <div><h1>Monthly overview</h1><p>{balance>=0?`${money(balance)} remains after ${money(monthTotal)} spent this month.`:`${money(Math.abs(balance))} is over the monthly salary amount.`}</p></div>
      <div className="overview-actions"><label>Month<input aria-label="Analytics month" type="month" className="field" value={month} onChange={e=>setMonth(e.target.value)}/></label><a className="btn btn-primary" href="#add-expense"><Plus size={16}/> Add expense</a></div>
     </section>
     {error&&<div role="alert" className="state-banner state-error">{error}</div>}
     {notice&&<div role="status" aria-live="polite" className="state-banner state-success"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice("")}><X size={15}/></button></div>}
     {loading?<div className="panel loading-state"><RefreshCw className="spin" size={18}/> Loading your data…</div>:<>
      <section className="kpi-grid" aria-label="Monthly totals">
       <article className="panel kpi"><span>Monthly salary</span><strong>{money(salaryNum)}</strong><button onClick={()=>{setSalaryInput(String(salaryNum||""));setShowSalary(!showSalary)}}>{salary?"Change salary":"Set salary"}</button></article>
       <article className="panel kpi"><span>Spent this month</span><strong>{money(monthTotal)}</strong><p>{month}</p></article>
       <article className="panel kpi kpi-primary"><span>Available balance</span><strong>{money(balance)}</strong><p>{salaryNum?`${Math.max(0,Math.round((balance/salaryNum)*100))}% of salary left`:"Set salary to see balance"}</p></article>
       <article className="panel kpi"><span>Transactions</span><strong>{currentExpenses.length}</strong><p>{currentExpenses.length===1?"entry this month":"entries this month"}</p></article>
      </section>
      {showSalary&&<section className="panel salary-panel"><div className="panel-heading"><div><h2>{salary?"Record a salary change":"Set your monthly salary"}</h2><p>{salaryHistory.length?`${salaryHistory.length} salary records saved`:"This becomes your starting monthly income"}</p></div><button className="icon-button" aria-label="Close salary form" onClick={()=>setShowSalary(false)}><X size={17}/></button></div><form onSubmit={saveSalary} className="salary-form"><label>Monthly salary (₹)<input className="field" type="number" min="0" step="0.01" required value={salaryInput} onChange={e=>setSalaryInput(e.target.value)} placeholder="50000"/></label><label>Effective from<input className="field" type="date" required value={salaryDate} onChange={e=>setSalaryDate(e.target.value)}/></label><button className="btn btn-primary" disabled={saving}>{saving?"Saving…":"Save salary"}</button></form></section>}
      <section id="add-expense" className="expense-grid">
       <div className="panel expense-form-panel"><div className="panel-heading"><div><h2>Add an expense</h2><p>Category is suggested from the item name.</p></div></div><form onSubmit={saveExpense} className="expense-form"><label className="wide">What did you buy?<input className="field" required value={item} onChange={e=>{const value=e.target.value;setItem(value);if(!categoryManuallySelected){const match=guessCategory(value);if(match!=="Other")setCategory(match);else if(!value.trim())setCategory("Groceries");}}} placeholder="e.g. Rice and vegetables"/></label><label>Amount (₹)<input className="field" type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="250.00"/></label><label>Quantity<input className="field" type="number" min="0.01" step="0.01" required value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Category<select className="field" value={category} onChange={e=>{setCategory(e.target.value);setCategoryManuallySelected(true);}}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input className="field" type="date" required value={spentAt} onChange={e=>setSpentAt(e.target.value)}/></label><label className="wide">Notes <span>(optional)</span><input className="field" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Store, payment method, or note"/></label>{item&&<p className="category-hint wide">{categoryHint(item)}</p>}<button className="btn btn-primary wide expense-submit" disabled={saving}>{saving?"Saving…":"Save expense"}</button></form></div>
       <div className="panel category-panel"><div className="panel-heading"><div><h2>Spending by category</h2><p>{month}</p></div></div>{byCategory.length?<><div className="category-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2}>{byCategory.map((x,i)=><Cell key={x.name} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>money(Number(v))}/></PieChart></ResponsiveContainer><div className="chart-center"><strong>{money(monthTotal)}</strong><span>total</span></div></div><div className="category-list">{byCategory.slice(0,5).map((x,i)=><div key={x.name}><span><i style={{background:COLORS[i%COLORS.length]}}/> {x.name}</span><strong>{money(x.value)}</strong></div>)}</div></>:<div className="empty-state"><Wallet size={22}/><p>No spending for this month.</p></div>}</div>
      </section>
      <section id="insights" className="insights-grid">
       <div className="panel trend-panel"><div className="panel-heading"><div><h2>Daily spending</h2><p>Recorded spend · {month}</p></div><strong>{daily.length?money(Math.max(...daily.map(x=>x.total))):money(0)} peak</strong></div>{daily.length?<div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="#edf0f2" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v)=>`₹${v}`}/><Tooltip formatter={(v:any)=>money(Number(v))}/><Area type="monotone" dataKey="total" stroke="#1d5fd6" strokeWidth={2.5} fill="#edf3fc"/></AreaChart></ResponsiveContainer></div>:<div className="empty-state"><CalendarDays size={22}/><p>No daily activity yet.</p></div>}</div>
       <div className="panel repeats-panel"><div className="panel-heading"><div><h2>Repeat purchases</h2><p>More than one entry this month</p></div></div>{repeats.length?<div className="repeat-list">{repeats.map(x=><div key={x.name}><div><strong>{x.name}</strong><span>{x.count} entries · quantity {x.qty}</span></div><strong>{money(x.total)}</strong></div>)}</div>:<div className="empty-state"><Check size={22}/><p>Repeated items will appear here.</p></div>}</div>
      </section>
      <section id="budget" className="panel budget-section"><div className="panel-heading"><div><h2>History-based budget planner</h2><p>Uses up to the last 6 months before the selected month. Each category starts from its monthly average, then scales down only if the total exceeds 90% of salary.</p></div><span className="budget-history-badge">{budgetHistoryMonths.length} month{budgetHistoryMonths.length===1?"":"s"} found</span></div>{!budgetHistoryReady&&<div className="budget-history-notice" role="status"><CircleHelp size={17}/><span>At least 2 months of saved expenses are needed for a history-based suggestion. This is a preliminary estimate, not a reliable trend yet.</span></div>}{budget.length?<><div className="budget-summary"><div><span>Suggested monthly budget</span><strong>{money(budgetPlannedTotal)}</strong></div><div><span>Salary left after plan</span><strong>{money(Math.max(0,salaryNum-budgetPlannedTotal))}</strong></div><div><span>History used</span><strong>{budgetHistoryMonths.length} months</strong></div></div><div className="budget-list">{budget.map(x=><div className="budget-row" key={x.name}><div><strong>{x.name}</strong><span>{money(x.previous)} average / month · {money(x.historyTotal)} total in history</span></div><strong>{money(x.planned)}</strong><div className="budget-track"><i style={{width:`${Math.max(4,Math.min(100,(x.planned/Math.max(...budget.map(b=>b.planned),1))*100))}%`}}/></div></div>)}</div><p className="budget-method-note">Method: average by category across the latest {budgetHistoryMonths.length} months that contain expense records, then apply the 90% salary cap proportionally. Months with no recorded expenses are not included in this average. Round-offs may create a small difference.</p></>:<div className="empty-state"><CircleHelp size={22}/><p>Add at least 2 months of expenses before a useful budget recommendation can be shown.</p></div>}</section>
      <section id="transactions" className="panel transaction-section"><div className="panel-heading transaction-heading"><div><h2>Recent transactions</h2><p>Newest entries first</p></div><span>{expenses.length} saved</span></div>{expenses.length?<div className="overflow-x-auto"><table><thead><tr><th>Item</th><th>Category</th><th>Date</th><th>Quantity</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td className="transaction-item"><strong>{x.item_name}</strong>{x.notes&&<span>{x.notes}</span>}</td><td>{x.category_name}</td><td>{new Date(x.spent_at+"T00:00:00").toLocaleDateString("en-IN")}</td><td>{x.quantity}</td><td>{money(Number(x.amount))}</td><td><button className="remove-button" aria-label={`Delete ${x.item_name}`} onClick={()=>removeExpense(x.id)}><X size={15}/></button></td></tr>)}</tbody></table></div>:<div className="empty-state table-empty"><Wallet size={22}/><p>No transactions saved yet.</p></div>}</section>
     </>}
     <footer><span>Salary Smart Budget · Your money stays yours.</span><span><ShieldCheck size={14}/> Supabase authentication · Row-level security</span></footer>
    </div>
   </section>
  </main>
 );
}
