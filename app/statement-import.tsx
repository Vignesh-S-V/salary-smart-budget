"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

type Tx = { date: string; description: string; amount: number; direction: "debit" | "credit"; category: string; confidence: "high" | "review" };
const CATEGORIES = ["Groceries","Medical","Transport","Bills","Loan","Food & Drinks","Personal Care","Shopping","Home & Essentials","Education","Entertainment","Investment & Savings","Other"];
const dateISO = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return d ? new Date(Date.UTC(d.y,d.m-1,d.d)).toISOString().slice(0,10) : null; }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { let y=Number(m[3]); if(y<100)y+=2000; const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1]))); return d.getUTCFullYear()===y&&d.getUTCMonth()===Number(m[2])-1&&d.getUTCDate()===Number(m[1])?d.toISOString().slice(0,10):null; }
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.toISOString().slice(0,10);}
  return null;
};
const category = (s:string) => {
 const x=s.toLowerCase();
 if(/loan|emi|instalment/.test(x))return "Loan";
 if(/sip|mutual fund|investment|stock|share|rd\b|fd\b/.test(x))return "Investment & Savings";
 if(/electricity|eb bill|recharge|rent|internet|water bill|insurance|credit card bill/.test(x))return "Bills";
 if(/petrol|fuel|uber|ola|rapido|bus|train|parking/.test(x))return "Transport";
 if(/hospital|medical|pharmacy|doctor|medicine/.test(x))return "Medical";
 if(/grocery|vegetable|milk|rice|provision/.test(x))return "Groceries";
 if(/restaurant|hotel|swiggy|zomato|tea|coffee|food/.test(x))return "Food & Drinks";
 return "Other";
};
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(n);
function headerIndex(headers:string[], patterns:RegExp[]) { return headers.findIndex(h=>patterns.some(p=>p.test(h))); }
function parseRows(rows:unknown[][]):Tx[] {
 const headerAt=rows.findIndex(r=>r.some(c=>/date|transaction|narration|description|debit|credit|withdrawal|deposit|amount/i.test(String(c??""))));
 const headers=(rows[headerAt<0?0:headerAt]||[]).map(x=>String(x??"").trim().toLowerCase());
 const di=headerIndex(headers,[/^date$|txn date|transaction date|value date/]);
 const desc=headerIndex(headers,[/description|narration|particular|remarks|details|payee/]);
 const debit=headerIndex(headers,[/^debit$|withdrawal|paid out|dr amount/]);
 const credit=headerIndex(headers,[/^credit$|deposit|paid in|cr amount/]);
 const amount=headerIndex(headers,[/^amount$|txn amount|transaction amount/]);
 const out:Tx[]=[];
 for(const row of rows.slice(headerAt<0?0:headerAt+1)){
   const date=dateISO(di>=0?row[di]:row.find(v=>dateISO(v)));
   const description=String(desc>=0?row[desc]??"":row.filter(v=>!dateISO(v)).map(v=>String(v??"")).filter(Boolean).join(" ")).trim();
   const num=(v:unknown)=>{const n=Number(String(v??"").replace(/[₹,\s]/g,"").replace(/[()]/g,""));return Number.isFinite(n)?Math.abs(n):0;};
   let d=debit>=0?num(row[debit]):0, c=credit>=0?num(row[credit]):0;
   if(debit<0&&credit<0&&amount>=0){const a=num(row[amount]);const raw=String(row[amount]??""); if(/\b(cr|credit)\b/i.test(raw))c=a;else d=a;}
   if(!date||!description||(!d&&!c))continue;
   const direction=c>0&&d===0?"credit":"debit", value=direction==="credit"?c:d;
   out.push({date,description,amount:value,direction,category:category(description),confidence:di>=0&&desc>=0&&(debit>=0||credit>=0)?"high":"review"});
 }
 return out;
}
function parseBankAmount(value:string):number {
 const cleaned=value.replace(/[₹,\\s]/g,"").replace(/\\(([^)]+)\\)/,"-$1").replace(/(?:CR|DR)$/i,"");
 const n=Number(cleaned);
 return Number.isFinite(n)?Math.abs(n):0;
}
async function parsePdf(file:File):Promise<Tx[]> {
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.mjs`;
 const data=new Uint8Array(await file.arrayBuffer());
 const pdf=await pdfjs.getDocument({data,useWorkerFetch:false,isEvalSupported:false}).promise;
 const transactions:Tx[]=[];
 const datePattern=/^(?:\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2})$/;
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p);
  const content=await page.getTextContent();
  const items=(content.items as any[]).filter(x=>typeof x.str==="string"&&x.str.trim()).map(x=>({x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0),s:String(x.str).trim()}));
  // Find the exact bank-statement table header. Ignore all account/profile text outside it.
  const headerWords=["date","particulars","deposits","withdrawals","balance"];
  let headerY:number|undefined;
  let anchors:number[]=[];
  const yGroups=new Map<number,typeof items>();
  for(const it of items){const y=Math.round(it.y);const a=yGroups.get(y)||[];a.push(it);yGroups.set(y,a);}
  for(const [y,line] of yGroups){
   const normalized=line.map(v=>v.s.toLowerCase().replace(/[^a-z]/g,""));
   if(headerWords.every(w=>normalized.some(v=>v===w))){
    headerY=y;
    anchors=headerWords.map(w=>line.find(v=>v.s.toLowerCase().replace(/[^a-z]/g,"")===w)!.x);
    break;
   }
  }
  if(headerY===undefined||anchors.length!==5)continue;
  const bounds=[-Infinity,...anchors.slice(0,4).map((x,i)=>(x+anchors[i+1])/2),Infinity];
  const lines=[...yGroups.entries()].filter(([y])=>y<headerY!).sort((a,b)=>b[0]-a[0]);
  let last:Tx|undefined;
  for(const [y,line] of lines){
   const cols=["","","","",""];
   for(const it of line){
    if(y>=headerY)continue;
    let col=anchors.findIndex((x,i)=>it.x>=bounds[i]&&it.x<bounds[i+1]);
    if(col<0)col=4;
    cols[col]=(cols[col]+" "+it.s).trim();
   }
   const dateText=cols[0].trim().replace(/\\s+/g,"");
   const normalizedDate=dateISO(dateText);
   const particulars=cols[1].trim().replace(/\\s+/g," ");
   const deposit=parseBankAmount(cols[2]);
   const withdrawal=parseBankAmount(cols[3]);
   // Balance column is intentionally ignored and never imported.
   if(normalizedDate && particulars && (deposit>0||withdrawal>0)){
    const direction=deposit>0&&withdrawal===0?"credit":"debit";
    const amount=direction==="credit"?deposit:withdrawal;
    last={date:normalizedDate,description:particulars,amount,direction,category:category(particulars),confidence:"high"};
    transactions.push(last);
   } else if(last && !normalizedDate && particulars && !deposit && !withdrawal && !/opening balance/i.test(particulars)){
    // Join wrapped narration lines belonging to the preceding dated transaction.
    last.description=(last.description+" "+particulars).trim();
   }
  }
 }
 return transactions;
}
export default function StatementImport({userId,onImported}:{userId:string;onImported?:()=>void}) {
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<Tx[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const counts=useMemo(()=>({debit:rows.filter(x=>x.direction==="debit").length,credit:rows.filter(x=>x.direction==="credit").length,review:rows.filter(x=>x.confidence==="review").length}),[rows]);
 async function preview(){if(!file)return;setBusy(true);setError("");setMessage("");try{
  let parsed:Tx[]=[];
  if(/\.pdf$/i.test(file.name))parsed=await parsePdf(file);
  else {const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];parsed=parseRows(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true}) as unknown[][]);}
  if(!parsed.length)throw new Error("No transaction rows detected. Check that the file contains selectable text or a clear Date/Description/Debit/Credit table.");
  setRows(parsed);
 }catch(e){setError(e instanceof Error?e.message:"Could not read this file.");}finally{setBusy(false);}}
 function edit(i:number,patch:Partial<Tx>){setRows(prev=>prev.map((r,n)=>n===i?{...r,...patch}:r));}
 async function importRows(){
  if(!supabase||!rows.length)return;setBusy(true);setError("");setMessage("");
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.id!==userId)throw new Error("Your login session could not be verified. Sign in again.");
   const candidates=rows.filter(r=>r.direction==="debit"&&r.date&&r.description.trim()&&r.amount>0);
   const dates=[...new Set(candidates.map(x=>x.date))];
   const existing=dates.length?await supabase.from("expenses").select("spent_at,amount,item_name").eq("user_id",user.id).in("spent_at",dates):{data:[],error:null};
   if(existing.error)throw existing.error;
   const known=new Set((existing.data||[]).map((x:any)=>[x.spent_at,Number(x.amount).toFixed(2),String(x.item_name).trim().toLowerCase()].join("|")));
   const unique=candidates.filter(x=>!known.has([x.date,x.amount.toFixed(2),x.description.trim().toLowerCase()].join("|")));
   const payload=unique.map(x=>({user_id:user.id,item_name:x.description.trim().slice(0,240),amount:x.amount,quantity:1,category_name:CATEGORIES.includes(x.category)?x.category:"Other",spent_at:x.date,notes:"Imported from "+(file?.name||"statement")}));
   if(payload.length){const {error:insertError}=await supabase.from("expenses").insert(payload);if(insertError)throw insertError;}
   const credits=rows.filter(x=>x.direction==="credit").length;
   setMessage(`Imported ${payload.length} debit transactions. Skipped ${candidates.length-payload.length} possible duplicates. ${credits} credit rows were not imported because this app's current ledger has no income-transaction table.`);
   setRows([]);setFile(null);onImported?.();
  }catch(e){setError(e instanceof Error?e.message:"Import failed.");}finally{setBusy(false);}
 }
 return <section className="panel" style={{padding:24,marginBottom:20}}>
  <div className="panel-heading"><div><h2>Import bank statement</h2><p>Upload Excel or PDF. Transactions are saved to the account currently signed in.</p></div></div>
  <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
   <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setRows([]);setError("");setMessage("");}}/>
   <button className="btn btn-primary" type="button" disabled={!file||busy} onClick={preview}>{busy?"Reading…":"Read file"}</button>
  </div>
  <p className="module-help">PDF extraction works best with text-based bank statements. Scanned/image-only PDFs need OCR and are not supported by this first version. Only debit rows are added to Expenses; credits are shown but not saved.</p>
  {error&&<p role="alert" className="state-error">{error}</p>}{message&&<p role="status" className="state-success">{message}</p>}
  {!!rows.length&&<><div style={{display:"flex",gap:16,flexWrap:"wrap",margin:"16px 0"}}><strong>{rows.length} rows found</strong><span>{counts.debit} debits</span><span>{counts.credit} credits (not imported)</span><span>{counts.review} need review</span></div>
   <div className="overflow-x-auto"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Direction</th><th>Category</th><th>Check</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>
    <td><input className="field" type="date" value={r.date} onChange={e=>edit(i,{date:e.target.value,confidence:"review"})}/></td>
    <td><input className="field" value={r.description} onChange={e=>edit(i,{description:e.target.value,confidence:"review"})}/></td>
    <td><input className="field" type="number" min="0.01" step="0.01" value={r.amount} onChange={e=>edit(i,{amount:Number(e.target.value),confidence:"review"})}/></td>
    <td><select className="field" value={r.direction} onChange={e=>edit(i,{direction:e.target.value as Tx["direction"]})}><option value="debit">Debit</option><option value="credit">Credit</option></select></td>
    <td><select className="field" value={r.category} onChange={e=>edit(i,{category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></td>
    <td>{r.confidence==="high"?"Auto":"Review"}</td>
   </tr>)}</tbody></table></div>
   <button className="btn btn-primary" style={{marginTop:16}} type="button" disabled={busy||!rows.some(x=>x.direction==="debit"&&x.amount>0)} onClick={importRows}>{busy?"Importing…":"Confirm & import debit transactions"}</button>
  </>}
 </section>;
}
