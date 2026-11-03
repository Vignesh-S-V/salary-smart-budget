"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { classifyStatementDirection, inferIncomeType, reconcileStatementRows, transactionFingerprint } from "@/lib/statement-utils.mjs";

type Tx = { date: string; description: string; amount: number; direction: "debit" | "credit" | "transfer_out" | "transfer_in"; category: string; balance: number | null; confidence: "high" | "review" };
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
const CATEGORY_RULES: Array<{category:string;pattern:RegExp;examples:string}> = [
 {category:"Groceries",pattern:/\b(coconut|thengai|rice|arisi|milk|paal|vegetable|vegetables|kaai|tomato|thakkali|onion|vengayam|grocery|groceries|oil|ennai|dal|dhal|paruppu|fruit|fruits|pazham|egg|eggs|bread|atta|flour|sugar|salt|masala|spice|provision|wheat|maida|curd|yogurt|butter|cheese|chicken|mutton|fish|meen|prawn|water can|mineral water|snacks packet|potato|urulaikizhangu|carrot|beans|keerai|banana|vazhaipazham|apple|orange|rice bag)\b/i,examples:"rice, milk, vegetables, coconut, dal"},
 {category:"Medical",pattern:/\b(tablet|tablets|medicine|medicines|medical|doctor|hospital|pharmacy|clinic|health|blood test|scan|xray|x-ray|medical shop|syrup|paracetamol|panadol|bandage|vitamin|consultation)\b/i,examples:"medicine, doctor, tablets"},
 {category:"Transport",pattern:/\b(petrol|diesel|fuel|bus|train|auto|cab|uber|ola|rapido|taxi|parking|toll|metro|travel ticket|bike service|car service|puncture|tyre|tire|petrol bunk)\b/i,examples:"petrol, bus, auto, parking"},
 {category:"Bills",pattern:/\b(eb bill|electricity|current bill|water bill|credit card bill|credit card payment|internet|wifi|broadband|recharge|rent|gas cylinder|mobile bill|phone bill|postpaid|prepaid|dth|subscription|insurance premium)\b/i,examples:"EB bill, electricity, credit card bill, recharge, rent"},
 {category:"Loan",pattern:/\b(loan|loans|emi|principal payment|loan repayment|loan installment)\b/i,examples:"personal loan, gold loan, home loan, car loan EMI"},
 {category:"Food & Drinks",pattern:/\b(hotel|restaurant|tea|coffee|snack|snacks|lunch|dinner|breakfast|juice|swiggy|zomato|food|meals|biriyani|biryani|dosa|dosai|idli|idl(i|y)|parotta|paratha|pizza|burger|bakery|cake|ice cream|icecream|tiffin|parcel food|sweets|juice shop|sappadu|saapadu|saapad|sambar|sambhar|rasam|vadai|vada|bajji|bonda|pongal|upma|chapati|chapathi|chappathi|poori|puri|vada pav|pav bhaji|puffs|bun|biscuit|milkshake|falooda|shawarma|rolls|fried rice|noodles|kothu parotta|curd rice|lemon rice|meals parcel|mess bill|canteen|tiffin kadai|tea kadai|coffee shop)\b/i,examples:"tea, meals, biryani, snacks"},
 {category:"Personal Care",pattern:/\b(hair\s*cut|haircut|hair\s*trim|barber|salon|beauty parlou?r|shave|shaving|beard trim|facial|threading|waxing|manicure|pedicure|nail salon|spa|grooming)\b/i,examples:"haircut, barber, salon, shaving, facial, grooming"},
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
 if(tokenPhrase(["credit card bill","credit card payment","rent","electricity bill","electricity","current bill","water bill","internet bill","wifi bill","recharge","insurance premium","gas bill","mobile bill","phone bill","subscription","dth","d2h","d h tv","dish tv","tata play","sun direct","airtel digital tv","videocon d2h","tv recharge","tv bill"]) || /\\b(dth|d\s*h)\s*(tv)?\\b/.test(normalized))
  return {category:"Bills",matched:true,examples:"credit card bill, electricity, DTH/TV recharge, Tata Play, rent"};
 if(tokenPhrase(["sip","crt sip","crt","mutual fund","mutual funds","stock","stocks","share","shares","share market","stock market","investment","investments","recurring deposit","fixed deposit","gold savings","gold scheme","chit fund","nps","ppf","elss","index fund","equity fund","nifty","sensex","ppf","epf","rd","fd"]))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP, mutual funds, stocks, savings deposits"};

 // Acronym-safe fallbacks for entries typed without separators (CRT-SIP, S.I.P, RD, FD).
 const compact=normalized.replace(/\s/g,"");
 if(/(?:sip|crtsip)/.test(compact)||/\bcrtsip\b/.test(compact))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP"};

 const rule=CATEGORY_RULES.find(x=>x.pattern.test(s));
 return rule?{category:rule.category,matched:true,examples:rule.examples}:{category:"Other",matched:false,examples:""};
}

