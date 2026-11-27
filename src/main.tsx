import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowDown, ArrowRight, ArrowUp, ArrowLeftRight, CalendarDays, ChartNoAxesColumnIncreasing, Database, Dice5, FlaskConical, House, Layers, MapPin, Moon, Plane, PlaneLanding, PlaneTakeoff, Search as SearchIcon, SlidersHorizontal, Ticket} from 'lucide-react';
import s from './app.module.css';

type Page = 'home' | 'explore' | 'research';
type View = 'day' | 'week' | 'month';
type Query = {origin:string; destination:string; cabin:string; searched:string; departure:string};
type Option = {airline:string; flight:string|null; duration:number; fare:number; referenceDate:string};
type Fares = {options:Option[]; days:{date:string;fare:number|null}[]; daysLeft:number};
type Metric = {partition:string; records:number; MAE:number; RMSE:number; R2:number; MAPE_pct:number};
type Config = {today:string; researchDate:string; defaultDeparture:string; horizon:number; cities:string[]; cabins:string[]; features:string[]; metrics:Metric[]};
type Example = {id:number; origin:string; destination:string; cabin:string; departure:string; flight:string; airline:string; duration:number; days:number};
type Reveal = {prediction:number; recorded:number; difference:number};
type Quote = {fare:number; source:string; observedAt:string};
const modelName = 'Stage 3 · L7 Random Forest';
const money = (amount:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(amount);
const shortDate = (value:string) => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value));
function addDays(value:string, days:number){const date=new Date(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function currentPage():Page {const value=location.hash.slice(1);return value==='research'||value==='explore'?value:'home';}
function url(path:string, query:Record<string,string>){return '/api/'+path+'?'+new URLSearchParams(query);}
async function request<T>(path:string, signal?:AbortSignal, method='GET'):Promise<T>{
  const response=await fetch(path,{signal,method});
  if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(typeof error?.detail==='string'?error.detail:'The service is unavailable. Try again.');}
  return response.json();
}
function useResource<T>(path:string|null){
  const [state,setState]=useState<{path:string|null; data?:T; error?:string}>({path:null});
  useEffect(()=>{
    if(!path)return;
    const controller=new AbortController();
    request<T>(path,controller.signal).then(data=>setState({path,data})).catch(error=>{if(!controller.signal.aborted)setState({path,error:error.message});});
    return ()=>controller.abort();
  },[path]);
  return state.path===path?state:{path};
}

function Navigation({page}:{page:Page}){
  return <header className={s.header}><a href="#home" className={s.brand}><Plane size={31} fill="currentColor"/> IARA</a>
    {page==='home'?<a className={s.moon} href="#explore" title="Explore fares"><Moon size={17}/> <span>Explore</span></a>:
      <nav aria-label="Main navigation"><a aria-current={page==='explore'?'page':undefined} href="#explore">Explore Fares</a><a aria-current={page==='research'?'page':undefined} href="#research">Research</a><a className={s.homeLink} href="#home"><House size={17}/> Home</a></nav>}
  </header>;
}

function SearchCard({query,config,change,submit}:{query:Query;config:Config;change:(value:Query)=>void;submit:()=>void}){
  const field=(key:keyof Query,value:string)=>change({...query,[key]:value});
  return <form className={s.searchCard} onSubmit={event=>{event.preventDefault();submit();}}>
    <div className={s.searchFields}>
      <label><PlaneTakeoff/><span>From<select value={query.origin} onChange={e=>field('origin',e.target.value)}>{config.cities.map(city=><option key={city}>{city}</option>)}</select></span></label>
      <button className={s.swap} type="button" aria-label="Swap origin and destination" onClick={()=>change({...query,origin:query.destination,destination:query.origin})}><ArrowLeftRight size={18}/></button>
      <label><PlaneLanding/><span>To<select value={query.destination} onChange={e=>field('destination',e.target.value)}>{config.cities.map(city=><option key={city}>{city}</option>)}</select></span></label>
      <label className={s.dateField}><CalendarDays/><span>Departure date<input type="date" required value={query.departure} min={addDays(query.searched,1)} max={addDays(query.searched,config.horizon)} onChange={e=>field('departure',e.target.value)}/></span></label>
      <label className={s.cabinField}><Ticket/><span>Flight class<select value={query.cabin} onChange={e=>field('cabin',e.target.value)}>{config.cabins.map(cabin=><option key={cabin}>{cabin}</option>)}</select></span></label>
    </div>
    <button className={s.primary} type="submit"><SearchIcon size={20}/>Estimate fares</button>
    <div className={s.searchNote}><span>Search date {shortDate(query.searched)} {query.searched.slice(0,4)} · 1–{config.horizon} days ahead</span>
    <button type="button" onClick={()=>{const historical=query.searched!==config.researchDate;change({...query,searched:historical?config.researchDate:config.today,departure:historical?addDays(config.researchDate,12):config.defaultDeparture});}}>{query.searched===config.researchDate?'Use current dates':'Replay 2023 data'}</button></div>
  </form>;
}

function Status({error,children}:{error?:string;children:string}){return <p className={s.status} role={error?'alert':'status'}>{error||children}</p>;}
function OptionList({options,choose,selected}:{options:Option[];choose?:(index:number)=>void;selected?:number}){
  return <ul className={s.options}>{options.map((option,index)=><li key={option.airline+'|'+option.flight+'|'+option.duration}>
    {choose?<button type="button" aria-pressed={selected===index} onClick={()=>choose(index)}><OptionText option={option}/></button>:<div><OptionText option={option}/></div>}
  </li>)}</ul>;
}
function OptionText({option}:{option:Option}){return <><span><strong>{option.airline}{option.flight?' · '+option.flight:''}</strong><small>{option.duration.toLocaleString('en-IN',{maximumFractionDigits:2})} h · Reference {shortDate(option.referenceDate)}</small></span><b>{money(option.fare)}</b></>;}

function Home({config,query,change,submitted,submit}:{config:Config;query:Query;change:(value:Query)=>void;submitted:Query|null;submit:()=>void}){
  const result=useResource<Fares>(submitted?url('fares',submitted):null);
  const options=result.data?.options??[];
  return <main className={s.dayMain}><div className={s.hero}><div className={s.heroText}><p className={s.eyebrow}><span/> FLIGHT FARE RESEARCH</p><h1>Estimate your fare</h1><p>Compare model estimates for domestic routes across India.</p></div></div>
    <div className={s.dayContent}><SearchCard query={query} config={config} change={change} submit={submit}/>
    {submitted&&<section className={s.homeResults} aria-label="Fare results">
      {result.error||!result.data?<Status error={result.error}>Estimating fares…</Status>:options.length===0?<Status>No reference options for this departure date.</Status>:<>
        <div className={s.fareSummary}>
          <div><span><ArrowDown size={16}/>{options.length===1?'Estimated fare':'Lowest estimate'}</span><strong>{money(options[0].fare)}</strong><small>{options[0].airline}{options[0].flight?' · '+options[0].flight:''}</small></div>
          {options.length>1&&<div><span><ArrowUp size={16}/>Highest estimate</span><strong>{money(options.at(-1)!.fare)}</strong><small>{options.at(-1)!.airline}{options.at(-1)!.flight?' · '+options.at(-1)!.flight:''}</small></div>}
        </div>
        <div className={s.lightPanel}><div className={s.panelHeading}><h2>{submitted.origin} <ArrowRight size={18}/> {submitted.destination}</h2><a href="#explore">Explore fares</a></div><p>{shortDate(submitted.departure)} · {submitted.cabin} · Historical reference options with no booking availability</p>{options.length>1&&<details><summary>View all {options.length} options</summary><OptionList options={options}/></details>}</div>
      </>}
    </section>}
    <footer className={s.footer}>{modelName}<a href="#research">Research and evaluation</a></footer></div>
  </main>;
}

function Research({config}:{config:Config}){
  const [partition,setPartition]=useState('interpolation');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('');
  const [random,setRandom]=useState<Example|null>(null);
  const [randomLoading,setRandomLoading]=useState(false);
  const [picked,setPicked]=useState<number>();
  const [revealed,setRevealed]=useState<Reveal>();
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const list=useResource<Example[]>(url('examples',{partition,query:filter}));
  const example=random??list.data?.find(item=>item.id===picked)??list.data?.[0];
  const metric=config.metrics.find(item=>item.partition===partition);
  const clear=()=>{setError('');setRevealed(undefined);};
  async function chooseRandom(){
    clear();setRandomLoading(true);
    try{const rows=await request<Example[]>(url('examples',{partition,random:'true'}));setRandom(rows[0]??null);}
    catch(e){setError((e as Error).message);}finally{setRandomLoading(false);}
  }
  async function reveal(){
    if(!example)return;
    clear();setPending(true);
    try{setRevealed(await request<Reveal>(url('examples/'+example.id+'/reveal',{partition}),undefined,'POST'));}
    catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  return <main className={s.nightMain}>
    <div className={s.title}><div className={s.titleIcon}><FlaskConical size={33}/></div><div><h1>Test the model</h1><p>Held-out dataset · {modelName}</p></div></div>
    <section className={s.panel}><h2>Flight details</h2>
      <fieldset className={s.exampleControls} disabled={pending||randomLoading}>
        <label>Evaluation partition<select value={partition} onChange={e=>{setPartition(e.target.value);setPicked(undefined);setRandom(null);clear();}}><option value="interpolation">Interpolation · 1–40 days</option><option value="extrapolation">Extrapolation · 41–50 days</option></select></label>
        <form className={s.filter} onSubmit={e=>{e.preventDefault();setFilter(query);setPicked(undefined);setRandom(null);clear();}}><label>Find an example<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Row ID, city or flight code"/></label><button type="submit" aria-label="Find examples"><SearchIcon size={19}/></button></form>
        <label>Held-out example<select value={random?'random':example?.id??''} onChange={e=>{setRandom(null);setPicked(Number(e.target.value));clear();}}>{random&&<option value="random">Random · #{random.id} · {random.flight}</option>}{!list.data?.length&&<option value="">{list.data?'No matching examples':'Loading examples…'}</option>}{list.data?.map(item=><option key={item.id} value={item.id}>#{item.id} · {item.flight} · {item.origin} to {item.destination}</option>)}</select></label>
        <button type="button" onClick={chooseRandom}><Dice5 size={18}/>{randomLoading?'Choosing…':'Random example'}</button>
      </fieldset>
      {example&&<div className={s.exampleInfo}><strong><Plane size={18}/> {example.origin} <ArrowRight size={16}/> {example.destination}</strong><span>{example.airline} · {example.flight} · {example.cabin}</span><small>{shortDate(example.departure)} {example.departure.slice(0,4)} · {example.days} {example.days===1?"day":"days"} ahead · {example.duration} h</small></div>}
      <button type="button" className={s.primary} disabled={!example||pending||randomLoading} onClick={reveal}>{pending?'Predicting…':'Predict and reveal'}</button>
      {(list.error||error)&&<Status error={error||list.error}>Unable to load examples.</Status>}
    </section>
    {revealed&&<section className={s.panel} aria-live="polite"><div className={s.resultRow}><span><Layers size={21}/> Predicted fare</span><strong className={s.accent}>{money(revealed.prediction)}</strong></div><div className={s.resultRow}><span><Ticket size={21}/> Recorded dataset fare</span><strong>{money(revealed.recorded)}</strong></div><p className={s.difference}>{revealed.difference===0?'Estimate matched the recorded fare':money(Math.abs(revealed.difference))+(revealed.difference>0?' above':' below')+' the recorded fare'}</p><small>{modelName} · Held-out {partition} · Example #{example?.id}</small></section>}
    {metric&&<section className={s.metricPanel}><div><small>Full {partition} MAE</small><strong>{money(metric.MAE)}</strong></div><div><small>Held-out examples</small><strong>{metric.records.toLocaleString('en-IN')}</strong></div></section>}
    <div className={s.researchDetails}>
      <details><summary><Database size={21}/> Dataset coverage</summary><p>The original India dataset was observed on 15 January 2023. The reconstructed Stage 3 dataset contains 445,366 records. The app catalog uses in-range validation, calibration, and interpolation records across {config.cities.length} cities and {config.cabins.length} cabins.</p></details>
      <details><summary><SlidersHorizontal size={21}/> Model inputs</summary><p>{config.features.join(', ')}. The saved pipeline one-hot encodes categories with unknown-category handling and passes numeric features through. The Random Forest outputs fares directly in INR.</p></details>
      <details><summary><ChartNoAxesColumnIncreasing size={21}/> Evaluation results</summary><div className={s.metricTable}><table><thead><tr><th>Held-out set</th><th>Rows</th><th>MAE</th><th>RMSE</th><th>R²</th><th>MAPE</th></tr></thead><tbody>{config.metrics.map(item=><tr key={item.partition}><th>{item.partition}</th><td>{item.records.toLocaleString('en-IN')}</td><td>{money(item.MAE)}</td><td>{money(item.RMSE)}</td><td>{item.R2.toFixed(3)}</td><td>{item.MAPE_pct.toFixed(2)}%</td></tr>)}</tbody></table></div></details>
      <details id="findings"><summary><FlaskConical size={21}/> Findings</summary><p>In the same Stage 3 run, adding duration and airline to the five search-level features reduced interpolation MAE from {money(5435.991698275155)} to {money(3786.9305272879296)}. The group-disjoint evaluation is retrospective and based on one observation date. Differences between dates in Explore are model estimates using the same search date, route and cabin.</p></details>
    </div>
  </main>;
}
const airports:Record<string,[string,number,number]>={Ahmedabad:['AMD',126,149],Bangalore:['BLR',173,253],Chennai:['MAA',202,252],Delhi:['DEL',161,102],Hyderabad:['HYD',183,213],Kolkata:['CCU',275,153],Mumbai:['BOM',130,190]};
function RouteMap({query}:{query:Query}){
  const [active,setActive]=useState<'origin'|'destination'|null>(null);
  const from=airports[query.origin],to=airports[query.destination];
  return <div className={s.map}><svg viewBox="0 0 390 310" aria-label="Map of the selected route across India" role="group">
      <defs><pattern id="map-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#82bdff" strokeWidth=".4" opacity=".3"/></pattern><linearGradient id="land" x2="0" y2="1"><stop stopColor="#194b79"/><stop offset="1" stopColor="#102644"/></linearGradient></defs>
      <rect width="390" height="310" fill="url(#map-grid)"/>
      <path className={s.land} d="M146 21 156 30 171 25 185 39 178 50 195 62 187 74 205 85 218 81 229 96 251 101 254 117 271 125 291 125 306 116 310 101 332 95 344 79 362 77 375 88 365 101 347 108 348 122 329 128 323 151 313 145 309 131 295 135 284 128 281 152 271 166 252 167 245 180 228 187 222 203 205 215 201 238 194 251 191 275 178 291 167 283 157 266 154 251 142 239 138 216 130 204 127 182 116 163 101 165 90 157 91 149 76 141 88 132 111 132 110 117 122 104 128 87 147 75 149 59 137 45 138 32Z"/>
      <path className={s.boundaries} d="M149 59 165 64 186 74 M147 75 163 90 205 85 M111 132 143 123 160 101 177 112 195 112 218 98 M126 149 160 145 165 128 177 112 M130 182 170 178 184 155 160 145 M143 214 174 209 203 218 M154 251 173 245 199 246 M173 245 174 209 170 178 M203 218 201 189 221 178 228 187 M221 178 212 156 226 142 271 150 M212 156 184 155 190 136 195 112 M250 102 240 125 226 142 M291 125 313 121 332 110 348 122"/>
      {from&&to&&<path className={s.arc} d={'M '+from[1]+' '+from[2]+' Q '+((from[1]+to[1])/2-30)+' '+((from[2]+to[2])/2-23)+' '+to[1]+' '+to[2]}/>}
      {(['origin','destination'] as const).map(key=>{const point=airports[query[key]];if(!point)return null;const [,x,y]=point;return <g key={key} role="button" tabIndex={0} aria-label={query[key]+' airport'} onClick={()=>setActive(key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActive(key);}}} className={s.marker}>
        <circle cx={x} cy={y} r="12" className={s.halo}/><circle cx={x} cy={y} r="4.5"/><rect x={x+8} y={y-11} width={query[key].length*7+13} height="21" rx="5"/><text x={x+14} y={y+4}>{query[key]}</text></g>;})}
    </svg>{active&&<button className={s.mapNote} onClick={()=>setActive(null)}><MapPin size={15}/>{active==='origin'?'Origin':'Destination'} · {query[active]} ({airports[query[active]][0]}) <span aria-hidden="true">×</span></button>}</div>;
}

function Explore({query,change}:{query:Query;change:(query:Query)=>void}){
  const [view,setView]=useState<View>('day');
  const [mode,setMode]=useState<'route'|'flight'>('route');
  const [selection,setSelection]=useState<{date:string;index:number}>();
  const result=useResource<Fares>(url('fares',{...query,view}));
  const options=result.data?.options??[];
  const index=mode==='flight'&&selection?.date===query.departure?selection.index:0;
  const option=options[index];
  const quote=useResource<Quote|null>(option?url('observation',{...query,option:String(index)}):null);
  const flightLink='https://www.google.com/travel/flights?'+new URLSearchParams({q:'Flights from '+query.origin+' to '+query.destination+' on '+query.departure+' '+query.cabin,curr:'INR'});
  const max=Math.max(1,...(result.data?.days.map(day=>day.fare??0)??[]));
  return <main className={s.nightMain}>
    <div className={s.title}><div className={s.titleIcon}><MapPin size={30}/></div><div><h1>Explore fares</h1><p>{query.origin} <ArrowRight size={15}/> {query.destination} · {query.cabin}</p></div></div>
    <div className={s.exploreGrid}>
      <section className={s.panel}><div className={s.segment} aria-label="Exploration mode"><button aria-pressed={mode==='route'} onClick={()=>setMode('route')}><Plane size={16}/>Route</button><button aria-pressed={mode==='flight'} onClick={()=>setMode('flight')}><Ticket size={16}/>{options.length>0&&options.every(item=>!item.flight)?'Airline':'Flight'}</button></div>
        <RouteMap query={query}/>
        <p className={s.muted}>Historical reference options · Search date {shortDate(query.searched)} {query.searched.slice(0,4)}</p>
      </section>
      <div className={s.exploreStack}>
        <section className={s.panel}><div className={s.panelHeading}><h2>Price comparison</h2><small>{shortDate(query.departure)}</small></div>
          {result.error||!result.data?<Status error={result.error}>Loading fare estimates…</Status>:!option?<Status>No reference options for this departure date.</Status>:<>
            <div className={s.compare}><div><span><Layers size={18}/> IARA estimate</span><strong>{money(option.fare)}</strong><small>{mode==='route'?'Lowest for this route':option.airline+(option.flight?' · '+option.flight:'')}</small></div><div><span><span className={s.google}>G</span> Google Flights</span><strong aria-label="Observed Google Flights fare">{quote.data?money(quote.data.fare):''}</strong>{quote.data?<small>{quote.data.source} · {new Date(quote.data.observedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>:<a href={flightLink} target="_blank" rel="noreferrer">Check on Google Flights</a>}</div></div>
            {quote.data&&<p>Estimate minus observed fare <strong>{money(option.fare-quote.data.fare)}</strong></p>}
          </>}
        </section>
        <section className={s.panel}>
          <div className={s.segment} aria-label="Calendar view">{(['day','week','month'] as const).map(item=><button key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
          <div className={s.panelHeading}><h2>{view==='day'?'Departure date fares':'Lowest fare by departure date'}</h2>{result.data&&<small>{result.data.daysLeft} {result.data.daysLeft===1?"day":"days"} ahead</small>}</div>
          {view!=='day'&&result.data&&<div className={s.calendar} aria-label="Departure dates">{result.data.days.map(day=><button key={day.date} aria-pressed={day.date===query.departure} onClick={()=>{change({...query,departure:day.date});setSelection(undefined);}}><span>{day.fare===null?'—':money(day.fare)}</span><i style={{height:(day.fare===null?4:Math.max(9,day.fare/max*54))+'px'}}/><small>{shortDate(day.date)}</small></button>)}</div>}
          {options.length>0&&<details key={query.departure+mode+view} open><summary>{options.length} reference options for {shortDate(query.departure)}</summary><OptionList options={options} choose={mode==='flight'?(position)=>setSelection({date:query.departure,index:position}):undefined} selected={index}/></details>}
          {view!=='day'&&!result.data&&!result.error&&<Status>Loading departure dates…</Status>}
        </section>
      </div>
    </div>
    <footer className={s.footer}><a href="#research">Research findings and model evaluation</a><a href="#home">Edit your search</a></footer>
  </main>;
}

function App(){
  const config=useResource<Config>('/api/config');
  const [page,setPage]=useState(currentPage);
  const [draft,setDraft]=useState<Query|null>(null);
  const [submitted,setSubmitted]=useState<Query|null>(null);
  useEffect(()=>{const listener=()=>{setPage(currentPage());window.scrollTo(0,0);};window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  const initial:Query|null=config.data?{origin:'Delhi',destination:'Mumbai',cabin:'Economy',searched:config.data.today,departure:config.data.defaultDeparture}:null;
  const query=draft??initial;
  const search=submitted??query;
  return <div className={page==='home'?s.day:s.night}><Navigation page={page}/>
    {!config.data||!query||!search?<main className={s.nightMain}><Status error={config.error}>Loading research data…</Status></main>:
      page==='home'?<Home config={config.data} query={query} change={value=>{setDraft(value);setSubmitted(null);}} submitted={submitted} submit={()=>setSubmitted(query)}/>:
      page==='research'?<Research config={config.data}/>:<Explore query={search} change={value=>{setDraft(value);setSubmitted(value);}}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
