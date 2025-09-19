// const url = require('url');
// const fs = require('fs').promises;
// const axios = require('axios');

// const originCheck = async (req, res, next) => {
//   // Get the allowed frontend URLs from environment variables
//   const allowedOrigins = [
//     process.env.FRONTEND_APP_URL || 'http://localhost:8080',
//     process.env.API_URL
//   ].filter(Boolean);

//   // Get the origin or referer from the request headers
//   const origin = req.get('origin') || req.get('referer');

//   // Get the client IP
//   const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;

//   // Get location from IP using ipapi.co
//   let location = 'Unknown location';
//   try {
//     const response = await axios.get(`https://ipapi.co/${ip}/json/`);
//     location = response.data.city && response.data.country_name
//       ? `${response.data.city}, ${response.data.country_name}`
//       : 'Unknown location';
//   } catch (err) {
//     console.error('Geolocation error:', err.message);
//   }

//   // Prepare log data
//   const logData = {
//     timestamp: new Date().toISOString(),
//     ip,
//     location,
//     origin: origin || 'No origin/referer',
//     url: req.originalUrl
//   };

//   if (!origin) {
//     await logToFile(logData);
//     return res.status(403).json({ message: 'IP and Location sent to the server! Red Alert Initiated.' });
//   }

//   // Parse the origin/referer to extract the hostname
//   const parsedOrigin = url.parse(origin).hostname;

//   // Check if the parsed origin matches any of the allowed origins' hostnames
//   const isAllowed = allowedOrigins.some(
//     (allowed) => url.parse(allowed).hostname === parsedOrigin
//   );

//   if (isAllowed) {
//     next();
//   } else {
//     await logToFile(logData);
//     res.status(403).json({ message: 'Request origin not allowed' });
//   }
// };

// // Function to append log data to ip.txt
// async function logToFile(data) {
//   const logEntry = `Timestamp: ${data.timestamp}, IP: ${data.ip}, Location: ${data.location}, Origin: ${data.origin}, URL: ${data.url}\n`;
//   try {
//     await fs.appendFile('ip.txt', logEntry);
//   } catch (err) {
//     console.error('Error writing to ip.txt:', err.message);
//   }
// }

// module.exports = originCheck;