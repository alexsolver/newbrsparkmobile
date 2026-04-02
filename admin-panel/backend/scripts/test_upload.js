const http = require('http');

const req = http.request('http://localhost:3001/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const data = JSON.parse(body);
    const token = data.token;
    
    if(!token) { console.log('Login failed', data); return; }

    const req2 = http.request('http://localhost:3001/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, res2 => {
      let b= '';
      res2.on('data', d => b+=d);
      res2.on('end', () => console.log('PUT /me:', res2.statusCode, b));
    });
    req2.write(JSON.stringify({ avatarUrl: 'file:///fake/path.jpg' }));
    req2.end();
  });
});
req.write(JSON.stringify({ email: 'alex@brspark.com', password: 'password123' })); // Adjust password if needed, or use a known one. Actually wait, I can just issue a Prisma update.
req.end();
