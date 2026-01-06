require('dotenv').config({ path: '/var/www/dokterdibya/staff/backend/.env' });
const jwt = require('jsonwebtoken');
console.log(jwt.sign({id:'UDZAQUCQWZ',role:'dokter'},process.env.JWT_SECRET,{expiresIn:'1h'}));
