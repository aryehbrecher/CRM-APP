import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const STAGES = {
  active_lead: { label: "Active Leads", icon: "⚡", accent: "#22d3ee" },
  old_lead: { label: "Old Leads", icon: "📁", accent: "#a78bfa" },
  pre_approval: { label: "Pre-Approvals", icon: "📋", accent: "#fbbf24" },
  active_deal: { label: "Active Deals", icon: "🏠", accent: "#34d399" },
  closed_deal: { label: "Closed Deals", icon: "✅", accent: "#6ee7b7" },
};

const DEAL_TYPES = ["Purchase", "Refinance"];

const REMINDER_RULES = {
  active_lead: { days: [1, 4], type: "weekly", label: "Follow up every Mon & Thu" },
  old_lead: { intervalDays: 30, type: "interval", label: "Follow up every 30 days" },
  pre_approval: { intervalDays: 30, type: "interval", label: "Follow up every 30 days" },
  active_deal: { type: "none", label: "No scheduled follow-up" },
  closed_deal: { type: "none", label: "No scheduled follow-up" },
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "◉" },
  { key: "active_lead", label: "Active Leads", icon: "⚡" },
  { key: "old_lead", label: "Old Leads", icon: "📁" },
  { key: "pre_approval", label: "Pre-Approvals", icon: "📋" },
  { key: "active_deal", label: "Active Deals", icon: "🏠" },
  { key: "closed_deal", label: "Closed Deals", icon: "✅" },
];

const STORAGE_KEY = "mortgage_crm_v2";
const uid = () => Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
const dayName = (d) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d];
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
const getToday = () => new Date().toISOString().split("T")[0];
const todayDow = () => new Date().getDay();

function isDueToday(deal) {
  const rule = REMINDER_RULES[deal.stage];
  if (!rule || rule.type === "none") return false;
  if (rule.type === "weekly") return rule.days.includes(todayDow());
  if (rule.type === "interval") {
    const last = deal.lastFollowUp || deal.stageEnteredAt || deal.createdAt;
    return daysBetween(last, getToday()) >= rule.intervalDays;
  }
  return false;
}

function getNextDue(deal) {
  const rule = REMINDER_RULES[deal.stage];
  if (!rule || rule.type === "none") return null;
  if (rule.type === "weekly") {
    const dow = todayDow();
    const diffs = rule.days.map(d => { let x = d - dow; if (x <= 0) x += 7; return x; });
    const nd = new Date(); nd.setDate(nd.getDate() + Math.min(...diffs));
    return nd.toISOString().split("T")[0];
  }
  if (rule.type === "interval") {
    const last = deal.lastFollowUp || deal.stageEnteredAt || deal.createdAt;
    const nd = new Date(last); nd.setDate(nd.getDate() + rule.intervalDays);
    return nd.toISOString().split("T")[0];
  }
  return null;
}

