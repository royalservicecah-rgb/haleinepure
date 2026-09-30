const API='https://tpdsklfcqenirvcemtkk.supabase.co/functions/v1/public-order-haleinepure';
const PROD='https://haleinepure.destockagerapide.com';
const KEY='hp-smoke-6d3f8a91-20260930';
const RID='hp-smoke-v2-20260930-1638';

export default async function handler(req,res){
  if(req.query.key!==KEY)return res.status(404).json({error:'not_found'});
  const payload={
    name:'TEST HALEINEPURE',
    phone:'00000000',
    quantity:1,
    zone:'abidjan',
    commune:'TEST TECHNIQUE',
    city:'',
    quartier:'TEST TECHNIQUE — NE PAS LIVRER',
    landmark:'TEST TECHNIQUE — NE PAS LIVRER',
    clientRequestId:RID
  };
  async function call(){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Origin':PROD},body:JSON.stringify(payload)});
    let body={};try{body=await r.json()}catch{}
    return {status:r.status,ok:body?.ok===true,duplicate:body?.duplicate===true,order_number:body?.order?.order_number||null,total:body?.order?.total??null,delivery_fee:body?.order?.delivery_fee??null,commune:body?.order?.commune||null,quartier:body?.order?.quartier||null,request_id:body?.order?.client_request_id||null};
  }
  try{
    const first=await call();
    const second=await call();
    return res.status(200).json({first,second});
  }catch(e){return res.status(500).json({error:'smoke_failed'});}
}
