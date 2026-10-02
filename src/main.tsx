import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./style.css';
import{productMain,productPowder,problem}from'./assets';

const API='https://tpdsklfcqenirvcemtkk.supabase.co/functions/v1/public-order-haleinepure';
const EVENT_API='https://tpdsklfcqenirvcemtkk.supabase.co/functions/v1/public-event-haleinepure';
const offers:Record<number,number>={1:5000,2:10000,3:12000};

type FormState={name:string;phone:string;quantity:number;zone:'abidjan'|'interieur';commune:string;city:string;quartier:string};
type Tracking={utm_source?:string;utm_medium?:string;utm_campaign?:string;utm_content?:string;fbclid?:string};
type FunnelEvent='page_view'|'offers_view'|'offer_select'|'checkout_view'|'checkout_start'|'order_success'|'order_error';

function money(v:number){return v.toLocaleString('fr-FR')+' F'}
function makeRequestId(){
  const c=globalThis.crypto;
  if(c?.randomUUID)return c.randomUUID();
  if(c?.getRandomValues){const a=new Uint32Array(4);c.getRandomValues(a);return`hp-${Date.now()}-${Array.from(a).map(x=>x.toString(36)).join('')}`}
  return`hp-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
}
function safeSessionGet(key:string){try{return window.sessionStorage.getItem(key)}catch{return null}}
function safeSessionSet(key:string,value:string){try{window.sessionStorage.setItem(key,value)}catch{}}
function safeSessionRemove(key:string){try{window.sessionStorage.removeItem(key)}catch{}}
function captureTracking():Tracking{
  const params=new URLSearchParams(location.search);const keys=['utm_source','utm_medium','utm_campaign','utm_content','fbclid'] as const;
  const fresh:Tracking={};keys.forEach(k=>{const v=params.get(k);if(v)fresh[k]=v.slice(0,180)});
  if(Object.keys(fresh).length){safeSessionSet('haleinepure_tracking',JSON.stringify(fresh));return fresh}
  try{return JSON.parse(safeSessionGet('haleinepure_tracking')||'{}')}catch{return{}}
}
function getSessionId(){
  let id=safeSessionGet('haleinepure_session_id');
  if(!id){id=makeRequestId();safeSessionSet('haleinepure_session_id',id)}
  return id;
}
function trackFunnel(eventName:FunnelEvent,extra:{quantity?:number;zone?:string;value?:number}={}){
  try{
    void fetch(EVENT_API,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({sessionId:getSessionId(),eventName,quantity:extra.quantity,zone:extra.zone,value:extra.value,tracking:captureTracking()})}).catch(()=>{});
  }catch{}
}

function App(){
  const[f,setF]=useState<FormState>({name:'',phone:'',quantity:1,zone:'abidjan',commune:'',city:'',quartier:''});
  const[busy,setBusy]=useState(false),[order,setOrder]=useState<any>(null),[err,setErr]=useState(''),[formSeen,setFormSeen]=useState(false),[offersSeen,setOffersSeen]=useState(false);
  const submittingRef=useRef(false),requestIdRef=useRef(''),offersTrackedRef=useRef(false),checkoutViewTrackedRef=useRef(false),checkoutStartedRef=useRef(false);
  const set=(k:keyof FormState,v:any)=>setF(prev=>({...prev,[k]:v}));
  const subtotal=offers[f.quantity]||5000,delivery=f.quantity===1?(f.zone==='abidjan'?1000:2000):0,total=subtotal+delivery;

  useEffect(()=>{
    captureTracking();trackFunnel('page_view',{quantity:1,zone:'abidjan'});
    const offersEl=document.getElementById('offres'),formEl=document.getElementById('commande');
    if(!('IntersectionObserver'in window)){
      setOffersSeen(true);setFormSeen(false);return;
    }
    const offersIo=offersEl?new IntersectionObserver(([x])=>{
      if(x.isIntersecting){setOffersSeen(true);if(!offersTrackedRef.current){offersTrackedRef.current=true;trackFunnel('offers_view')}}
    },{threshold:.18}):null;
    const formIo=formEl?new IntersectionObserver(([x])=>{
      setFormSeen(x.isIntersecting);
      if(x.isIntersecting&&!checkoutViewTrackedRef.current){checkoutViewTrackedRef.current=true;trackFunnel('checkout_view')}
    },{threshold:.12}):null;
    if(offersEl)offersIo?.observe(offersEl);if(formEl)formIo?.observe(formEl);
    return()=>{offersIo?.disconnect();formIo?.disconnect()};
  },[]);

  const choose=(q:number)=>{
    set('quantity',q);trackFunnel('offer_select',{quantity:q,zone:f.zone,value:offers[q]||5000});
    requestAnimationFrame(()=>document.getElementById('commande')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  const beginCheckout=()=>{
    if(checkoutStartedRef.current)return;
    checkoutStartedRef.current=true;trackFunnel('checkout_start',{quantity:f.quantity,zone:f.zone,value:total});
  };

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(submittingRef.current)return;
    submittingRef.current=true;setErr('');setBusy(true);
    let rid=safeSessionGet('haleinepure_request_id')||requestIdRef.current;if(!rid){rid=makeRequestId();requestIdRef.current=rid;safeSessionSet('haleinepure_request_id',rid)}
    let timer=0;
    try{
      const request=fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f,clientRequestId:rid,landmark:f.quartier,tracking:captureTracking()})});
      const timeout=new Promise<Response>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('timeout')),25000)});
      const r=await Promise.race([request,timeout]);
      const text=await r.text();let j:any={};try{j=text?JSON.parse(text):{}}catch{}
      if(!r.ok||!j.ok||!j.order)throw new Error('order_not_saved');
      trackFunnel('order_success',{quantity:f.quantity,zone:f.zone,value:Number(j.order.total)||total});
      requestIdRef.current='';safeSessionRemove('haleinepure_request_id');setOrder(j.order);try{window.scrollTo({top:0,behavior:'smooth'})}catch{window.scrollTo(0,0)}
    }catch{
      trackFunnel('order_error',{quantity:f.quantity,zone:f.zone,value:total});
      setErr("La commande n'a pas été enregistrée. Vérifiez votre connexion puis réessayez.");
    }finally{if(timer)window.clearTimeout(timer);submittingRef.current=false;setBusy(false)}
  }

  if(order)return <main className="confirmation"><section className="thanks"><div className="successIcon">✓</div><small>COMMANDE ENREGISTRÉE</small><h1>Merci, {String(order.customer_name||'').split(' ')[0]}.</h1><p>Votre commande est bien enregistrée. Gardez cette référence : <b>{order.order_number}</b>.</p><div className="receipt"><p><span>Produit</span><b>LAO LI SHI · 50 g</b></p><p><span>Quantité</span><b>{order.quantity} pot(s)</b></p><p><span>Destination</span><b>{order.commune||order.city}</b></p><p><span>Total</span><b>{Number(order.total).toLocaleString('fr-FR')} FCFA</b></p><p><span>Paiement</span><b>{order.payment_method}</b></p></div><div className="nextStep"><b>Prochaine étape</b><p>Notre équipe vous contactera pour confirmer votre livraison. Aucun autre formulaire n’est nécessaire.</p></div><a className="homeLink" href="/">Retour à l'accueil</a></section></main>;

  return <>
    <header><a className="brand" href="#top">Haleine<span>Pure</span></a><a className="headerCta" href="#offres">Voir les offres</a></header>
    <main id="top">
      <section className="hero">
        <div className="heroCopy"><span className="tag">HALEINEPURE PRÉSENTE · LAO LI SHI · 50 G</span><h1>Une bouche fraîche.<br/><em>Plus d’assurance.</em></h1><p>Une poudre dentaire simple à intégrer à votre routine quotidienne d’hygiène bucco-dentaire.</p><div className="heroPrice"><span>À partir de</span><strong>5 000 FCFA</strong></div><a className="cta" href="#offres">CHOISIR MON OFFRE</a><div className="trust"><span>✓ Paiement à la livraison à Abidjan</span><span>✓ Livraison disponible en Côte d’Ivoire</span></div></div>
        <figure className="heroProduct"><img src={productMain} alt="Pot de poudre dentaire LAO LI SHI ouvert et fermé"/><figcaption>LE PRODUIT RÉEL · 50 G</figcaption></figure>
      </section>

      <section className="problemSection"><div className="problemVisual"><img src={problem} loading="lazy" alt="Illustration d’une gêne liée au manque de fraîcheur pendant une conversation"/></div><div className="problemCopy"><span className="tag">QUAND LA FRAÎCHEUR COMPTE</span><h2>Vous hésitez à parler de près ?</h2><p>Un geste simple avec votre brosse à dents pour compléter votre routine fraîcheur.</p><a className="textLink" href="#utilisation">Découvrez les 4 gestes</a></div></section>

      <section id="offres" className="offersSection"><span className="tag">CHOISISSEZ VOTRE FORMULE</span><h2>Choisissez votre offre</h2><p className="offersLead">3 pots : 4 000 F par pot, livraison incluse. Votre total est affiché avant validation.</p><div className="offers" role="group" aria-label="Choisissez votre offre">
        {[1,2,3].map(q=><button key={q} className={`offerRow ${q===3?'best ':''}${f.quantity===q?'selected':''}`} aria-pressed={f.quantity===q} onClick={()=>choose(q)}>
          <span className="offerRadio" aria-hidden="true"/>
          <img className="offerProduct" src={productMain} loading="lazy" alt=""/>
          <span className="offerDetails">{q===3&&<span className="offerRecommendation">MEILLEURE VALEUR</span>}<strong>{q} {q===1?'pot':'pots'}</strong><b>{money(offers[q])}</b>{q===3&&<small>4 000 F par pot</small>}</span>
          <span className="offerShipping">{q===1?<><span>Livraison Abidjan <b>1 000 F</b></span><span>Intérieur <b>2 000 F</b></span></>:<b>Livraison incluse</b>}</span>
        </button>)}
      </div></section>

      <section id="commande" className="order"><div className="orderIntro"><span className="tag">COMMANDE RAPIDE</span><h2>Finalisez votre commande</h2><p>Renseignez uniquement les informations utiles à la livraison. Votre total est affiché avant validation.</p><img className="orderProduct" src={productMain} loading="lazy" alt="Produit HaleinePure LAO LI SHI"/><div className="reassure"><span>✓ Abidjan : paiement à la livraison</span><span>✓ Intérieur : paiement avant expédition</span><span>✓ Notre équipe vous contacte pour la livraison</span></div></div><form onSubmit={submit} onFocusCapture={beginCheckout}><label>Nom et prénom<input required minLength={2} autoComplete="name" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Ex. Awa Koné"/></label><label>Téléphone<input required inputMode="tel" autoComplete="tel" value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="07 00 00 00 00"/></label><label>Offre<select value={f.quantity} onChange={e=>set('quantity',Number(e.target.value))}><option value="1">1 pot — 5 000 F</option><option value="2">2 pots — 10 000 F · livraison incluse</option><option value="3">3 pots — 12 000 F · livraison incluse</option></select></label><label>Zone de livraison<select value={f.zone} onChange={e=>setF({...f,zone:e.target.value as 'abidjan'|'interieur',city:'',commune:''})}><option value="abidjan">Abidjan</option><option value="interieur">Intérieur</option></select></label>{f.zone==='abidjan'?<label>Commune<input required value={f.commune} onChange={e=>set('commune',e.target.value)} placeholder="Ex. Cocody"/></label>:<label>Ville<input required value={f.city} onChange={e=>setF({...f,city:e.target.value,commune:e.target.value})} placeholder="Ex. Bouaké"/></label>}<label>Quartier / repère<input required value={f.quartier} onChange={e=>set('quartier',e.target.value)} placeholder="Quartier, carrefour, repère…"/></label><div className="summary"><p><span>Produit</span><b>LAO LI SHI · {f.quantity} pot(s)</b></p><p><span>Produits</span><b>{money(subtotal)}</b></p><p><span>Livraison</span><b>{delivery===0?'INCLUSE':money(delivery)}</b></p><p className="sumTotal"><span>TOTAL</span><b>{total.toLocaleString('fr-FR')} FCFA</b></p></div>{err&&<p className="error" role="alert">{err}</p>}<button className="submit" disabled={busy}>{busy?'ENREGISTREMENT…':`VALIDER MA COMMANDE — ${money(total)}`}</button><small className="paymentNote">Abidjan : aucun paiement en ligne n’est demandé lors de cette validation.</small><small className="formNote">Après validation, gardez la référence de votre commande. Notre équipe vous contacte pour organiser la livraison.</small></form></section>

      <section className="productSection"><div className="sectionHead"><span className="tag">VOYEZ CE QUE VOUS COMMANDEZ</span><h2>HaleinePure présente LAO LI SHI</h2><p>Un format poudre de 50 g à utiliser simplement avec votre brosse à dents.</p></div><div className="productGallery"><figure><img src={productMain} loading="lazy" alt="Vrai pot LAO LI SHI"/><figcaption>Ce que vous recevez · pot 50 g</figcaption></figure><figure><img src={productPowder} loading="lazy" alt="Vue rapprochée de la poudre dentaire dans le pot"/><figcaption>La poudre dans le pot</figcaption></figure></div></section>

      <section id="utilisation" className="usage"><div><span className="tag">MODE D’UTILISATION</span><h2>4 gestes simples</h2><p>Pas besoin de changer toute votre routine : ajoutez simplement la poudre à votre brossage.</p></div><ol><li><b>1</b><span>Humidifiez légèrement votre brosse à dents.</span></li><li><b>2</b><span>Prélevez une petite quantité de poudre.</span></li><li><b>3</b><span>Brossez soigneusement.</span></li><li><b>4</b><span>Rincez votre bouche.</span></li></ol></section>

      <section className="benefitsSection"><div className="sectionHead"><span className="tag">POUR VOTRE ROUTINE</span><h2>Simple, pratique et orienté fraîcheur</h2></div><div className="benefits"><article><b>01</b><h3>Fraîcheur au quotidien</h3><p>Complète votre routine d’hygiène bucco-dentaire avec une sensation de fraîcheur.</p></article><article><b>02</b><h3>Geste simple</h3><p>S’utilise facilement avec votre brosse à dents habituelle.</p></article><article><b>03</b><h3>Plus d’assurance</h3><p>Une routine fraîcheur pensée pour vous aider à vous sentir plus à l’aise dans les échanges rapprochés.</p></article></div></section>

      <section className="proof"><span className="tag">CONFIANCE</span><h2>Une commande claire du début à la fin</h2><div className="proofGrid"><article><b>Produit réellement présenté</b><p>Les photos montrent le véritable pot et sa poudre.</p></article><article><b>Total visible avant validation</b><p>Prix du produit et livraison sont calculés avant votre commande.</p></article><article><b>Paiement adapté à votre zone</b><p>Abidjan à la livraison, intérieur avant expédition.</p></article><article><b>Confirmation réelle</b><p>Notre équipe vous contacte pour organiser votre livraison.</p></article></div></section>



      <section className="delivery"><div className="sectionHead"><span className="tag">LIVRAISON & PAIEMENT</span><h2>Vous savez comment vous payez avant de commander</h2></div><div className="deliveryGrid"><article><span>ABIDJAN</span><h3>Paiement à la livraison</h3><p>1 pot : livraison 1 000 F.</p><p>2 ou 3 pots : livraison incluse.</p></article><article><span>INTÉRIEUR DU PAYS</span><h3>Paiement avant expédition</h3><p>1 pot : livraison 2 000 F.</p><p>2 ou 3 pots : livraison incluse.</p></article></div></section>

      <section className="faq"><span className="tag">QUESTIONS FRÉQUENTES</span><h2>Avant de commander</h2><details><summary>Comment utiliser LAO LI SHI ?</summary><p>Humidifiez légèrement la brosse, prélevez une petite quantité de poudre, brossez soigneusement puis rincez.</p></details><details><summary>Quelle quantité contient le pot ?</summary><p>Chaque pot contient 50 g de poudre dentaire LAO LI SHI.</p></details><details><summary>Puis-je commander 2 ou 3 pots ?</summary><p>Oui. 2 pots coûtent 10 000 F avec livraison incluse. 3 pots coûtent 12 000 F avec livraison incluse, soit 4 000 F par pot.</p></details><details><summary>Comment se passe la livraison ?</summary><p>À Abidjan, le paiement se fait à la livraison. Pour l’intérieur du pays, le paiement est effectué avant expédition.</p></details><details><summary>Quels sont les frais de livraison ?</summary><p>Pour 1 pot : 1 000 F à Abidjan ou 2 000 F à l’intérieur. Pour 2 ou 3 pots, la livraison est incluse.</p></details><details><summary>Que se passe-t-il après ma commande ?</summary><p>Votre commande est enregistrée, une référence s’affiche à l’écran, puis notre équipe vous contacte pour confirmer la livraison.</p></details></section>


    </main>
    {!formSeen&&<a className="floatingCta" href={offersSeen?'#commande':'#offres'}>{offersSeen?'FINALISER MA COMMANDE':'VOIR LES OFFRES · DÈS 5 000 F'}</a>}
    <footer><b>HaleinePure</b><span>LAO LI SHI · Hygiène bucco-dentaire</span><small>DESTOCKAGE RAPIDE · Côte d’Ivoire</small><small>© 2026 DESTOCKAGE RAPIDE</small></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);