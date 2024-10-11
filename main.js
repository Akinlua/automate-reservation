require('dotenv').config();
const axios = require('axios');
const schedule = require('node-schedule');

// Delay function to wait until 10 AM
function waitUntilTenAM() {
  return new Promise((resolve) => {
    const now = new Date();
    const tenAM = new Date();
    tenAM.setHours(10, 0, 0, 0); // Set time to 10 AM
    
    const msUntilTenAM = tenAM - now;
    if (msUntilTenAM > 0) {
      console.log(`Waiting ${msUntilTenAM / 1000} seconds until 10 AM...`);
      setTimeout(resolve, msUntilTenAM);
    } else {
      resolve(); // Already 10 AM or later, no need to wait
    }
  });
}

// Function to get the next date for each check
function getNextDate(currentDate, dayOffset) {
  const nextDate = new Date(currentDate);
  nextDate.setDate(currentDate.getDate() + dayOffset);
  return nextDate.toISOString().split('T')[0]; // Return date in YYYY-MM-DD format
}

// Perform login and then wait until exactly 10 AM
async function loginAndPrepareForReservation() {
  try {
    console.log("Performing login...");
    
    // Login URL and headers
    const loginUrl = 'https://www.futsalbase.com/api/member/login';
    const loginHeaders = {
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'origin': 'https://www.futsalbase.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
      'sec-ch-ua-platform': '"Windows"',
    };

    const loginData = {
      id: "", 
      password: ""
    };

    // Make the login POST request
    const loginResponse = await axios.post(loginUrl, loginData, { headers: loginHeaders });
    
    // Extract the cookie from the response headers
    const cookie = loginResponse.headers['set-cookie'].find(cookie => cookie.startsWith('thebase='));
    console.log('Cookie obtained:', cookie);

    if (!cookie) {
      console.error('Failed to retrieve cookie from login response');
      return;
    }

    // Wait until 10 AM before proceeding to make reservation request
    await waitUntilTenAM();
    
    console.log("It's 10 AM. Making reservation...");

    // Now make the reservation request after login
    await makeReservation(cookie);
    
  } catch (error) {
    console.error('Error during login and reservation process:', error.response ? error.response.data : error);
  }
}

// Function to make the reservation
async function makeReservation(cookie) {
  const reservationUrl = 'https://www.futsalbase.com/api/reservation/create';
  const reservationHeaders = {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://www.futsalbase.com',
    'cookie': cookie,  // Use the cookie from login
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    'sec-ch-ua-platform': '"Windows"',
  };

  const today = new Date();
  let success = false;

  // Loop over 30 days, 8 stadiums, and 12 slots per day to check availability
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const use_date = getNextDate(today, dayOffset);

    for (let stadium = 0; stadium <= 7; stadium++) {
      const stadium_code = stadium === 0 ? 'ST_0_IN' : `ST_${stadium}`;
      
      for (let slot = 1; slot <= 12; slot++) {
        const time_code = `E_${slot.toString().padStart(2, '0')}`;
        console.log(`Checking reservation for ${use_date}, stadium ${stadium_code}, slot ${time_code}...`);

        const reservationData = {
          use_date,
          time_code,
          stadium_code
        };

        try {
          // Make the reservation POST request
          const reservationResponse = await axios.post(reservationUrl, reservationData, { headers: reservationHeaders });
          
          // If successful, break out of the loops
          if (reservationResponse.data.success === true) {
            console.log(`Reservation successful for ${use_date}, stadium ${stadium_code}, slot ${time_code}`);
            success = true;
            break;
          } else {
            console.log(`Reservation failed for ${use_date}, stadium ${stadium_code}, slot ${time_code}. Trying next...`);
          }
        } catch (error) {
          // Handle the error and continue to the next slot
          console.error(`Error occurred for ${use_date}, stadium ${stadium_code}, slot ${time_code}:`, error.response ? error.response.data : error);
        }

        // Wait 5 seconds between each check
        await delay(5000);
      }

      if (success) break;
    }

    if (success) break;
  }
}

// Delay helper function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Schedule login 2 minutes before 10 AM (at 9:58 AM)
schedule.scheduleJob('58 9 1 * *', () => {
  loginAndPrepareForReservation();
});