const category = (s:string) => categorySuggestion(s).category || "Other";

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
 const balance=headerIndex(headers,[/^balance$|available balance|running balance|ledger balance/]);
 const out:Tx[]=[];
 for(const row of rows.slice(headerAt<0?0:headerAt+1)){
   const date=dateISO(di>=0?row[di]:row.find(v=>dateISO(v)));
   const description=String(desc>=0?row[desc]??"":row.filter(v=>!dateISO(v)).map(v=>String(v??"")).filter(Boolean).join(" ")).trim();
   const rawNum=(v:unknown):number|null=>{const raw=String(v??"").trim();if(!raw)return null;const n=Number(raw.replace(/[₹,\s]/g,"").replace(/[()]/g,""));return Number.isFinite(n)?Math.abs(n):null;};
   const d=debit>=0?(rawNum(row[debit])??0):0;
   const c=credit>=0?(rawNum(row[credit])??0):0;
   let debitValue=d,creditValue=c;
   if(debit<0&&credit<0&&amount>=0){const a=rawNum(row[amount])??0;const raw=String(row[amount]??"");if(/\\b(cr|credit)\\b/i.test(raw))creditValue=a;else debitValue=a;}
   if(!date||!description||(!debitValue&&!creditValue)||(debitValue>0&&creditValue>0))continue;
   const bankDirection=creditValue>0?"credit":"debit";
   const direction=classifyStatementDirection(description,bankDirection);
   out.push({date,description,amount:creditValue>0?creditValue:debitValue,direction,category:category(description),balance:balance>=0?rawNum(row[balance]):null,confidence:di>=0&&desc>=0&&(debit>=0||credit>=0)&&categorySuggestion(description).matched?"high":"review"});
 }
 return out;
}
function parseStatementNumber(value:string):number|null {
 const raw=value.trim();
 if(!raw)return null;
 const negative=/^\\(.*\\)$/.test(raw)||/\\bDR$/i.test(raw)||raw.startsWith("-");
 const cleaned=raw.replace(/[₹,\\s]/g,"").replace(/[()]/g,"").replace(/(?:CR|DR)$/i,"").replace(/^-/,"");
 const n=Number(cleaned);
 return Number.isFinite(n)?(negative?-Math.abs(n):Math.abs(n)):null;
}
function parseBankAmount(value:string):number {
 return Math.abs(parseStatementNumber(value)??0);
}
function parseBankBalance(value:string):number|null {
 return parseStatementNumber(value);
}
function parsePositionedBankItems(items:Array<{x:number;y:number;s:string}>):Tx[] {
 const headerWords=["date","particulars","deposits","withdrawals","balance"];
 const yGroups=new Map<number,Array<{x:number;y:number;s:string}>>();
 for(const it of items){const y=Math.round(it.y);const a=yGroups.get(y)||[];a.push(it);yGroups.set(y,a);}
 let headerY:number|undefined,anchors:number[]=[];
 for(const [y,line] of yGroups){
  const normalized=line.map(v=>v.s.toLowerCase().replace(/[^a-z]/g,""));
  if(headerWords.every(w=>normalized.some(v=>v===w))){
   headerY=y;anchors=headerWords.map(w=>line.find(v=>v.s.toLowerCase().replace(/[^a-z]/g,"")===w)!.x);break;
  }
 }
 if(headerY===undefined||anchors.length!==5)return [];
 const bounds=[-Infinity,...anchors.slice(0,4).map((x,i)=>(x+anchors[i+1])/2),Infinity];
 const lines=[...yGroups.entries()].filter(([y])=>y>headerY!).sort((a,b)=>a[0]-b[0]);
 const transactions:Tx[]=[];
 let last:Tx|undefined;
 for(const [,line] of lines){
  const cols=["","","","",""];
  for(const it of line){
   const col=anchors.findIndex((x,i)=>it.x>=bounds[i]&&it.x<bounds[i+1]);
   const target=col<0?4:col;cols[target]=(cols[target]+" "+it.s).trim();
  }
  const normalizedDate=dateISO(cols[0].trim().replace(/\s+/g,""));
  const particulars=cols[1].trim().replace(/\s+/g," ");
  const deposit=parseBankAmount(cols[2]),withdrawal=parseBankAmount(cols[3]);
  const balanceText=cols[4].trim();
  const balance=parseBankBalance(balanceText);
  if(normalizedDate&&particulars&&(deposit>0||withdrawal>0)&&!(deposit>0&&withdrawal>0)){
   const bankDirection=deposit>0?"credit":"debit";
   const direction=classifyStatementDirection(particulars,bankDirection);
   last={date:normalizedDate,description:particulars,amount:deposit>0?deposit:withdrawal,direction,category:category(particulars),balance,confidence:categorySuggestion(particulars).matched?"high":"review"};
   transactions.push(last);
  } else if(last&&!normalizedDate&&particulars&&!deposit&&!withdrawal&&!/opening balance/i.test(particulars)){
   last.description=(last.description+" "+particulars).trim();
   last.category=category(last.description);
   last.confidence=categorySuggestion(last.description).matched?"high":"review";
  }
 }
 return transactions;
}
async function parsePdf(file:File,onProgress?:(value:string)=>void):Promise<Tx[]> {
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.mjs`;
 const data=new Uint8Array(await file.arrayBuffer());
 const pdf=await pdfjs.getDocument({data,useWorkerFetch:false,isEvalSupported:false}).promise;
 const transactions:Tx[]=[];
 for(let p=1;p<=pdf.numPages;p++){
  onProgress?.(`Reading PDF page ${p} of ${pdf.numPages}…`);
  const page=await pdf.getPage(p);
  const viewport=page.getViewport({scale:1});
  const content=await page.getTextContent();
  const items=(content.items as any[]).filter(x=>typeof x.str==="string"&&x.str.trim()).map(x=>({x:Number(x.transform?.[4]||0),y:viewport.height-Number(x.transform?.[5]||0),s:String(x.str).trim()}));
  let pageRows=parsePositionedBankItems(items);
  if(!pageRows.length){
   onProgress?.(`Scanned page detected. Running OCR on page ${p} of ${pdf.numPages}…`);
   const canvas=document.createElement("canvas");
   const renderViewport=page.getViewport({scale:2});
   canvas.width=Math.ceil(renderViewport.width);canvas.height=Math.ceil(renderViewport.height);
   const context=canvas.getContext("2d");
   if(!context)throw new Error("Could not create a canvas for OCR.");
   await page.render({canvasContext:context,viewport:renderViewport}).promise;
   const tesseractUrl="https://esm.sh/tesseract.js@7.0.0";
   // @ts-ignore Tesseract is fetched from the pinned CDN only when OCR is needed.
   const tesseract=await import(/* webpackIgnore: true */ tesseractUrl);
   const worker=await tesseract.createWorker("eng",1,{
    workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
    corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
    langPath:"https://tessdata.projectnaptha.com/4.0.0"
   });
   try{
    const ocr=await worker.recognize(canvas);
    const words=(ocr.data.words||[]).filter((w:any)=>w.text&&w.confidence>=25);
    const ocrItems=words.map((w:any)=>({x:Number(w.bbox?.x0||0),y:Number(w.bbox?.y0||0),s:String(w.text).trim()}));
    pageRows=parsePositionedBankItems(ocrItems);
   }finally{await worker.terminate();}
  }
  transactions.push(...pageRows);
 }
 return transactions;
}
export default function StatementImport({userId,onImported}:{userId:string;onImported?:()=>void}) {
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<Tx[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
 const counts=useMemo(()=>({debit:rows.filter(x=>x.direction==="debit").length,credit:rows.filter(x=>x.direction==="credit").length,transfers:rows.filter(x=>x.direction.startsWith("transfer_")).length,review:rows.filter(x=>x.confidence==="review").length}),[rows]);
 const reconciliation=useMemo(()=>reconcileStatementRows(rows),[rows]);
 async function preview(){if(!file)return;setBusy(true);setError("");setMessage("");setProgress("Preparing file…");try{
  let parsed:Tx[]=[];
  if(/\\.pdf$/i.test(file.name))parsed=await parsePdf(file,setProgress);
  else {const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];parsed=parseRows(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true}) as unknown[][]);}
  if(!parsed.length)throw new Error("No transaction rows detected. The PDF must contain the Date, Particulars, Deposits, Withdrawals and Balance table. Scanned PDFs use OCR; low-quality scans may still need manual review.");
  setRows(parsed);
 }catch(e){setError(e instanceof Error?e.message:"Could not read this file.");}finally{setBusy(false);setProgress("");}}
 function edit(i:number,patch:Partial<Tx>){setRows(prev=>prev.map((r,n)=>n===i?{...r,...patch}:r));}
 async function importRows(){
  if(!supabase||!rows.length||!file)return;setBusy(true);setError("");setMessage("");setProgress("Checking duplicates…");
  let batchId:string|null=null;
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.id!==userId)throw new Error("Your login session could not be verified. Sign in again.");
   const candidates=rows.filter(r=>r.date&&r.description.trim()&&r.amount>0);
   if(!candidates.length)throw new Error("There are no valid transactions to import.");
   const dateValues=candidates.map(x=>x.date).sort();
   const startDate=dateValues[0],endDate=dateValues[dateValues.length-1];
   const hashBuffer=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
   const fileHash=Array.from(new Uint8Array(hashBuffer)).map(x=>x.toString(16).padStart(2,"0")).join("");
   const {data:priorBatch,error:batchCheckError}=await supabase.from("statement_import_batches").select("id,status").eq("user_id",user.id).eq("file_sha256",fileHash).maybeSingle();
   if(batchCheckError)throw batchCheckError;
   if(priorBatch?.status==="imported")throw new Error("This exact file has already been imported. It will not be imported twice.");
   if(priorBatch?.status==="processing")throw new Error("An import of this exact file is already marked as processing. Refresh the page and check its transaction records before retrying.");
   if(priorBatch?.status==="partial_error"){
    const {error:removePartialError}=await supabase.from("statement_import_batches").delete().eq("id",priorBatch.id).eq("user_id",user.id);
    if(removePartialError)throw removePartialError;
   }
   const fetchExistingPages=async(base:any)=>{let all:any[]=[];for(let from=0;;from+=1000){const {data,error}=await base.range(from,from+999);if(error)throw error;const part=data||[];all=all.concat(part);if(part.length<1000)break;}return all;};
   const [existingExpenses,existingIncome,existingTransfers]=await Promise.all([
    fetchExistingPages(supabase.from("expenses").select("spent_at,amount,item_name").eq("user_id",user.id).gte("spent_at",startDate).lte("spent_at",endDate).order("spent_at",{ascending:false}).order("id",{ascending:false})),
    fetchExistingPages(supabase.from("income_transactions").select("received_at,amount,item_name,income_type").eq("user_id",user.id).gte("received_at",startDate).lte("received_at",endDate).order("received_at",{ascending:false}).order("id",{ascending:false})),
    fetchExistingPages(supabase.from("account_transfers").select("transferred_at,amount,item_name,direction").eq("user_id",user.id).gte("transferred_at",startDate).lte("transferred_at",endDate).order("transferred_at",{ascending:false}).order("id",{ascending:false}))
   ]);
   const known=new Set<string>();
   existingExpenses.forEach((x:any)=>known.add(transactionFingerprint(x.spent_at,x.amount,x.item_name,"expense")));
   existingIncome.forEach((x:any)=>known.add(transactionFingerprint(x.received_at,x.amount,x.item_name,"income:"+x.income_type)));
   existingTransfers.forEach((x:any)=>known.add(transactionFingerprint(x.transferred_at,x.amount,x.item_name,"transfer:"+x.direction)));
   const expenseRows:any[]=[],incomeRows:any[]=[],transferRows:any[]=[];
   let duplicates=0;
   for(const row of candidates){
    let kind="",target:"expense"|"income"|"transfer";
    if(row.direction==="debit"){kind="expense";target="expense";}
    else if(row.direction==="credit"){const incomeType=inferIncomeType(row.description);kind="income:"+incomeType;target="income";}
    else {kind="transfer:"+(row.direction==="transfer_in"?"incoming":"outgoing");target="transfer";}
    const fingerprint=transactionFingerprint(row.date,row.amount,row.description,kind);
    if(known.has(fingerprint)){duplicates++;continue;}
    known.add(fingerprint);
    if(target==="expense")expenseRows.push({user_id:user.id,item_name:row.description.trim().slice(0,240),amount:row.amount,quantity:1,category_name:CATEGORIES.includes(row.category)?row.category:"Other",spent_at:row.date,notes:"Imported from "+file.name,import_batch_id:null});
    else if(target==="income")incomeRows.push({user_id:user.id,item_name:row.description.trim().slice(0,240),amount:row.amount,income_type:kind.slice("income:".length),received_at:row.date,notes:"Imported from "+file.name,import_batch_id:null});
    else transferRows.push({user_id:user.id,item_name:row.description.trim().slice(0,240),amount:row.amount,direction:row.direction==="transfer_in"?"incoming":"outgoing",transferred_at:row.date,reference:null,notes:"Imported from "+file.name,import_batch_id:null});
   }
   const rec=reconciliation;
   const {data:batch,error:batchError}=await supabase.from("statement_import_batches").insert({
    user_id:user.id,file_name:file.name.slice(0,255),file_sha256:fileHash,statement_start:startDate,statement_end:endDate,
    total_rows:candidates.length,expense_rows:expenseRows.length,income_rows:incomeRows.length,transfer_rows:transferRows.length,duplicate_rows:duplicates,
    opening_balance:rec.available?rec.openingBalance:null,closing_balance:rec.available?rec.closingBalance:null,
    calculated_closing_balance:rec.available?rec.calculatedClosingBalance:null,balance_difference:rec.available?rec.difference:null,
    reconciliation_status:!rec.available?"not_available":rec.matched?"matched":"mismatch",status:"processing"
   }).select("id").single();
   if(batchError)throw batchError;
   batchId=batch.id;
   const setBatchId=(items:any[])=>items.map(x=>({...x,import_batch_id:batchId}));
   const insertChunks=async(table:string,items:any[])=>{for(let from=0;from<items.length;from+=500){const {error}=await supabase.from(table).insert(items.slice(from,from+500));if(error)throw error;}};
   setProgress("Saving expenses, income and transfers…");
   await insertChunks("expenses",setBatchId(expenseRows));
   await insertChunks("income_transactions",setBatchId(incomeRows));
   await insertChunks("account_transfers",setBatchId(transferRows));
   const {error:finishError}=await supabase.from("statement_import_batches").update({status:"imported"}).eq("id",batchId).eq("user_id",user.id);
   if(finishError)throw finishError;
   const recMessage=!rec.available?"Balance reconciliation unavailable (no readable running balance sequence).":rec.matched?"Running balance reconciled.":`Running balance difference: ${money(Math.abs(rec.difference||0))}. Review before relying on the statement totals.`;
   setMessage(`Imported ${expenseRows.length} expenses, ${incomeRows.length} income credits and ${transferRows.length} own-account transfers. Skipped ${duplicates} duplicates. ${recMessage}`);
   setRows([]);setFile(null);onImported?.();
  }catch(e){
   if(batchId&&supabase){await supabase.from("statement_import_batches").update({status:"partial_error"}).eq("id",batchId).eq("user_id",userId);}
   setError(e instanceof Error?e.message:"Import failed. Check the statement batch status before retrying.");
  }finally{setBusy(false);setProgress("");}
 }
 return <section className="panel" style={{padding:24,marginBottom:20}}>
  <div className="panel-heading"><div><h2>Import bank statement</h2><p>Upload Excel or PDF. Transactions are saved to the account currently signed in.</p></div></div>
  <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
   <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setRows([]);setError("");setMessage("");}}/>
   <button className="btn btn-primary" type="button" disabled={!file||busy} onClick={preview}>{busy?(progress||"Reading…"):"Read file"}</button>
  </div>
  <p className="module-help">The parser reads only the Date, Particulars, Deposits, Withdrawals and Balance table. Scanned PDFs automatically use English OCR. Account/profile details outside the table are ignored. Review all extracted rows before import.</p>
  {progress&&<p role="status" className="module-help">{progress}</p>}{error&&<p role="alert" className="state-error">{error}</p>}{message&&<p role="status" className="state-success">{message}</p>}
  {!!rows.length&&<><div style={{display:"flex",gap:16,flexWrap:"wrap",margin:"16px 0"}}><strong>{rows.length} rows found</strong><span>{counts.debit} expenses</span><span>{counts.credit} income credits</span><span>{counts.transfers} own-account transfers</span><span>{counts.review} need review</span></div>
   <div style={{margin:"12px 0",padding:14,border:"1px solid var(--border)",borderRadius:8}}><strong>Running-balance reconciliation</strong>{reconciliation.available?<p>{reconciliation.matched?"Balance matched within ₹1 tolerance.":"Balance does not match the transaction movements."} Opening: {money(reconciliation.openingBalance||0)} · Closing: {money(reconciliation.closingBalance||0)} · Calculated closing: {money(reconciliation.calculatedClosingBalance||0)} · Difference: {money(reconciliation.difference||0)}</p>:<p>Not available: {reconciliation.reason}</p>}</div><div className="overflow-x-auto"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Direction</th><th>Balance</th><th>Category</th><th>Check</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>
    <td><input className="field" type="date" value={r.date} onChange={e=>edit(i,{date:e.target.value,confidence:"review"})}/></td>
    <td><input className="field" value={r.description} onChange={e=>edit(i,{description:e.target.value,confidence:"review"})}/></td>
    <td><input className="field" type="number" min="0.01" step="0.01" value={r.amount} onChange={e=>edit(i,{amount:Number(e.target.value),confidence:"review"})}/></td>
    <td><select className="field" value={r.direction} onChange={e=>edit(i,{direction:e.target.value as Tx["direction"]})}><option value="debit">Expense</option><option value="credit">Income</option><option value="transfer_out">Transfer out</option><option value="transfer_in">Transfer in</option></select></td>
    <td>{r.balance===null?"—":money(r.balance)}</td><td><select className="field" value={r.category} onChange={e=>edit(i,{category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></td>
    <td>{r.confidence==="high"?"Auto":"Review"}</td>
   </tr>)}</tbody></table></div>
   <button className="btn btn-primary" style={{marginTop:16}} type="button" disabled={busy||!rows.some(x=>x.amount>0)} onClick={importRows}>{busy?(progress||"Importing…"):"Confirm & import all transactions"}</button>
  </>}
 </section>;
}
