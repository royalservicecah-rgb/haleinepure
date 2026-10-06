import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./style.css';
import{productMain,productPowder,problemTeeth,problemDeposits,productHand,productBox,smileMan,smileWoman,productPowderCloseup}from'./assets';

const API='https://tpdsklfcqenirvcemtkk.supabase.co/functions/v1/public-order-haleinepure';
const EVENT_API='https://tpdsklfcqenirvcemtkk.supabase.co/functions/v1/public-event-haleinepure';
const offers:Record<number,number>={1:5000,2:10000,3:12000};

type FormState={name:string;phone:string;quantity:number;zone:'abidjan'|'interieur';commune:string;city:string;quartier:string};
type Tracking={utm_source?:string;utm_medium?:string;utm_campaign?:string;utm_content?:string;fbclid?:string};
type FunnelEvent='page_view'|'offers_view'|'offer_select'|'checkout_view'|'checkout_start'|'order_success'|'order_error';
type GalleryItem={src:string;label:string;alt:string};

const gallery:GalleryItem[]=[
  {src:productHand,label:'Le vrai produit',alt:'Pot LAO LI SHI tenu dans la main'},
  {src:productBox,label:'Packaging',alt:'Boîte et pot LAO LI SHI'},
  {src:productPowderCloseup,label:'La poudre en détail',alt:'Gros plan de la poudre dans le pot ouvert'},
  {src:productPowder,label:'Pot ouvert',alt:'Pot LAO LI SHI ouvert avec sa poudre'},
  {src:productMain,label:'Format 50 g',alt:'Présentation réelle du produit LAO LI SHI'}
];

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

function orderAge(seconds:number){
  if(seconds<60)return 'Il y a moins d’une minute';
  if(seconds<3600){const n=Math.floor(seconds/60);return `Il y a ${n} minute${n>1?'s':''}`}
  if(seconds<86400){const n=Math.floor(seconds/3600);return `Il y a ${n} heure${n>1?'s':''}`}
  const n=Math.floor(seconds/86400);return `Il y a ${n} jour${n>1?'s':''}`;
}

