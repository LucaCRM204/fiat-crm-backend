const mysql = require('mysql2/promise');
require('dotenv').config();

// Crear pool de conexiones para Railway
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

async function query(sql, params) {
  try {
    const [results] = await pool.execute(sql, params);
    return [results];
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
}

// Probar conexión al iniciar
pool.getConnection()
  .then(connection => {
    console.log('✅ Conexión a Railway MySQL exitosa');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a Railway MySQL:', err.message);
  });

module.exports = {
  query,
  pool
};