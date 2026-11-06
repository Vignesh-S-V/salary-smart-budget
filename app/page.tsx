"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, MEAT_CATEGORY, categorySuggestion } from "@/lib/category-utils.mjs";
import FinanceModules from "./finance-modules";
import StatementImport from "./statement-import";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, BadgeIndianRupee, CalendarDays, Check, ChevronDown, CircleHelp, CreditCard, LayoutDashboard, LogOut, Plus, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";

type Salary = { id:string; monthly_salary:number; effective_from:string; created_at?:string; note:string|null };
type Expense = { id:string; item_name:string; amount:number; quantity:number; category_name:string; category_id?:string|null; spent_at:string; notes:string|null; import_batch_id?:string|null };
type IncomeTransaction = { id:string; item_name:string; amount:number; income_type:"salary"|"other"|"refund"; received_at:string; notes:string|null; import_batch_id:string|null };
type AccountTransfer = { id:string; item_name:string; amount:number; direction:"incoming"|"outgoing"; transferred_at:string; notes:string|null; import_batch_id:string|null };
const COLORS = ["#f0783d","#efc36a","#253d59","#26a18f","#9a668e"];
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const today = () => new Date().toLocaleDateString("en-CA");
const currentMonth = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
function guessCategory(item:string) { return categorySuggestion(item).category || "Other"; }
function categoryHint(item:string) { const result=categorySuggestion(item); if(!item.trim()) return "Enter the item name and we’ll suggest its category automatically."; return result.matched ? `Auto-suggested: ${result.category} · based on “${item.trim()}”. You can change it if needed.` : "Category isn’t clear from that item name, so we’ve selected Other. Add a little more detail for a better suggestion."; }
export default function Home() {
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[signup,setSignup]=useState(false);
 const [salary,setSalary]=useState<Salary|null>(null),[salaryHistory,setSalaryHistory]=useState<Salary[]>([]),[expenses,setExpenses]=useState<Expense[]>([]),[incomes,setIncomes]=useState<IncomeTransaction[]>([]),[transfers,setTransfers]=useState<AccountTransfer[]>([]);
 const [salaryInput,setSalaryInput]=useState(""),[salaryDate,setSalaryDate]=useState(today()),[showSalary,setShowSalary]=useState(false),[salaryAction,setSalaryAction]=useState<"add"|"change"|null>(null);
 const [oneTimeIncomeKind,setOneTimeIncomeKind]=useState("Bonus"),[oneTimeIncomeSource,setOneTimeIncomeSource]=useState("Bonus"),[oneTimeIncomeAmount,setOneTimeIncomeAmount]=useState("25500"),[oneTimeIncomeDate,setOneTimeIncomeDate]=useState(today());
 const [item,setItem]=useState(""),[amount,setAmount]=useState(""),[qty,setQty]=useState("1"),[category,setCategory]=useState("Groceries"),[spentAt,setSpentAt]=useState(today()),[notes,setNotes]=useState("");
 const [categories,setCategories]=useState<string[]>(CATEGORIES),[newCategory,setNewCategory]=useState("");
 const [categoryManuallySelected,setCategoryManuallySelected]=useState(false);
 const [investmentAmountInput,setInvestmentAmountInput]=useState("");
 const [investmentHorizon,setInvestmentHorizon]=useState("5");
 const [investmentRisk,setInvestmentRisk]=useState("low");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[activeSection,setActiveSection]=useState("overview");
 const month=currentMonth();
 const loadedUserId=useRef<string|null>(null);
 const user=session?.user;
 const load=useCallback(async(uid:string)=>{const client=supabase;if(!client)return;setLoading(true);setError("");try{
  const [s,c]=await Promise.all([client.from("salary_history").select("*").eq("user_id",uid).order("effective_from",{ascending:false}).order("created_at",{ascending:false}).order("id",{ascending:false}),client.from("expense_categories").select("id,name").eq("user_id",uid).order("name")]);
  if(s.error||c.error)throw s.error||c.error;
  const pageSize=1000;
  const fetchAll=async(table:string,orderColumn:string)=>{let all:any[]=[];for(let from=0;;from+=pageSize){const {data,error}=await client.from(table).select("*").eq("user_id",uid).order(orderColumn,{ascending:false}).order("id",{ascending:false}).range(from,from+pageSize-1);if(error)throw error;const batch=data||[];all=all.concat(batch);if(batch.length<pageSize)break;}return all;};
  const [allExpenses,allIncome,allTransfers]=await Promise.all([fetchAll("expenses","spent_at"),fetchAll("income_transactions","received_at"),fetchAll("account_transfers","transferred_at")]);
  const ss=(s.data||[]) as Salary[];setSalaryHistory(ss);setSalary(ss[0]||null);
  let categoryRows=(c.data||[]) as Array<{id:string;name:string}>;
  let meatCategoryRow=categoryRows.find(x=>x.name===MEAT_CATEGORY);
  if(!meatCategoryRow){
   const {data,error}=await client.from("expense_categories").upsert({user_id:uid,name:MEAT_CATEGORY},{onConflict:"user_id,name"}).select("id,name").single();
   if(error)throw error;
   meatCategoryRow=data as {id:string;name:string};
   categoryRows=[...categoryRows,meatCategoryRow];
  }
  const categoryIdByName=new Map(categoryRows.map(x=>[x.name,x.id]));
  const corrected=(allExpenses as Expense[]).map(x=>{
   const guess=categorySuggestion(x.item_name);
   if(guess.matched&&CATEGORIES.includes(x.category_name))return {...x,category_name:guess.category,category_id:categoryIdByName.get(guess.category)??x.category_id??null};
   return x;
  });
  setExpenses(corrected);setIncomes(allIncome as IncomeTransaction[]);setTransfers(allTransfers as AccountTransfer[]);
  for(const x of corrected.filter((x,i)=>x.category_name!==(allExpenses as Expense[])[i].category_name||x.category_id!==(allExpenses as Expense[])[i].category_id)){
   const {error}=await client.from("expenses").update({category_name:x.category_name,category_id:x.category_id??null}).eq("id",x.id).eq("user_id",uid);
   if(error)throw error;
  }
  const saved=categoryRows.map(x=>x.name);setCategories([...new Set([...CATEGORIES,...saved])]);
 }catch(err){setError(err instanceof Error?err.message:"Unable to load your complete finance ledger.");}finally{setLoading(false);}},[]);
 useEffect(()=>{ if(!supabase){setError("Supabase configuration is missing. Add the public project URL and publishable key.");setLoading(false);return;} supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session?.user){loadedUserId.current=data.session.user.id;load(data.session.user.id);}else{loadedUserId.current=null;setLoading(false);}});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);if(s?.user){if(loadedUserId.current!==s.user.id){loadedUserId.current=s.user.id;load(s.user.id);}}else{loadedUserId.current=null;setSalary(null);setSalaryHistory([]);setExpenses([]);setIncomes([]);setTransfers([]);setLoading(false);}});return()=>subscription.unsubscribe();},[load]);
 const currentExpenses=useMemo(()=>expenses.filter(e=>e.spent_at.startsWith(month)),[expenses,month]);
 const currentIncomes=useMemo(()=>incomes.filter(e=>e.received_at.startsWith(month)),[incomes,month]);
 const currentTransfers=useMemo(()=>transfers.filter(e=>e.transferred_at.startsWith(month)),[transfers,month]);
 const monthTotal=currentExpenses.reduce((a,e)=>a+Number(e.amount),0);
 const salaryNum=Number(salary?.monthly_salary||0);
 const monthStart=month+"-01";
 const salaryByMonth=new Map<string,Salary>();
 salaryHistory.forEach(row=>{
  const key=row.effective_from.slice(0,7);
  const previous=salaryByMonth.get(key);
  if(!previous||row.effective_from>previous.effective_from||(row.effective_from===previous.effective_from&&(row.created_at||"")>(previous.created_at||"")))salaryByMonth.set(key,row);
 });
 const salaryTransactionsByMonth=new Map<string,number>();
 incomes.filter(x=>x.income_type==="salary").forEach(row=>{
  const key=row.received_at.slice(0,7);
  salaryTransactionsByMonth.set(key,(salaryTransactionsByMonth.get(key)||0)+Number(row.amount));
 });
 const importedSalary=salaryTransactionsByMonth.get(month)||0;
 const salaryIncome=importedSalary>0?importedSalary:Number(salaryByMonth.get(month)?.monthly_salary||0);
 const otherIncome=currentIncomes.filter(x=>x.income_type!=="salary").reduce((sum,x)=>sum+Number(x.amount),0);
 const monthlyIncome=salaryIncome+otherIncome;
 const previousTransactionIncome=incomes.filter(x=>x.received_at<monthStart).reduce((sum,x)=>sum+Number(x.amount),0);
 const previousSalaryHistoryIncome=Array.from(salaryByMonth.entries())
  .filter(([salaryMonth])=>salaryMonth<month&&!((salaryTransactionsByMonth.get(salaryMonth)||0)>0))
  .reduce((sum,[_salaryMonth,row])=>sum+Number(row.monthly_salary||0),0);
 const previousRecordedIncome=previousTransactionIncome+previousSalaryHistoryIncome;
 const previousRecordedExpenses=expenses.filter(x=>x.spent_at<monthStart).reduce((sum,x)=>sum+Number(x.amount),0);
 const carryForwardBalance=previousRecordedIncome-previousRecordedExpenses;
 // Keep balance math consistent with the Monthly income KPI. Salary-history entries must count even when no imported salary transaction exists.
 const actualMonthIncome=salaryIncome+otherIncome;
 const trackedFunds=actualMonthIncome+carryForwardBalance;
 const balance=trackedFunds-monthTotal;
 const daily=useMemo(()=>{const map=new Map<string,number>();currentExpenses.forEach(e=>map.set(e.spent_at,(map.get(e.spent_at)||0)+Number(e.amount)));return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,total])=>({date:date.slice(5),total}));},[currentExpenses]);
 const byCategory=useMemo(()=>{const map=new Map<string,number>();currentExpenses.forEach(e=>map.set(e.category_name,(map.get(e.category_name)||0)+Number(e.amount)));return Array.from(map.entries()).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);},[currentExpenses]);

 const repeats=useMemo(()=>{const map=new Map<string,{count:number,total:number,qty:number}>();expenses.filter(e=>e.spent_at.startsWith(month)).forEach(e=>{const k=e.item_name.trim().toLowerCase();const v=map.get(k)||{count:0,total:0,qty:0};v.count++;v.total+=Number(e.amount);v.qty+=Number(e.quantity||1);map.set(k,v)});return Array.from(map.entries()).map(([name,v])=>({name:name.replace(/^./,x=>x.toUpperCase()),...v})).filter(x=>x.count>1).sort((a,b)=>b.total-a.total).slice(0,5)},[expenses,month]);
 const financeReview=useMemo(()=>{
  const expenseRatio=monthlyIncome>0?(monthTotal/monthlyIncome)*100:null;
  const topCategory=byCategory[0]||null;
  const savingsTarget=monthlyIncome>0?monthlyIncome*0.1:0;
  const availableSurplus=Math.max(0,balance);
  const affordableSavings=Math.min(savingsTarget,availableSurplus);
  const observations:string[]=[];
  const actions:string[]=[];
  if(!monthlyIncome) observations.push("No salary or income transactions have been recorded, so income-based ratios and a savings estimate cannot be calculated.");
  else if(balance<0){
   observations.push(`Recorded expenses exceed the monthly salary by ${money(Math.abs(balance))}.`);
   actions.push("Review optional spending first and avoid treating credit or borrowed money as available income.");
  }else if(expenseRatio!==null&&expenseRatio>=90){
   observations.push(`${expenseRatio.toFixed(1)}% of the recorded monthly salary has been spent. The remaining margin is tight.`);
   actions.push("Set a weekly spending limit for the rest of the month and pause non-essential purchases until the next salary.");
  }else if(expenseRatio!==null&&expenseRatio>=70){
   observations.push(`${expenseRatio.toFixed(1)}% of the recorded monthly salary has been spent. Monitor the remaining balance carefully.`);
   actions.push("Track weekly spending and move a realistic amount into savings before discretionary purchases.");
  }else if(monthlyIncome>0){
   observations.push(`${(100-(expenseRatio||0)).toFixed(1)}% of recorded monthly income remains after the expenses entered so far.`);
   actions.push("Keep the remaining balance for upcoming bills and essentials; transfer only the amount you can genuinely leave untouched into savings.");
  }
  if(topCategory){
   const share=monthTotal>0?(topCategory.value/monthTotal)*100:0;
   observations.push(`${topCategory.name} is the largest recorded spending category at ${money(topCategory.value)} (${share.toFixed(1)}% of this month's expenses).`);
   if(["Shopping","Entertainment","Food & Drinks"].includes(topCategory.name))
    actions.push(`Check whether ${topCategory.name.toLowerCase()} spending can be reduced next month; even a small limit may improve your surplus.`);
   else
    actions.push(`Review the ${topCategory.name.toLowerCase()} entries for avoidable or duplicate payments before changing this category's budget.`);
  }
  if(repeats.length){
   const frequent=repeats[0];
   observations.push(`${frequent.name} appears ${frequent.count} times this month, totalling ${money(frequent.total)}.`);
   actions.push(`Set a monthly cap for repeated purchases such as ${frequent.name.toLowerCase()} and compare the total at month-end.`);
  }
  if(salaryHistory.length>1){
   observations.push(`${salaryHistory.length} salary records are saved. The dashboard uses the latest effective salary for this review.`);
  }
  if(!currentExpenses.length) observations.push("No expenses have been entered for this month yet. This review will become more useful as transactions are recorded.");
  return {expenseRatio,topCategory,savingsTarget,affordableSavings,observations,actions};
 },[monthlyIncome,monthTotal,balance,byCategory,repeats,salaryHistory.length,currentExpenses.length]);
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
  const salaryCap=Math.max(0,monthlyIncome*0.9);
  const factor=historySpend>salaryCap&&historySpend>0?salaryCap/historySpend:1;
  return averages.map(x=>({
   name:x.name,
   previous:x.previous,
   planned:Math.max(0,Math.round(x.previous*factor)),
   historyTotal:x.historyTotal
  })).sort((a,b)=>b.planned-a.planned);
 },[expenses,month,monthlyIncome]);
 const budgetHistoryMonths=useMemo(()=>{
  return Array.from(new Set(expenses.map(e=>e.spent_at.slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)&&m<month))).sort((a,b)=>b.localeCompare(a)).slice(0,6);
 },[expenses,month]);
 const budgetHistoryReady=budgetHistoryMonths.length>=2;
 const budgetPlannedTotal=budget.reduce((sum,x)=>sum+x.planned,0);

 async function auth(e:React.FormEvent){e.preventDefault();if(!supabase)return;setSaving(true);setError("");const res=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(res.error)setError(res.error.message);else if(signup&&!res.data.session)setNotice("Check your email to confirm your account, then sign in.");setSaving(false);}
 async function signout(){await supabase?.auth.signOut();setSession(null);}
 async function saveSalary(e:React.FormEvent){
   e.preventDefault();if(!supabase||!user)return;
   const n=Number(salaryInput);
   if(!Number.isFinite(n)||n<0||!salaryDate){setError("Enter a valid salary amount and effective date.");return;}
   setSaving(true);setError("");setNotice("");
   const note=salaryAction==="change"?"Salary revised":salaryHistory.length?"Salary added":"Initial salary";
   try{
    const {data,error:insertError}=await supabase.from("salary_history")
     .insert({user_id:user.id,monthly_salary:n,effective_from:salaryDate,note})
     .select("id,monthly_salary,effective_from,created_at,note").single();
    if(insertError)throw insertError;
    if(!data)throw new Error("Salary was not returned after saving. Refresh the page and verify the salary history.");
    const saved=data as Salary;
    setSalaryHistory(previous=>[saved,...previous]);
    setSalary(previous=>!previous||saved.effective_from>=previous.effective_from?saved:previous);
    setNotice(`Salary ${money(n)} saved and applied from ${salaryDate}.`);
    setSalaryInput("");setShowSalary(false);setSalaryAction(null);
    await load(user.id);
   }catch(err){setError(err instanceof Error?err.message:"Unable to save salary. Please retry.");}
   finally{setSaving(false);}
  }
 async function saveExpense(e:React.FormEvent){e.preventDefault();if(!supabase||!user)return;const n=Number(amount),q=Number(qty);if(!item.trim()||!Number.isFinite(n)||n<=0||!Number.isFinite(q)||q<=0){setError("Enter an item, positive amount and quantity.");return;}setSaving(true);const suggestion=categorySuggestion(item);let cat=suggestion.category===MEAT_CATEGORY?MEAT_CATEGORY:categoryManuallySelected?category:suggestion.matched?suggestion.category:category;const cr=await supabase.from("expense_categories").upsert({user_id:user.id,name:cat},{onConflict:"user_id,name"}).select("id").single();const r=await supabase.from("expenses").insert({user_id:user.id,item_name:item.trim(),amount:n,quantity:q,category_id:cr.data?.id||null,category_name:cat,spent_at:spentAt,notes:notes.trim()||null});if(cr.error||r.error)setError(cr.error?.message||r.error?.message||"Unable to save expense.");else{setNotice(item+" saved · "+money(n)+" deducted from your balance.");setItem("");setAmount("");setQty("1");setNotes("");setCategoryManuallySelected(false);setCategory("Groceries");await load(user.id);}setSaving(false);}
 async function removeExpense(id:string){if(!supabase||!user)return;const r=await supabase.from("expenses").delete().eq("id",id).eq("user_id",user.id);if(r.error)setError(r.error.message);else await load(user.id);}
 async function saveOneTimeIncome(e:React.FormEvent){
   e.preventDefault();if(!supabase||!user)return;
   const n=Number(oneTimeIncomeAmount);
   if(!oneTimeIncomeSource.trim()||!Number.isFinite(n)||n<=0||!oneTimeIncomeDate){setError("Enter a source, positive amount and received date.");return;}
   setSaving(true);setError("");
   const r=await supabase.from("income_transactions").insert({
    user_id:user.id,item_name:oneTimeIncomeSource.trim(),amount:n,income_type:"other",
    received_at:oneTimeIncomeDate,notes:"One-time income type: "+oneTimeIncomeKind+"; excluded from recurring salary forecast."
   });
   if(r.error)setError(r.error.message);
   else{setNotice(oneTimeIncomeSource.trim()+" saved as "+oneTimeIncomeKind.toLowerCase()+" · "+money(n)+". Monthly salary and future salary forecast are unchanged.");setOneTimeIncomeKind("Bonus");setOneTimeIncomeSource("Bonus");setOneTimeIncomeAmount("");await load(user.id);}
   setSaving(false);
  }
  async function removeIncome(id:string){if(!supabase||!user)return;const r=await supabase.from("income_transactions").delete().eq("id",id).eq("user_id",user.id);if(r.error)setError(r.error.message);else await load(user.id);}
 async function removeTransfer(id:string){if(!supabase||!user)return;const r=await supabase.from("account_transfers").delete().eq("id",id).eq("user_id",user.id);if(r.error)setError(r.error.message);else await load(user.id);}
 async function clearAllTransactions(){
  if(!supabase||!user)return;
  const [e,i,t]=await Promise.all([
   supabase.from("expenses").select("id",{count:"exact",head:true}).eq("user_id",user.id),
   supabase.from("income_transactions").select("id",{count:"exact",head:true}).eq("user_id",user.id),
   supabase.from("account_transfers").select("id",{count:"exact",head:true}).eq("user_id",user.id)
  ]);
  const countError=e.error||i.error||t.error;if(countError){setError(countError.message);return;}
  const total=(e.count||0)+(i.count||0)+(t.count||0);if(!total)return;
  const confirmed=window.confirm(`Permanently delete all ${total} expense, income and transfer records in your account? Salary, budgets, loans, savings goals and net-worth items will not be changed.`);
  if(!confirmed)return;
  const phrase=window.prompt('Type CLEAR to permanently delete all your transaction records.');
  if(phrase!=="CLEAR"){setNotice("Clear cancelled. No transactions were deleted.");return;}
  setSaving(true);setError("");setNotice("");
  try{
   const {data:{user:verified},error:authError}=await supabase.auth.getUser();
   if(authError||!verified||verified.id!==user.id)throw new Error("Login verification failed. Sign in again.");
   const deletes=await Promise.all([
    supabase.from("expenses").delete({count:"exact"}).eq("user_id",verified.id),
    supabase.from("income_transactions").delete({count:"exact"}).eq("user_id",verified.id),
    supabase.from("account_transfers").delete({count:"exact"}).eq("user_id",verified.id),
    supabase.from("statement_import_batches").delete().eq("user_id",verified.id)
   ]);
   const failed=deletes.find(x=>x.error);if(failed?.error)throw failed.error;
   const deleted=deletes.slice(0,3).reduce((sum,x)=>sum+((x as any).count||0),0);
   if(deleted!==total)throw new Error(`Expected to delete ${total} transaction rows, but database confirmed ${deleted}. Refresh and verify.`);
   await load(verified.id);
   setNotice(`Deleted ${deleted} expense, income and transfer rows. Salary, budgets, loans, goals and net worth were preserved.`);
  }catch(e){setError(e instanceof Error?e.message:"Could not clear all transaction records.");}
  finally{setSaving(false);}
 }
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
     {[["overview","Overview"],["add-expense","Add expense"],["finance-report","Finance report"],["insights","Spending"],["budget","Budget"],["recurring-bills","Recurring bills"],["loans","Loans"],["savings","Savings goals"],["forecast","Cash flow"],["net-worth","Net worth"],["ai-finance","AI Finance Manager"],["investments","Investments"],["transactions","Transactions"],["income","Income & transfers"],["import-statement","Import statement"]].map(([id,label])=><button key={id} type="button" className={activeSection===id?"active":""} onClick={()=>setActiveSection(id)}>{label}</button>)}
    </nav>
    <div className="sidebar-account"><span>{user.email}</span><button className="signout-button" onClick={signout}><LogOut size={15}/> Sign out</button></div>
   </aside>
   <section className="dashboard-canvas">
    <header className="mobile-header"><div className="mobile-brand"><div className="brand-mark" aria-hidden="true">S</div><strong>Salary Smart</strong></div><button className="btn btn-muted" onClick={signout}>Sign out</button></header>
    <nav className="mobile-nav" aria-label="Dashboard sections">{[["overview","Overview"],["add-expense","Add expense"],["finance-report","Finance"],["insights","Spending"],["budget","Budget"],["recurring-bills","Bills"],["loans","Loans"],["savings","Goals"],["forecast","Forecast"],["net-worth","Net worth"],["ai-finance","AI Manager"],["investments","Invest"],["transactions","History"],["income","Income"],["import-statement","Import"]].map(([id,label])=><button key={id} type="button" className={activeSection===id?"active":""} onClick={()=>setActiveSection(id)}>{label}</button>)}</nav>
    <div className="dashboard-content">
     <section className="page-title-row">
      <div><h1>{({overview:"Monthly overview","add-expense":"Add an expense","finance-report":"Finance Manager Report",insights:"Spending insights",budget:"Budget Management","recurring-bills":"Recurring Bills",loans:"Loan Manager",savings:"Savings Goals",forecast:"Cash Flow","net-worth":"Net Worth Tracker","ai-finance":"AI Finance Manager",investments:"Savings & investments",transactions:"Transaction history",income:"Income & transfers","import-statement":"Import bank statement"} as Record<string,string>)[activeSection]}</h1><p>{activeSection==="overview"?(balance>=0?`${money(balance)} remains after ${money(monthTotal)} spent this month.`:`${money(Math.abs(balance))} is over the monthly salary amount.`):"Your personal finance workspace · "+month}</p></div>
      <div className="overview-actions"><label>Current month<input aria-label="Current month" type="month" className="field" value={month} readOnly/></label></div>
     </section>
     {error&&<div role="alert" className="state-banner state-error">{error}</div>}
     {notice&&<div role="status" aria-live="polite" className="state-banner state-success"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice("")}><X size={15}/></button></div>}
     {loading?<div className="panel loading-state"><RefreshCw className="spin" size={18}/> Loading your data…</div>:<>
      {activeSection==="overview"&&<>
      <section className="kpi-grid" aria-label="Monthly totals">
       <article className="panel kpi"><span>Monthly income</span><strong>{money(monthlyIncome)}</strong><p>Salary for this month: {money(salaryIncome)} · Other credits: {money(otherIncome)}</p>{otherIncome>0&&<details style={{marginTop:8,fontSize:12}}><summary style={{cursor:"pointer"}}>View other-credit breakdown</summary><div style={{display:"grid",gap:5,marginTop:8}}>{currentIncomes.filter(x=>x.income_type!=="salary").map(x=><div key={x.id} style={{display:"flex",justifyContent:"space-between",gap:8}}><span>{x.item_name} · {x.notes?.match(/One-time income type:\s*([^;]+)/i)?.[1]||(x.income_type==="refund"?"Refund":"Other income")}</span><strong>{money(Number(x.amount))}</strong></div>)}</div></details>}<div className="salary-actions"><button type="button" onClick={()=>{setSalaryAction("add");setSalaryInput("");setSalaryDate(today());setShowSalary(true);setError("");}}>Add salary</button><button type="button" disabled={!salary} onClick={()=>{setSalaryAction("change");setSalaryInput(String(salaryNum||""));setSalaryDate(today());setShowSalary(true);setError("");}}>Change salary</button></div></article>
       <article className="panel kpi"><span>Spent this month</span><strong>{money(monthTotal)}</strong><p>{month}</p></article>
       <article className="panel kpi kpi-primary"><span>Available balance · tracked estimate</span><strong>{money(balance)}</strong><p>This month’s salary + other credits + {money(carryForwardBalance)} opening balance − {money(monthTotal)} expenses. This is not a live bank balance.</p></article>
       <article className="panel kpi"><span>Transactions</span><strong>{currentExpenses.length}</strong><p>{currentExpenses.length===1?"entry this month":"entries this month"}</p></article>
      </section>
      {showSalary&&<section className="panel salary-panel"><div className="panel-heading"><div><h2>{salaryAction==="change"?"Change monthly salary":"Add salary for this month"}</h2><p>{salaryHistory.length?`${salaryHistory.length} salary records saved`:"This becomes your starting monthly income"} · Each salary record applies only to its effective month. A new month starts at ₹0 until you add that month’s salary.</p></div><button className="icon-button" aria-label="Close salary form" onClick={()=>{setShowSalary(false);setSalaryAction(null);}}><X size={17}/></button></div><form onSubmit={saveSalary} className="salary-form"><label>Monthly salary (₹)<input className="field" type="number" min="0" step="0.01" required value={salaryInput} onChange={e=>setSalaryInput(e.target.value)} placeholder="50000"/></label><label>Effective from<input className="field" type="date" required value={salaryDate} onChange={e=>setSalaryDate(e.target.value)}/></label><button className="btn btn-primary" disabled={saving}>{saving?"Saving…":salaryAction==="change"?"Save salary change":"Add salary"}</button></form></section>}
       <section className="overview-chart-grid">
<div className="panel category-panel"><div className="panel-heading"><div><h2>Spending by category</h2><p>{month}</p></div></div>{byCategory.length?<><div className="category-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2}>{byCategory.map((x,i)=><Cell key={x.name} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>money(Number(v))}/></PieChart></ResponsiveContainer><div className="chart-center"><strong>{money(monthTotal)}</strong><span>total</span></div></div><div className="category-list">{byCategory.slice(0,5).map((x,i)=><div key={x.name}><span><i style={{background:COLORS[i%COLORS.length]}}/> {x.name}</span><strong>{money(x.value)}</strong></div>)}</div></>:<div className="empty-state"><Wallet size={22}/><p>No spending for this month.</p></div>}</div>
<div className="panel repeats-panel"><div className="panel-heading"><div><h2>Repeat purchases</h2><p>More than one entry this month</p></div></div>{repeats.length?<div className="repeat-list">{repeats.map(x=><div key={x.name}><div><strong>{x.name}</strong><span>{x.count} entries · quantity {x.qty}</span></div><strong>{money(x.total)}</strong></div>)}</div>:<div className="empty-state"><Check size={22}/><p>Repeated items will appear here.</p></div>}</div>
       </section>
       <section className="overview-daily-grid">
<div className="panel trend-panel"><div className="panel-heading"><div><h2>Daily spending</h2><p>Recorded spend · {month}</p></div><strong>{daily.length?money(Math.max(...daily.map(x=>x.total))):money(0)} peak</strong></div>{daily.length?<div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="#edf0f2" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v)=>`₹${v}`}/><Tooltip formatter={(v:any)=>money(Number(v))}/><Area type="monotone" dataKey="total" stroke="#ef783d" strokeWidth={2.5} fill="#fff0e6"/></AreaChart></ResponsiveContainer></div>:<div className="empty-state"><CalendarDays size={22}/><p>No daily activity yet.</p></div>}</div>
       </section>
      </>}
      {activeSection==="add-expense"&&<>
      <section className="panel expense-form-panel"><div className="panel-heading"><div><h2>Add an expense</h2><p>Category is suggested from the item name.</p></div></div>
       <form onSubmit={saveExpense} className="expense-form"><label className="wide">What did you buy?<input className="field" required value={item} onChange={e=>{const value=e.target.value;setItem(value);setCategoryManuallySelected(false);const suggestion=categorySuggestion(value);setCategory(value.trim()?(suggestion.matched?suggestion.category:"Other"):"Groceries");}} placeholder="e.g. Rice and vegetables"/></label><label>Amount (₹)<input className="field" type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="250.00"/></label><label>Quantity<input className="field" type="number" min="0.01" step="0.01" required value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Category<select className="field" value={category} onChange={e=>{setCategory(e.target.value);setCategoryManuallySelected(true);}}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input className="field" type="date" required value={spentAt} onChange={e=>setSpentAt(e.target.value)}/></label><label className="wide">Notes <span>(optional)</span><input className="field" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Store, payment method, or note"/></label>{item&&<p className="category-hint wide">{categoryHint(item)}</p>}<button className="btn btn-primary wide expense-submit" disabled={saving}>{saving?"Saving…":"Save expense"}</button></form></section>

      </>}
      {activeSection==="finance-report"&&<>
      <section id="finance-report" className="panel finance-report">
       <div className="panel-heading"><div><h2>Finance Manager Report</h2><p>Monthly financial review · {month}</p></div><span className="budget-history-badge">Based on saved records</span></div>
       <div className="finance-report-metrics">
        <div><span>Recorded income</span><strong>{money(monthlyIncome)}</strong></div>
        <div><span>Recorded expenses</span><strong>{money(monthTotal)}</strong></div>
        <div><span>Remaining balance</span><strong>{money(balance)}</strong></div>
        <div><span>Expense-to-income</span><strong>{financeReview.expenseRatio===null?"—":financeReview.expenseRatio.toFixed(1)+"%"}</strong></div>
       </div>
       <div className="finance-report-body">
        <div><h3>Manager's observations</h3><ul>{financeReview.observations.map((x,i)=><li key={i}>{x}</li>)}</ul></div>
        <div><h3>Recommended next steps</h3>{financeReview.actions.length?<ol>{financeReview.actions.map((x,i)=><li key={i}>{x}</li>)}</ol>:<p>Enter salary and expense records to generate practical next steps.</p>}</div>
       </div>
       <div className="finance-report-savings"><span>Indicative 10% savings goal</span><strong>{money(financeReview.savingsTarget)}</strong><span>Surplus currently available after recorded expenses: {money(financeReview.affordableSavings)}</span></div>
       <p className="finance-report-note">This is a rule-based review of saved records, not a certified accounting statement. It does not include unrecorded cash spending, other bank accounts, taxes or missing statement periods. Expense, income and transfer ledgers are loaded in 1,000-row pages. Imported salary credits replace the salary-history estimate for the selected month to avoid double-counting.</p>
      </section>
      </>}
      {activeSection==="insights"&&<>
<div className="panel trend-panel"><div className="panel-heading"><div><h2>Daily spending</h2><p>Recorded spend · {month}</p></div><strong>{daily.length?money(Math.max(...daily.map(x=>x.total))):money(0)} peak</strong></div>{daily.length?<div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="#edf0f2" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v)=>`₹${v}`}/><Tooltip formatter={(v:any)=>money(Number(v))}/><Area type="monotone" dataKey="total" stroke="#1d5fd6" strokeWidth={2.5} fill="#edf3fc"/></AreaChart></ResponsiveContainer></div>:<div className="empty-state"><CalendarDays size={22}/><p>No daily activity yet.</p></div>}</div>
<div className="panel repeats-panel"><div className="panel-heading"><div><h2>Repeat purchases</h2><p>More than one entry this month</p></div></div>{repeats.length?<div className="repeat-list">{repeats.map(x=><div key={x.name}><div><strong>{x.name}</strong><span>{x.count} entries · quantity {x.qty}</span></div><strong>{money(x.total)}</strong></div>)}</div>:<div className="empty-state"><Check size={22}/><p>Repeated items will appear here.</p></div>}</div>
      </>}
      {activeSection==="budget"&&<FinanceModules section="budget" userId={user.id} salary={monthlyIncome} expenses={expenses} month={month}/>}
      {activeSection==="recurring-bills"&&<FinanceModules section="recurring-bills" userId={user.id} salary={monthlyIncome} expenses={expenses} month={month}/>}
      {activeSection==="loans"&&<FinanceModules section="loans" userId={user.id} salary={salaryNum} expenses={expenses} month={month}/>}
      {activeSection==="savings"&&<FinanceModules section="savings" userId={user.id} salary={salaryNum} expenses={expenses} month={month}/>}
      {activeSection==="forecast"&&<FinanceModules section="forecast" userId={user.id} salary={salaryIncome} monthlyIncome={monthlyIncome} openingBalance={carryForwardBalance} availableBalance={balance} incomeRecords={incomes} salaryHistory={salaryHistory} expenses={expenses} month={month}/>}
      {activeSection==="net-worth"&&<FinanceModules section="net-worth" userId={user.id} salary={salaryNum} expenses={expenses} month={month}/>}
      {activeSection==="ai-finance"&&<FinanceModules section="ai-finance" userId={user.id} salary={salaryIncome} monthlyIncome={monthlyIncome} otherCredits={currentIncomes.filter(x=>x.income_type!=="salary")} expenses={expenses} month={month}/>}
      {activeSection==="investments"&&<>
<section id="investments" className="panel investment-section">
       <div className="panel-heading investment-heading"><div><h2>Monthly savings & investment guide</h2><p>Explore options for your surplus. No investment can guarantee high returns with zero risk.</p></div><span className="budget-history-badge">India · INR</span></div>
       <div className="investment-controls">
        <label>Amount you can invest monthly (₹)<input className="field" type="number" min="0" step="100" value={investmentAmountInput} onChange={e=>setInvestmentAmountInput(e.target.value)} placeholder={String(Math.max(0,Math.round(balance)))}/><span className="investment-help">Default suggestion uses this month's salary minus recorded expenses ({money(Math.max(0,balance))}). Adjust for bills, emergency savings and upcoming costs.</span></label>
        <label>When will you need this money?<select className="field" value={investmentHorizon} onChange={e=>setInvestmentHorizon(e.target.value)}><option value="0.5">Within 1 year</option><option value="2">1–3 years</option><option value="5">3–5 years</option><option value="10">5+ years</option></select></label>
        <label>Risk comfort<select className="field" value={investmentRisk} onChange={e=>setInvestmentRisk(e.target.value)}><option value="low">Very low — protect capital</option><option value="moderate">Moderate — some ups and downs</option><option value="high">High — accept market losses</option></select></label>
       </div>
       <div className="investment-summary">
        <div><span>Monthly amount</span><strong>{money(Math.max(0,Number(investmentAmountInput===""?Math.max(0,balance):investmentAmountInput)||0))}</strong></div>
        <div><span>12-month contribution</span><strong>{money(Math.max(0,Number(investmentAmountInput===""?Math.max(0,balance):investmentAmountInput)||0)*12)}</strong></div>
        <div><span>First priority</span><strong>Emergency fund</strong></div>
       </div>
       <div className="investment-options">
        {(investmentRisk==="low"?[
         {name:"Bank Recurring Deposit (RD)",risk:"Low",horizon:"6 months–5 years",returnText:"Fixed rate stated by your bank",detail:"Useful for disciplined monthly saving. Premature closure may reduce interest; check the bank's current rate and rules.",tag:"Start here"},
         {name:"Bank Fixed Deposit (FD) / sweep FD",risk:"Low",horizon:"Short to medium term",returnText:"Rate fixed for the chosen tenure",detail:"Consider a ladder of maturity dates for planned expenses. DICGC deposit insurance is generally up to ₹5 lakh per depositor per insured bank, including principal and interest.",tag:"Capital stability"},
         {name:"Post Office RD / small-savings schemes",risk:"Low (scheme-dependent)",horizon:"Scheme-specific",returnText:"Government-notified rate; verify current rate",detail:"Compare lock-in, eligibility, tax treatment and withdrawal rules before opening. PPF is a long-term product, not for near-term cash.",tag:"Government-backed options"},
         {name:"Overnight / liquid mutual fund",risk:"Low, not zero",horizon:"Very short term",returnText:"Variable; not guaranteed",detail:"Market-linked and not deposit-insured. NAV can fluctuate; review exit load, expense ratio and tax before investing.",tag:"Accessible, with caveats"}
        ]:investmentRisk==="moderate"?[
         {name:"RD / FD for near-term goals",risk:"Low",horizon:"Under 3 years",returnText:"Fixed rate for chosen tenure",detail:"Keep money needed soon out of equity. Compare current bank rates and premature-withdrawal rules.",tag:"Goal protection"},
         {name:"Short-duration / high-quality debt mutual fund",risk:"Low–moderate, not zero",horizon:"2–3+ years",returnText:"Variable; not guaranteed",detail:"Interest-rate and credit risk remain. Check portfolio quality, modified duration, expense ratio and taxation.",tag:"Understand the risks"},
         {name:"Broad-market index mutual fund",risk:"High in short term",horizon:"Preferably 5+ years",returnText:"Market-linked; losses possible",detail:"Only for long-term money. Diversification does not prevent losses; consider a low-cost broad index fund and invest consistently.",tag:"Long-term growth"}
        ]:[
         {name:"Broad-market index mutual fund",risk:"High",horizon:"5–10+ years",returnText:"Market-linked; no guaranteed return",detail:"A low-cost diversified index fund can be a simple equity starting point, but value can fall sharply and recovery may take years.",tag:"Long-term only"}
        ]).filter(option=>{
         if(investmentRisk==="high") return true;
         if(investmentHorizon==="0.5") return /RD|FD|Post Office|liquid|safety bucket/i.test(option.name);
         if(investmentHorizon==="2") return !/Broad-market index/i.test(option.name) && !/liquid mutual fund/i.test(option.name);
         if(investmentHorizon==="5") return !/Broad-market index|liquid mutual fund/i.test(option.name);
         return true;
        }).map(option=><article className="investment-option" key={option.name}><div className="investment-option-top"><h3>{option.name}</h3><span>{option.tag}</span></div><div className="investment-facts"><div><small>Risk</small><strong>{option.risk}</strong></div><div><small>Time horizon</small><strong>{investmentHorizon==="5"&&/RD \/ FD/i.test(option.name)?"Choose a tenure matching 3–5 years":option.horizon}</strong></div><div><small>Return type</small><strong>{option.returnText}</strong></div></div><p>{investmentHorizon==="5"&&/RD \/ FD/i.test(option.name)?"Choose an RD/FD tenure that matches your 3–5 year goal and check premature-withdrawal rules.":option.detail}</p></article>)}
        {investmentRisk==="high"&&investmentHorizon!=="10"&&<div className="investment-warning"><strong>No high-risk option matches this time horizon.</strong><p>Equity index funds are generally better suited to 5+ year goals because values can fall and may take years to recover. For a 3–5 year goal, consider safer options or select a longer horizon only if your goal allows it.</p></div>}
       </div>
       <div className="investment-warning"><ShieldCheck size={18}/><div><strong>Safer order of priorities</strong><p>1) Clear overdue/high-interest debt, 2) build an emergency reserve of roughly 3–6 months of essential expenses in accessible, low-risk savings, 3) use suitable insurance, then invest according to goal and time horizon. Don't invest money needed for next month's bills.</p></div></div>
       <p className="investment-disclaimer">Educational guidance only, not personalized financial advice. Rates, tax rules and scheme terms change; verify current details with the bank, India Post, AMC or a SEBI-registered adviser. Mutual funds and market-linked products can lose value. “Low risk” does not mean “loss impossible.”</p>
      </section>
      </>}
      {activeSection==="import-statement"&&<StatementImport userId={user.id} onImported={()=>load(user.id)}/>}
      {activeSection==="income"&&<>
        <section className="panel transaction-section">
         <div className="panel-heading"><div><h2>Add Other Income</h2><p>Record a bonus, incentive, gift, side income or any other one-time credit. It is counted only in the month received and never added to recurring monthly salary.</p></div></div>
         <form className="expense-form" onSubmit={saveOneTimeIncome}>
          <label>Income type<select className="field" value={oneTimeIncomeKind} onChange={e=>{setOneTimeIncomeKind(e.target.value);setOneTimeIncomeSource(e.target.value==="Other income"?"":e.target.value);}}><option>Bonus</option><option>Incentive</option><option>Gift</option><option>Side income</option><option>Other income</option></select></label>
          <label>Income source<input className="field" required value={oneTimeIncomeSource} onChange={e=>setOneTimeIncomeSource(e.target.value)} placeholder="e.g. Annual bonus or freelance work"/></label>
          <label>Amount (₹)<input className="field" type="number" min="0.01" step="0.01" required value={oneTimeIncomeAmount} onChange={e=>setOneTimeIncomeAmount(e.target.value)} placeholder="25500"/></label>
          <label>Received date<input className="field" type="date" required value={oneTimeIncomeDate} onChange={e=>setOneTimeIncomeDate(e.target.value)}/></label>
          <button className="btn btn-primary" disabled={saving}>{saving?"Saving…":"Save Other Income"}</button>
         </form>
        </section>
        <section className="panel transaction-section" style={{marginTop:16}}>
         <div className="panel-heading"><div><h2>Income ledger</h2><p>All saved income entries · previous-month credits are included here too</p></div><strong>{money(incomes.reduce((sum,x)=>sum+Number(x.amount),0))}</strong></div>
         {incomes.length?<div className="overflow-x-auto"><table><thead><tr><th>Source / description</th><th>Type</th><th>Date</th><th>Amount</th><th>Action</th></tr></thead><tbody>{incomes.map(x=><tr key={x.id}><td className="transaction-item"><strong>{x.item_name}</strong>{x.notes&&<span>{x.notes}</span>}</td><td>{x.income_type==="salary"?"Salary":"Other income"}</td><td>{new Date(x.received_at+"T00:00:00").toLocaleDateString("en-IN")}</td><td>{money(Number(x.amount))}</td><td><button className="remove-button" aria-label={`Delete income ${x.item_name}`} onClick={()=>removeIncome(x.id)}><X size={15}/></button></td></tr>)}</tbody></table></div>:<div className="empty-state table-empty"><Wallet size={22}/><p>No income credits saved yet.</p></div>}
        </section>
        <section className="panel transaction-section" style={{marginTop:16}}>
         <div className="panel-heading"><div><h2>Own-account transfers</h2><p>Transfers are displayed separately and do not count as income or expenses.</p></div><strong>{currentTransfers.length} records</strong></div>
         {currentTransfers.length?<div className="overflow-x-auto"><table><thead><tr><th>Description</th><th>Direction</th><th>Date</th><th>Amount</th><th>Action</th></tr></thead><tbody>{currentTransfers.map(x=><tr key={x.id}><td className="transaction-item"><strong>{x.item_name}</strong></td><td>{x.direction}</td><td>{new Date(x.transferred_at+"T00:00:00").toLocaleDateString("en-IN")}</td><td>{money(Number(x.amount))}</td><td><button className="remove-button" aria-label={`Delete transfer ${x.item_name}`} onClick={()=>removeTransfer(x.id)}><X size={15}/></button></td></tr>)}</tbody></table></div>:<div className="empty-state table-empty"><p>No own-account transfers saved for this month.</p></div>}
        </section>
       </>}
      {activeSection==="transactions"&&<>
<section id="transactions" className="panel transaction-section"><div className="panel-heading transaction-heading"><div><h2>Recent transactions</h2><p>Newest entries first</p></div><div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}><span>{expenses.length+incomes.length+transfers.length} saved</span><button type="button" className="remove-button" disabled={!(expenses.length+incomes.length+transfers.length)||saving} onClick={clearAllTransactions} style={{width:"auto",padding:"8px 14px",color:"#b42318",border:"1px solid #f0b7b2",borderRadius:8,fontWeight:600}}>{saving?"Clearing…":"Clear all transactions"}</button></div></div>{error&&<p role="alert" className="state-error">{error}</p>}{notice&&<p role="status" className="state-success">{notice}</p>}{expenses.length?<div className="overflow-x-auto"><table><thead><tr><th>Item</th><th>Category</th><th>Date</th><th>Quantity</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td className="transaction-item"><strong>{x.item_name}</strong>{x.notes&&<span>{x.notes}</span>}</td><td>{x.category_name}</td><td>{new Date(x.spent_at+"T00:00:00").toLocaleDateString("en-IN")}</td><td>{x.quantity}</td><td>{money(Number(x.amount))}</td><td><button className="remove-button" aria-label={`Delete ${x.item_name}`} onClick={()=>removeExpense(x.id)}><X size={15}/></button></td></tr>)}</tbody></table></div>:<div className="empty-state table-empty"><Wallet size={22}/><p>No transactions saved yet.</p></div>}</section>
      </>}     </>}
     <footer><span>Salary Smart Budget · Your money stays yours.</span><span><ShieldCheck size={14}/> Supabase authentication · Row-level security</span></footer>
    </div>
   </section>
  </main>
 );
}
