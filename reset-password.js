require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function resetPassword() {
  const email = 'Luca@alluma.com';
  const newPassword = 'Luca2702';
  
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  await connection.query(
    'UPDATE users SET password = ? WHERE email = ?',
    [hashedPassword, email]
  );
  
  console.log(`✅ Contraseña actualizada para ${email}`);
  console.log(`Nueva contraseña: ${newPassword}`);
  
  await connection.end();
}

resetPassword().catch(console.error);