function autoAge(deals) {
  const t = getToday();
  let changed = false;
  const updated = deals.map(d => {
    if (d.stage === "active_lead" && daysBetween(d.stageEnteredAt || d.createdAt, t) >= 30) {
      changed = true;
      return { ...d, stage: "old_lead", stageEnteredAt: t };
    }
    return d;
  });
  return { deals: updated, changed };
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function MortgageCRM() {
  const [deals, setDeals] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [formData, setFormData] = useState({});
  const [editId, setEditId] = useState(null);
  const [detailDeal, setDetailDeal] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [needsInput, setNeedsInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const parsed = JSON.parse(r.value);
          const { deals: aged, changed } = autoAge(parsed);
          setDeals(aged);
          if (changed) save(aged);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (d) => {
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(d)); } catch {}
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const update = (newDeals) => { setDeals(newDeals); save(newDeals); };

  const saveDeal = () => {
    if (!formData.name?.trim()) return flash("Deal name is required");
    const now = new Date().toISOString();
    if (editId) {
      update(deals.map(d => d.id === editId ? { ...d, ...formData } : d));
      flash("Deal updated");
    } else {
      update([...deals, { id: uid(), name: formData.name, type: formData.type || "Purchase", referral: formData.referral || "", stage: formData.stage || "active_lead", createdAt: now, stageEnteredAt: now, lastFollowUp: null, needsList: [], notes: formData.notes || "" }]);
      flash("Deal added");
    }
    setModal(null); setEditId(null); setFormData({});
  };

  const deleteDeal = (id) => { update(deals.filter(d => d.id !== id)); setModal(null); setDetailDeal(null); flash("Deal deleted"); };

  const moveStage = (deal, newStage) => {
    const now = new Date().toISOString();
    const nd = { ...deal, stage: newStage, stageEnteredAt: now };
    update(deals.map(d => d.id === deal.id ? nd : d));
    setDetailDeal(nd);
    flash(`Moved to ${STAGES[newStage].label}`);
  };

  const markFollowedUp = (deal) => {
    update(deals.map(d => d.id === deal.id ? { ...d, lastFollowUp: getToday() } : d));
    flash("Marked as followed up");
  };

  const addNeedsItem = (deal) => {
    if (!needsInput.trim()) return;
    const item = { id: uid(), text: needsInput.trim(), done: false, addedAt: new Date().toISOString() };
    const nd = deals.map(d => d.id === deal.id ? { ...d, needsList: [...(d.needsList||[]), item] } : d);
    update(nd); setNeedsInput(""); setDetailDeal(nd.find(d => d.id === deal.id));
  };

  const toggleNeedsItem = (deal, itemId) => {
    const nd = deals.map(d => d.id !== deal.id ? d : { ...d, needsList: (d.needsList||[]).map(n => n.id === itemId ? { ...n, done: !n.done } : n) });
    update(nd); setDetailDeal(nd.find(d => d.id === deal.id));
  };

  const removeNeedsItem = (deal, itemId) => {
    const nd = deals.map(d => d.id !== deal.id ? d : { ...d, needsList: (d.needsList||[]).filter(n => n.id !== itemId) });
    update(nd); setDetailDeal(nd.find(d => d.id === deal.id));
  };

  const todaysTasks = useMemo(() => deals.filter(isDueToday), [deals]);
  const openNeedsDeals = useMemo(() => deals.filter(d => d.stage === "active_deal" && (d.needsList||[]).some(n => !n.done)), [deals]);
  const stageDeals = (stage) => deals.filter(d => d.stage === stage && (!search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.referral||"").toLowerCase().includes(search.toLowerCase())));
  const stageCounts = useMemo(() => Object.keys(STAGES).reduce((a, s) => { a[s] = deals.filter(d => d.stage === s).length; return a; }, {}), [deals]);

  if (!loaded) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0d1117",color:"#5b6b7a"}}>Loading...</div>;

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#0d1117",fontFamily:"'Sora','DM Sans',system-ui,sans-serif",color:"#c8d1da"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`::placeholder{color:#3d4f5f}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#1a2332;border-radius:3px}input:focus,select:focus,textarea:focus{border-color:#22d3ee!important;outline:none}`}</style>

      {toast && <div style={{position:"fixed",top:20,right:20,background:"#1c6e3d",color:"#d1fae5",padding:"10px 22px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,.4)"}}>{toast}</div>}

      {/* ═══ SIDEBAR ═══ */}
      <aside style={{width:sidebarOpen?230:58,background:"#0a0e14",borderRight:"1px solid rgba(255,255,255,.05)",display:"flex",flexDirection:"column",transition:"width .2s",overflow:"hidden",flexShrink:0}}>
        <div style={{padding:sidebarOpen?"20px 16px 10px":"20px 11px 10px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setSidebarOpen(!sidebarOpen)}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#22d3ee,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>🏦</div>
          {sidebarOpen && <span style={{fontWeight:700,fontSize:15,color:"#f0f4f8",letterSpacing:"-.02em",whiteSpace:"nowrap"}}>Mortgage CRM</span>}
        </div>
        <nav style={{flex:1,padding:"8px 0",display:"flex",flexDirection:"column",gap:1}}>
          {NAV_ITEMS.map(item=>{
            const active=page===item.key;
            const cnt=item.key==="dashboard"?todaysTasks.length:stageCounts[item.key]||0;
            return(
              <div key={item.key} onClick={()=>{setPage(item.key);setSearch("");setModal(null);setDetailDeal(null);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:sidebarOpen?"9px 16px":"9px 17px",cursor:"pointer",background:active?"rgba(255,255,255,.05)":"transparent",borderLeft:active?"3px solid #22d3ee":"3px solid transparent",transition:"all .15s",whiteSpace:"nowrap"}}>
                <span style={{fontSize:14,flexShrink:0,width:22,textAlign:"center"}}>{item.icon}</span>
                {sidebarOpen&&<>
                  <span style={{fontSize:13,fontWeight:active?600:400,color:active?"#f0f4f8":"#5b6b7a",flex:1}}>{item.label}</span>
                  {cnt>0&&<span style={{fontSize:10,fontWeight:700,background:active?"#22d3ee":"rgba(255,255,255,.06)",color:active?"#0a0e14":"#5b6b7a",padding:"1px 7px",borderRadius:8,minWidth:20,textAlign:"center"}}>{cnt}</span>}
                </>}
              </div>
            );
          })}
        </nav>
        {sidebarOpen&&<div style={{padding:"12px 16px 16px",borderTop:"1px solid rgba(255,255,255,.04)"}}>
          <button onClick={()=>{setFormData({stage:page!=="dashboard"?page:"active_lead"});setEditId(null);setModal("add");}}
            style={{width:"100%",padding:10,borderRadius:10,border:"none",background:"linear-gradient(135deg,#22d3ee,#6366f1)",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ New Deal</button>
        </div>}
      </aside>

      {/* ═══ MAIN ═══ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <header style={{padding:"14px 28px",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d1117",flexWrap:"wrap",gap:10}}>
          <div>
            <h1 style={{fontSize:21,fontWeight:700,color:"#f0f4f8",margin:0,letterSpacing:"-.03em"}}>{page==="dashboard"?"Dashboard":STAGES[page]?.label}</h1>
            <p style={{fontSize:12,color:"#4a5568",margin:"2px 0 0"}}>{page==="dashboard"?`${dayName(todayDow())}, ${fmtDate(getToday())} · ${todaysTasks.length} follow-up${todaysTasks.length!==1?"s":""} due`:`${stageCounts[page]||0} deal${(stageCounts[page]||0)!==1?"s":""}`}</p>
          </div>
          {page!=="dashboard"&&<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search deals..." style={{padding:"8px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.02)",color:"#c8d1da",fontSize:13,width:200,fontFamily:"inherit"}}/>}
        </header>

        <main style={{flex:1,overflowY:"auto",padding:"20px 28px 40px"}}>

          {/* ─── DASHBOARD ─── */}
          {page==="dashboard"&&<div style={{display:"flex",flexDirection:"column",gap:22}}>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
              {Object.entries(STAGES).map(([k,s])=>(
                <div key={k} onClick={()=>setPage(k)}
                  style={{padding:"14px 16px",background:"rgba(255,255,255,.02)",borderRadius:12,border:"1px solid rgba(255,255,255,.05)",cursor:"pointer",transition:"border-color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=s.accent} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,.05)"}>
                  <div style={{fontSize:10,color:"#4a5568",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".06em"}}>{s.label}</div>
                  <div style={{fontSize:26,fontWeight:700,color:s.accent}}>{stageCounts[k]||0}</div>
                </div>
              ))}
            </div>

            {/* Today's follow-ups */}
            <Section icon="🔔" title="Today's Follow-Ups" badge={todaysTasks.length} badgeColor={todaysTasks.length>0?"#fbbf24":null}>
              {todaysTasks.length===0?<Empty>No follow-ups due today — you're all caught up!</Empty>:
                todaysTasks.map(deal=>(
                  <div key={deal.id} style={{display:"flex",alignItems:"center",padding:"11px 20px",borderBottom:"1px solid rgba(255,255,255,.03)",gap:12}}>
                    <div style={{flex:1}}>
                      <span style={{fontWeight:600,color:"#f0f4f8",fontSize:14}}>{deal.name}</span>
                      <span style={{color:"#4a5568",fontSize:12,marginLeft:10}}>{STAGES[deal.stage].label}</span>
                    </div>
                    <span style={{fontSize:11,color:"#4a5568"}}>{REMINDER_RULES[deal.stage].label}</span>
                    <button onClick={()=>markFollowedUp(deal)} style={{...btnSm,background:"#1c6e3d",color:"#d1fae5",border:"none"}}>Done</button>
                  </div>
                ))}
            </Section>

            {/* Outstanding borrower needs */}
            <Section icon="📝" title="Outstanding Borrower Needs" badge={openNeedsDeals.length} badgeColor={openNeedsDeals.length>0?"#ef4444":null}>
              {openNeedsDeals.length===0?<Empty>No outstanding items — all clear!</Empty>:
                openNeedsDeals.map(deal=>{
                  const items=(deal.needsList||[]).filter(n=>!n.done);
                  return(
                    <div key={deal.id} style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                      <div style={{fontWeight:600,color:"#f0f4f8",fontSize:14,marginBottom:6,cursor:"pointer"}} onClick={()=>{setDetailDeal(deal);setModal("detail");}}>{deal.name}</div>
                      {items.map(item=>(
                        <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0 3px 14px"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>
                          <span style={{fontSize:13,color:"#8899a6"}}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
            </Section>
          </div>}

          {/* ─── STAGE PAGES ─── */}
          {page!=="dashboard"&&modal!=="detail"&&<>
            <div style={{background:"rgba(255,255,255,.02)",borderRadius:14,border:"1px solid rgba(255,255,255,.05)",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 100px 1fr 110px 50px",padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,.06)",fontSize:10,fontWeight:600,color:"#3d4f5f",textTransform:"uppercase",letterSpacing:".07em"}}>
                <span>Deal Name</span><span>Type</span><span>Referred By</span><span>Created</span><span style={{textAlign:"right"}}>Needs</span>
              </div>
              {stageDeals(page).length===0?<Empty>No deals in {STAGES[page].label}</Empty>:
                stageDeals(page).map(deal=>{
                  const due=isDueToday(deal);
                  const openN=(deal.needsList||[]).filter(n=>!n.done).length;
                  return(
                    <div key={deal.id} onClick={()=>{setDetailDeal(deal);setModal("detail");}}
                      style={{display:"grid",gridTemplateColumns:"1fr 100px 1fr 110px 50px",alignItems:"center",padding:"13px 20px",background:due?"rgba(251,191,36,.05)":"transparent",borderBottom:"1px solid rgba(255,255,255,.03)",cursor:"pointer",transition:"background .12s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"} onMouseLeave={e=>e.currentTarget.style.background=due?"rgba(251,191,36,.05)":"transparent"}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {due&&<span style={{width:6,height:6,borderRadius:"50%",background:"#fbbf24",flexShrink:0}}/>}
                        <span style={{fontWeight:600,color:"#f0f4f8",fontSize:14}}>{deal.name}</span>
                      </div>
                      <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:5,background:deal.type==="Purchase"?"rgba(34,211,238,.1)":"rgba(167,139,250,.1)",color:deal.type==="Purchase"?"#22d3ee":"#a78bfa",textAlign:"center",justifySelf:"start"}}>{deal.type}</span>
                      <span style={{color:"#6b7b8d",fontSize:13}}>{deal.referral||"—"}</span>
                      <span style={{color:"#3d4f5f",fontSize:12}}>{fmtDate(deal.createdAt)}</span>
                      <div style={{textAlign:"right"}}>{openN>0&&<span style={{fontSize:10,fontWeight:700,background:"#ef4444",color:"#fff",padding:"2px 6px",borderRadius:7}}>{openN}</span>}</div>
                    </div>
                  );
                })}
            </div>
            <div style={{marginTop:14,fontSize:12,color:"#3d4f5f",display:"flex",gap:16,flexWrap:"wrap"}}>
              <span>📅 {REMINDER_RULES[page].label}</span>
              {page==="active_lead"&&<span>⏱ Auto-moves to Old Leads after 30 days</span>}
            </div>
          </>}
        </main>
      </div>

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {(modal==="add"||modal==="edit")&&<Overlay close={()=>{setModal(null);setEditId(null);}}>
        <h2 style={{fontSize:18,fontWeight:700,color:"#f0f4f8",margin:"0 0 18px"}}>{modal==="edit"?"Edit Deal":"Add New Deal"}</h2>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <Field label="Deal Name *"><input style={inp} value={formData.name||""} onChange={e=>setFormData({...formData,name:e.target.value})} placeholder="Smith Family Home Purchase"/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Type"><select style={inp} value={formData.type||"Purchase"} onChange={e=>setFormData({...formData,type:e.target.value})}>{DEAL_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
            <Field label="Stage"><select style={inp} value={formData.stage||"active_lead"} onChange={e=>setFormData({...formData,stage:e.target.value})}>{Object.entries(STAGES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>
          </div>
          <Field label="Referred By"><input style={inp} value={formData.referral||""} onChange={e=>setFormData({...formData,referral:e.target.value})} placeholder="Agent name, past client, etc."/></Field>
          <Field label="Notes"><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={formData.notes||""} onChange={e=>setFormData({...formData,notes:e.target.value})} placeholder="Optional notes..."/></Field>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
          <button onClick={()=>{setModal(null);setEditId(null);}} style={btnGhost}>Cancel</button>
          <button onClick={saveDeal} style={btnPrimary}>{modal==="edit"?"Update":"Add Deal"}</button>
        </div>
      </Overlay>}

      {/* ═══ DETAIL MODAL ═══ */}
      {modal==="detail"&&detailDeal&&(()=>{
        const deal=deals.find(d=>d.id===detailDeal.id)||detailDeal;
        const stage=STAGES[deal.stage];
        const openN=(deal.needsList||[]).filter(n=>!n.done);
        const doneN=(deal.needsList||[]).filter(n=>n.done);
        const nextDue=getNextDue(deal);
        return(
          <Overlay close={()=>{setModal(null);setDetailDeal(null);}} wide>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:700,color:"#f0f4f8",margin:0}}>{deal.name}</h2>
                <div style={{display:"flex",gap:7,marginTop:7}}>
                  <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:5,background:deal.type==="Purchase"?"rgba(34,211,238,.1)":"rgba(167,139,250,.1)",color:deal.type==="Purchase"?"#22d3ee":"#a78bfa"}}>{deal.type}</span>
                  <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:5,background:stage.accent+"20",color:stage.accent}}>{stage.label}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setFormData({...deal});setEditId(deal.id);setModal("edit");}} style={{...btnSm,...btnGhost}}>Edit</button>
                <button onClick={()=>deleteDeal(deal.id)} style={{...btnSm,border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.07)",color:"#fca5a5"}}>Delete</button>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13,marginBottom:18}}>
              {[["Referred By",deal.referral],["Created",fmtDate(deal.createdAt)],["In Stage Since",fmtDate(deal.stageEnteredAt)],["Next Follow-Up",nextDue?fmtDate(nextDue):"None"]].map(([l,v])=>(
                <div key={l}><span style={lbl}>{l}</span><div style={{color:l==="Next Follow-Up"&&nextDue?"#fbbf24":"#c8d1da",fontSize:14,marginTop:3}}>{v||"—"}</div></div>
              ))}
            </div>

            {deal.notes&&<div style={{marginBottom:18}}><span style={lbl}>Notes</span><p style={{color:"#6b7b8d",fontSize:13,lineHeight:1.5,marginTop:3}}>{deal.notes}</p></div>}

            <div style={{marginBottom:18,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.04)"}}>
              <span style={lbl}>Move to Stage</span>
              <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap"}}>
                {Object.keys(STAGES).filter(k=>k!==deal.stage).map(k=>(
                  <button key={k} onClick={()=>moveStage(deal,k)}
                    style={{padding:"5px 12px",borderRadius:7,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.02)",color:STAGES[k].accent,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>{STAGES[k].icon} {STAGES[k].label}</button>
                ))}
              </div>
            </div>

            <div style={{paddingTop:14,borderTop:"1px solid rgba(255,255,255,.04)"}}>
              <span style={lbl}>Items Needed from Borrower</span>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <input value={needsInput} onChange={e=>setNeedsInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNeedsItem(deal)} placeholder="e.g. W-2s, bank statements..." style={{...inp,flex:1}}/>
                <button onClick={()=>addNeedsItem(deal)} style={{...btnPrimary,fontSize:12,padding:"8px 14px"}}>Add</button>
              </div>
              <div style={{marginTop:8}}>
                {openN.length===0&&doneN.length===0&&<div style={{color:"#2d3d4d",fontSize:13,padding:"14px 0"}}>No items tracked yet</div>}
                {openN.map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.025)"}}>
                    <div onClick={()=>toggleNeedsItem(deal,item.id)} style={{width:18,height:18,borderRadius:4,border:"2px solid #3d4f5f",cursor:"pointer",flexShrink:0}}/>
                    <span style={{flex:1,fontSize:13,color:"#c8d1da"}}>{item.text}</span>
                    <span style={{fontSize:10,color:"#2d3d4d"}}>{fmtDate(item.addedAt)}</span>
                    <button onClick={()=>removeNeedsItem(deal,item.id)} style={{background:"none",border:"none",color:"#3d4f5f",cursor:"pointer",fontSize:15,padding:0,lineHeight:1}}>×</button>
                  </div>
                ))}
                {doneN.length>0&&<div style={{marginTop:8}}>
                  <span style={{fontSize:10,color:"#2d3d4d",fontWeight:500}}>Completed ({doneN.length})</span>
                  {doneN.map(item=>(
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",opacity:.45}}>
                      <div onClick={()=>toggleNeedsItem(deal,item.id)} style={{width:18,height:18,borderRadius:4,background:"#1c6e3d",border:"2px solid #1c6e3d",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:700}}>✓</div>
                      <span style={{flex:1,fontSize:13,color:"#4a5568",textDecoration:"line-through"}}>{item.text}</span>
                      <button onClick={()=>removeNeedsItem(deal,item.id)} style={{background:"none",border:"none",color:"#2d3d4d",cursor:"pointer",fontSize:15,padding:0,lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>}
              </div>
            </div>

            <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}>
              <button onClick={()=>{setModal(null);setDetailDeal(null);}} style={btnGhost}>Close</button>
            </div>
          </Overlay>
        );
      })()}
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────
function Overlay({children,close,wide}){return(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}} onClick={close}>
    <div style={{background:"#111820",borderRadius:16,padding:26,border:"1px solid rgba(255,255,255,.07)",width:"100%",maxWidth:wide?580:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);}
function Section({icon,title,badge,badgeColor,children}){return(
  <div style={{background:"rgba(255,255,255,.02)",borderRadius:14,border:"1px solid rgba(255,255,255,.05)",overflow:"hidden"}}>
    <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:15}}>{icon}</span>
      <span style={{fontWeight:600,color:"#f0f4f8",fontSize:14}}>{title}</span>
      <span style={{marginLeft:"auto",fontSize:11,background:badgeColor||"rgba(255,255,255,.05)",color:badgeColor?"#0a0e14":"#4a5568",padding:"1px 8px",borderRadius:8,fontWeight:700}}>{badge}</span>
    </div>
    {children}
  </div>
);}
function Field({label,children}){return<div style={{display:"flex",flexDirection:"column",gap:5}}><label style={lbl}>{label}</label>{children}</div>;}
function Empty({children}){return<div style={{padding:40,textAlign:"center",color:"#2d3d4d",fontSize:13}}>{children}</div>;}

// ─── Style Constants ─────────────────────────────────────────────────────────
const lbl={fontSize:10,fontWeight:600,color:"#4a5568",textTransform:"uppercase",letterSpacing:".07em",display:"block"};
const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.02)",color:"#c8d1da",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const btnPrimary={padding:"9px 18px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#22d3ee,#6366f1)",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
const btnGhost={padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.08)",background:"transparent",color:"#6b7b8d",fontSize:13,cursor:"pointer",fontFamily:"inherit"};
const btnSm={padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:500};
