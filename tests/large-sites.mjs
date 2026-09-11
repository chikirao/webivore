const urls=['https://github.com','https://www.apple.com'];
for(const url of urls){
 const start=Date.now();const res=await fetch('http://127.0.0.1:3001/api/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(65000)});
 const d=await res.json();console.log(JSON.stringify({url,status:res.status,seconds:((Date.now()-start)/1000).toFixed(1),objects:d.pieces?.length,images:d.pieces?.filter(p=>p.type==='IMAGE').length,error:d.error}));
}