function App(){
  const[deliveredCount,setDeliveredCount]=useState(0),[proofVisible,setProofVisible]=useState(false);
  const[recentOrders,setRecentOrders]=useState<{ageSeconds:number;receivedAt:number}[]>([]),[proofIndex,setProofIndex]=useState(0);
  const[proofDismissed,setProofDismissed]=useState(()=>safeSessionGet('haleinepure_proof_closed')==='1');
  useEffect(()=>{
    let stopped=false;
    const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),8000);
    void fetch(API,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{
      if(stopped||!data)return;
      if(Number.isInteger(data.deliveredCount)&&data.deliveredCount>0)setDeliveredCount(data.deliveredCount);
      if(Array.isArray(data.recentOrders))setRecentOrders(data.recentOrders.filter((x:any)=>Number.isFinite(x.ageSeconds)&&x.ageSeconds>=0&&x.ageSeconds<604800).slice(0,3).map((x:any)=>({ageSeconds:x.ageSeconds,receivedAt:Date.now()})));
    }).catch(()=>{}).finally(()=>window.clearTimeout(timeout));

    return()=>{stopped=true;controller.abort();window.clearTimeout(timeout)};
  },[]);
  useEffect(()=>{
    if(!recentOrders.length||proofDismissed)return;
    const timers:number[]=[];
    recentOrders.forEach((_,i)=>{
      timers.push(window.setTimeout(()=>{setProofIndex(i);setProofVisible(true)},12000+i*45000));
      timers.push(window.setTimeout(()=>setProofVisible(false),20000+i*45000));
    });
    return()=>timers.forEach(window.clearTimeout);
  },[recentOrders,proofDismissed]);
  const[f,setF]=useState<FormState>({name:'',phone:'',quantity:1,zone:'abidjan',commune:'',city:'',quartier:''});
  const[busy,setBusy]=useState(false),[order,setOrder]=useState<any>(null),[err,setErr]=useState(''),[formSeen,setFormSeen]=useState(false),[offersSeen,setOffersSeen]=useState(false),[galleryIndex,setGalleryIndex]=useState(0);
  const submittingRef=useRef(false),requestIdRef=useRef(''),offersTrackedRef=useRef(false),checkoutViewTrackedRef=useRef(false),checkoutStartedRef=useRef(false);
  const set=(k:keyof FormState,v:any)=>setF(prev=>({...prev,[k]:v}));
  const subtotal=offers[f.quantity]||5000,delivery=f.quantity===1?(f.zone==='abidjan'?1000:2000):0,total=subtotal+delivery;

  useEffect(()=>{
    captureTracking();trackFunnel('page_view',{quantity:1,zone:'abidjan'});
    const offersEl=document.getElementById('offres'),formEl=document.getElementById('commande');
    if(!('IntersectionObserver'in window)){setOffersSeen(true);setFormSeen(false);return}
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

  const selectedGallery=gallery[galleryIndex];

  return <>
    <header><a className="brand" href="#top">Haleine<span>Pure</span></a><a className="headerCta" href="#offres">Voir les offres</a></header>
    <aside className="floatingOffer" aria-label="Offre promotionnelle en cours"><div><span>OFFRE PROMOTIONNELLE EN COURS</span><strong>3 pots · 12 000 F</strong><small>Livraison incluse · 4 000 F par pot</small></div><a href="#offres">VOIR L’OFFRE <span aria-hidden="true">↓</span></a></aside>
    <main id="top">
      <section className="hero">
        <div className="heroCopy">
          <span className="tag">HALEINEPURE PRÉSENTE · LAO LI SHI · 50 G</span>
          <h1>Une bouche fraîche.<br/><em>Plus d’assurance.</em></h1>
          <p>Une poudre dentaire simple à intégrer à votre routine quotidienne d’hygiène bucco-dentaire.</p>
          <div className="heroPrice"><span>À partir de</span><strong>5 000 FCFA</strong></div>
          <a className="cta" href="#offres">CHOISIR MON OFFRE</a>
          <div className="trust"><span>✓ Paiement à la livraison à Abidjan</span><span>✓ Livraison disponible en Côte d’Ivoire</span></div>
        </div>
        <figure className="heroProduct"><img src={productHand} width={675} height={1200} fetchPriority="high" alt="Vrai pot LAO LI SHI tenu dans une main"/><figcaption>LE VRAI PRODUIT · 50 G</figcaption></figure>
      </section>

      <section className="problemStrong" id="probleme">
        <div className="problemImageWrap"><span className="dangerBadge">TACHES ET DÉPÔTS</span><img src={problemTeeth} width={960} height={540} loading="lazy" alt="Illustration de dépôts visibles et de coloration sur des dents"/><small className="illustrationNote">Illustration du problème, sans résultat attribué au produit.</small></div>
        <div className="problemStrongCopy"><span className="tag tagRed">QUAND LA FRAÎCHEUR COMPTE</span><h2>Taches visibles. Bouche moins fraîche. Moins d’assurance.</h2><p>Le sourire et la fraîcheur de la bouche comptent dans vos échanges au quotidien.</p><strong>Découvrez un geste simple à intégrer à votre routine d’hygiène.</strong><a className="cta secondaryCta" href="#solution">DÉCOUVRIR LA ROUTINE</a></div>
      </section>

      <section className="smileSection" id="sourire"><div className="sectionHead"><span className="tag">LE SOURIRE QUE L’ON SOUHAITE</span><h2>Un sourire lumineux. L’envie de sourire avec assurance.</h2><p>Une image du sourire auquel on aspire, pour accompagner la présentation de votre routine.</p></div><div className="smileGrid"><figure><img src={smileMan} width={800} height={1200} loading="lazy" alt="Sourire masculin illustrant un sourire souhaité, sans résultat attribué au produit"/><figcaption>L’assurance d’un sourire</figcaption></figure><figure><img src={smileWoman} width={960} height={640} loading="lazy" alt="Sourire féminin illustrant un sourire souhaité, sans résultat attribué au produit"/><figcaption>L’envie de sourire librement</figcaption></figure></div><p className="smileNote">Visuels d’illustration : ces personnes ne sont pas présentées comme des utilisateurs du produit. Ils ne constituent pas une preuve de résultat ni une garantie de blanchiment.</p><a className="cta" href="#solution">DÉCOUVRIR LA ROUTINE LAO LI SHI</a></section>

      <section className="identify"><div className="sectionHead"><span className="tag">EST-CE QUE CELA VOUS ARRIVE ?</span><h2>Vous vous reconnaissez ?</h2></div><div className="identifyGrid"><article><span>01</span><p>Vous évitez de sourire de trop près ?</p></article><article><span>02</span><p>Vous regardez souvent vos dents dans le miroir ?</p></article><article><span>03</span><p>Vous aimeriez une sensation de bouche plus propre et plus fraîche ?</p></article></div></section>

      <section className="solutionIntro" id="solution"><div className="solutionImage"><img src={productHand} loading="lazy" alt="Pot LAO LI SHI tenu dans la main"/></div><div className="solutionCopy"><span className="tag">UNE ROUTINE PLUS SIMPLE</span><h2>Découvrez LAO LI SHI.</h2><p>Une poudre d’hygiène bucco-dentaire à intégrer simplement au brossage quotidien.</p><div className="miniFacts"><span>Pot 50 g</span><span>Utilisation simple</span><span>Avec votre brosse à dents</span></div><a className="cta" href="#galerie">DÉCOUVRIR LE PRODUIT</a></div></section>

      <section className="gallerySection" id="galerie"><div className="sectionHead"><span className="tag">VOYEZ CE QUE VOUS COMMANDEZ</span><h2>Le produit sous tous les angles</h2><p>Photos réelles du pot, de son packaging et de sa poudre.</p></div><div className="galleryShell"><figure className="galleryMain"><img key={selectedGallery.src} src={selectedGallery.src} loading="lazy" alt={selectedGallery.alt}/><figcaption>{selectedGallery.label}</figcaption></figure><div className="galleryThumbs" role="list" aria-label="Galerie produit">{gallery.map((item,i)=><button key={item.src} type="button" className={i===galleryIndex?'active':''} onClick={()=>setGalleryIndex(i)} aria-label={`Afficher : ${item.label}`} aria-pressed={i===galleryIndex}><img src={item.src} loading="lazy" alt=""/><span>{item.label}</span></button>)}</div></div><a className="cta galleryCta" href="#offres">VOIR LES OFFRES</a></section>

      <section id="utilisation" className="usage"><div><span className="tag">MODE D’UTILISATION</span><h2>4 gestes simples</h2><p>Pas besoin de changer toute votre routine : ajoutez simplement la poudre à votre brossage.</p></div><ol><li><b>1</b><span>Humidifiez légèrement votre brosse à dents.</span></li><li><b>2</b><span>Prélevez une petite quantité de poudre.</span></li><li><b>3</b><span>Brossez soigneusement.</span></li><li><b>4</b><span>Rincez votre bouche.</span></li></ol></section>

      <section className="benefitsSection"><div className="sectionHead"><span className="tag">POUR VOTRE ROUTINE</span><h2>Une routine simple pour prendre soin de votre sourire</h2><p>Une petite quantité de poudre suffit pour compléter votre brossage quotidien.</p></div><div className="benefits"><article><b>01</b><h3>Nettoyage quotidien</h3><p>Complète votre routine d’hygiène bucco-dentaire.</p></article><article><b>02</b><h3>Fraîcheur</h3><p>Un geste simple orienté vers une sensation de bouche plus fraîche.</p></article><article><b>03</b><h3>Routine simple</h3><p>S’utilise avec votre brosse à dents habituelle.</p></article></div></section>

      <section className="problemSolution"><article className="psProblem"><div className="psIcon bad">×</div><img src={problemDeposits} width={960} height={540} loading="lazy" alt="Illustration de dépôts dentaires, sans résultat attribué au produit"/><div><span>À ÉVITER</span><h3>Dépôts visibles et sourire moins net</h3><p>Une bouche qui paraît moins propre peut rapidement devenir une source de gêne.</p></div></article><article className="psSolution"><div className="psIcon good">✓</div><img src={productMain} loading="lazy" alt="Pot LAO LI SHI en gros plan"/><div><span>VOTRE ROUTINE</span><h3>Ajoutez un geste d’hygiène simple à votre brossage</h3><p>LAO LI SHI s’intègre à votre routine quotidienne sans la compliquer.</p></div></article></section>

      <section className="proof"><span className="tag">CONFIANCE</span><h2>Une commande claire du début à la fin</h2>{deliveredCount>0&&<div className="realProof"><span aria-hidden="true">✓</span><div><b>{deliveredCount} commandes livrées</b><p>Commandes réelles de ce produit, enregistrées dans notre suivi de livraison.</p></div></div>}<div className="proofGrid"><article><b>Produit réellement présenté</b><p>Les photos montrent le véritable pot, son packaging et sa poudre.</p></article><article><b>Total visible avant validation</b><p>Prix du produit et livraison sont calculés avant votre commande.</p></article><article><b>Paiement adapté à votre zone</b><p>Abidjan à la livraison, intérieur avant expédition.</p></article><article><b>Confirmation réelle</b><p>Notre équipe vous contacte pour organiser votre livraison.</p></article></div></section>

      <section className="delivery"><div className="sectionHead"><span className="tag">LIVRAISON & PAIEMENT</span><h2>Vous savez comment vous payez avant de commander</h2></div><div className="deliveryGrid"><article><span>ABIDJAN</span><h3>Paiement à la livraison</h3><p>1 pot : livraison 1 000 F.</p><p>2 ou 3 pots : livraison incluse.</p></article><article><span>INTÉRIEUR DU PAYS</span><h3>Paiement avant expédition</h3><p>1 pot : livraison 2 000 F.</p><p>2 ou 3 pots : livraison incluse.</p></article></div></section>

      <section id="offres" className="offersSection"><span className="tag">CHOISISSEZ VOTRE FORMULE</span><h2>Choisissez votre offre</h2><p className="offersLead">3 pots : 4 000 F par pot, livraison incluse. Votre total est affiché avant validation.</p><div className="offers" role="group" aria-label="Choisissez votre offre">{[1,2,3].map(q=><button key={q} className={`offerRow ${q===3?'best ':''}${f.quantity===q?'selected':''}`} aria-pressed={f.quantity===q} onClick={()=>choose(q)}><span className="offerRadio" aria-hidden="true"/><img className="offerProduct" src={productMain} loading="lazy" alt=""/><span className="offerDetails">{q===3&&<span className="offerRecommendation">MEILLEURE VALEUR</span>}<strong>{q} {q===1?'pot':'pots'}</strong><b>{money(offers[q])}</b>{q===3&&<small>4 000 F / pot · 3 000 F économisés</small>}</span><span className="offerShipping">{q===1?<><span>Abidjan <b>+1 000 F</b></span><span>Intérieur <b>+2 000 F</b></span></>:<b>Livraison incluse</b>}</span></button>)}</div><a className="cta offersBottomCta" href="#commande">COMMANDER MAINTENANT</a></section>

      <section className="faq"><span className="tag">QUESTIONS FRÉQUENTES</span><h2>Avant de commander</h2><details><summary>Comment utiliser LAO LI SHI ?</summary><p>Humidifiez légèrement la brosse, prélevez une petite quantité de poudre, brossez soigneusement puis rincez.</p></details><details><summary>Quelle quantité contient le pot ?</summary><p>Chaque pot contient 50 g de poudre dentaire LAO LI SHI.</p></details><details><summary>Puis-je commander 2 ou 3 pots ?</summary><p>Oui. 2 pots coûtent 10 000 F avec livraison incluse. 3 pots coûtent 12 000 F avec livraison incluse, soit 4 000 F par pot.</p></details><details><summary>Comment se passe la livraison ?</summary><p>À Abidjan, le paiement se fait à la livraison. Pour l’intérieur du pays, le paiement est effectué avant expédition.</p></details><details><summary>Quels sont les frais de livraison ?</summary><p>Pour 1 pot : 1 000 F à Abidjan ou 2 000 F à l’intérieur. Pour 2 ou 3 pots, la livraison est incluse.</p></details><details><summary>Que se passe-t-il après ma commande ?</summary><p>Votre commande est enregistrée, une référence s’affiche à l’écran, puis notre équipe vous contacte pour confirmer la livraison.</p></details></section>

      <section id="commande" className="order"><div className="orderIntro"><span className="tag">COMMANDE RAPIDE</span><h2>Finalisez votre commande</h2><p>Renseignez uniquement les informations utiles à la livraison. Votre total est affiché avant validation.</p><img className="orderProduct" src={productMain} loading="lazy" alt="Produit HaleinePure LAO LI SHI"/><div className="reassure"><span>✓ Abidjan : paiement à la livraison</span><span>✓ Intérieur : paiement avant expédition</span><span>✓ Notre équipe vous contacte pour la livraison</span></div></div><form onSubmit={submit} onFocusCapture={beginCheckout}><label>Nom et prénom<input required minLength={2} autoComplete="name" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Ex. Awa Koné"/></label><label>Téléphone<input required inputMode="tel" autoComplete="tel" value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="07 00 00 00 00"/></label><label>Offre<select value={f.quantity} onChange={e=>set('quantity',Number(e.target.value))}><option value="1">1 pot — 5 000 F</option><option value="2">2 pots — 10 000 F · livraison incluse</option><option value="3">3 pots — 12 000 F · livraison incluse</option></select></label><label>Zone de livraison<select value={f.zone} onChange={e=>setF({...f,zone:e.target.value as 'abidjan'|'interieur',city:'',commune:''})}><option value="abidjan">Abidjan</option><option value="interieur">Intérieur</option></select></label>{f.zone==='abidjan'?<label>Commune<input required value={f.commune} onChange={e=>set('commune',e.target.value)} placeholder="Ex. Cocody"/></label>:<label>Ville<input required value={f.city} onChange={e=>setF({...f,city:e.target.value,commune:e.target.value})} placeholder="Ex. Bouaké"/></label>}<label>Quartier / repère<input required value={f.quartier} onChange={e=>set('quartier',e.target.value)} placeholder="Quartier, carrefour, repère…"/></label><div className="summary"><p><span>Produit</span><b>LAO LI SHI · {f.quantity} pot(s)</b></p><p><span>Produits</span><b>{money(subtotal)}</b></p><p><span>Livraison</span><b>{delivery===0?'INCLUSE':money(delivery)}</b></p><p className="sumTotal"><span>TOTAL</span><b>{total.toLocaleString('fr-FR')} FCFA</b></p></div>{err&&<p className="error" role="alert">{err}</p>}<button className="submit" disabled={busy}>{busy?'ENREGISTREMENT…':`VALIDER MA COMMANDE — ${money(total)}`}</button><small className="paymentNote">Abidjan : aucun paiement en ligne n’est demandé lors de cette validation.</small><small className="formNote">Après validation, gardez la référence de votre commande. Notre équipe vous contacte pour organiser la livraison.</small></form></section>
    </main>
    {proofVisible&&!proofDismissed&&recentOrders[proofIndex]&&!formSeen&&!order&&<aside className="socialToast" aria-label="Commandes réelles"><img src={productMain} alt=""/><div><b>Un client a passé commande</b><span>{orderAge(recentOrders[proofIndex].ageSeconds+(Date.now()-recentOrders[proofIndex].receivedAt)/1000)} · LAO LI SHI</span></div><button type="button" aria-label="Fermer la notification" onClick={()=>{setProofVisible(false);setProofDismissed(true);safeSessionSet('haleinepure_proof_closed','1')}}>×</button></aside>}
    {!formSeen&&<a className="floatingCta" href={offersSeen?'#commande':'#offres'}><span className="floatingCtaMain">{offersSeen?`COMMANDER · ${money(total)}`:'CHOISIR MON OFFRE · DÈS 5 000 F'} <span aria-hidden="true">→</span></span><small>{offersSeen?(f.zone==='abidjan'?'Paiement à la livraison':'Paiement avant expédition'):'Livraison en Côte d’Ivoire'}</small></a>}
    <footer><b>HaleinePure</b><span>LAO LI SHI · Hygiène bucco-dentaire</span><small>DESTOCKAGE RAPIDE · Côte d’Ivoire</small><small>© 2026 DESTOCKAGE RAPIDE</small></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
