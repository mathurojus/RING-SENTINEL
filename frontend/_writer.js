var fs=require('fs');
var http=require('http');
var s=http.createServer(function(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(200);res.end();return;}
  if(req.method==='POST'){
    var b='';
    req.on('data',function(c){b+=c;});
    req.on('end',function(){
      fs.writeFileSync('js/app.js',b);
      res.writeHead(200);
      res.end('ok:'+b.length);
    });
  }
});
s.listen(9999,function(){console.log('Writer on 9999');});
