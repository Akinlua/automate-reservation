require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let userSelections = []; // In-memory storage for multiple user selections
let reservationLogs = []; // Store reservation logs in memory

// Fetch reservation logs
app.get('/get-logs', (req, res) => {
    res.json(reservationLogs);
});

// Save user selections
app.post('/save-selections', (req, res) => {
    const { users } = req.body; // Expect an array of users, each with their own stadium and time slots

    userSelections = users.map(user => ({
        id: user.id,
        password: user.password,
        stadiums: user.stadiums.map(stadium => ({
            stadium: stadium.stadium,
            day: stadium.day,
            timeSlot: stadium.timeSlot
        }))
    }));

    console.log(userSelections);
    res.send({ message: 'Selections saved successfully!' });
});

// Fetch saved user selections
app.get('/get-selections', (req, res) => {
    res.json(userSelections);
});

// Helper function to get the next available date
function getNextDate(currentDate, dayOffset) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + dayOffset);
    return nextDate.toISOString().split('T')[0]; // Return date in YYYY-MM-DD format
}

// Delay function to wait until 10 AM
function waitUntilTenAM() {
    return new Promise((resolve) => {

     const now = moment().tz('Asia/Seoul'); // Get the current time in Asia/Seoul time zone
        const tenAm = moment().tz('Asia/Seoul').set({ hour: 7, minute: 50, second: 0, millisecond: 0 }); // Set time to 6:15 AM

        const msUntilTenAM = tenAm.diff(now); // Calculate the difference in milliseconds

      if (msUntilTenAM > 0) {
        console.log(`Waiting ${msUntilTenAM / 1000} seconds until 10 AM...`);
        reservationLogs.push({text: `Waiting ${msUntilTenAM / 1000} seconds until 7:50 AM...`, color:"normal" })
        setTimeout(resolve, msUntilTenAM);
      } else {
        resolve(); // Already 10 AM or later, no need to wait
      }
    });
}



function getCurrentDateTime() {
    // Get current time in Asia/Seoul time zone
    const now = moment().tz('Asia/Seoul');

    // Format the date and time as 'YYYY-MM-DD HH:mm:ss.SSS'
    const formattedDateTime = now.format('YYYY-MM-DD HH:mm:ss.SSS');

    return formattedDateTime;
}


async function loginAndReserve(user) {
    const { id, password, stadiums } = user;
    try {
        console.log(`Logging in with ID: ${id}...`);

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

        const loginData = { id, password };

        const loginResponse = await axios.post(loginUrl, loginData, { headers: loginHeaders });
        const cookie = loginResponse.headers['set-cookie'].find(cookie => cookie.startsWith('thebase='));

        if (!cookie) {
            console.error('Failed to retrieve login cookie for ID:', id);
            return;
        }

        console.log(`Login successful for ID: ${id}. Attempting reservations...`);
        reservationLogs.push({text: `Login successful for ID: ${id}. Attempting reservations...`,color:"green" } )
        await waitUntilTenAM();

        console.log(`It's 10 AM. Making reservations for ${id} at time ${getCurrentDateTime()}` );
        reservationLogs.push({text: `It's 10 AM. Making reservations for ${id} at time ${getCurrentDateTime()}`, color:"normal" });

        // Attempt reservations for all stadium slots for the user
        await Promise.all(stadiums.map(stadium => attemptReservation(cookie, stadium.stadium, stadium.day, stadium.timeSlot)));
    } catch (error) {
        console.error(`Error during login/reservation for ID: ${id}`, error.response ? error.response.data : error, ` at time ${getCurrentDateTime()}`);
        reservationLogs.push({text: `Error during login/reservation for ID: ${id} ${error.response ? error.response.data : error} at time ${getCurrentDateTime()} `, color:"red" })
    }
}


// Function to attempt reservation for a given stadium, day, and time slot
async function attemptReservation(cookie, stadium, selectedDay, selectedSlot) {
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

    let success = false;

    // Start with the user's preferred day and slot
    const selectedDate = selectedDay; // Use the day provided by the user

    // First try the exact slot the user selected
    const time_code = `E_${selectedSlot.toString().padStart(2, '0')}`;
    const reservationData = { use_date: selectedDate, stadium_code: stadium, time_code };

    try {
        console.log(`Reservation Initated for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`)
        reservationLogs.push({text: `Reservation Initated for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`,  color:"normal" })
        const reservationResponse = await axios.post(reservationUrl, reservationData, { headers: reservationHeaders });

        if (reservationResponse.data.success) {
            console.log(`Reservation successful for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`);
            reservationLogs.push({text: `Reservation successful for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`, color:"green" });
            success = true;
        } else {
            console.log(`Reservation failed for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`);
            reservationLogs.push({text: `Reservation failed for ${selectedDate}, stadium ${stadium}, slot ${time_code} at time ${getCurrentDateTime()}`, color:"red" });
        }
    } catch (error) {
        console.error(`Error during exact slot reservation:`, error.response ? error.response.data : error, ` at time ${getCurrentDateTime()}`);
        reservationLogs.push({text: `Reservation failed  for ${selectedDate}, stadium ${stadium}, slot ${time_code}: ${error.response ? error.response.data : error} at time ${getCurrentDateTime()}`, color:"red" });
    }

}

// Helper delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Schedule to run both reservations simultaneously at 10 AM on the first day of each month

let rule = new schedule.RecurrenceRule();

// your timezone
rule.tz = 'Asia/Seoul';


rule.second = 0;
rule.minute = 49;
rule.hour = 7;
rule.date = 14;

schedule.scheduleJob(rule, () => {
    reservationLogs = [];
    console.log('Starting simultaneous reservation attempts for all users...at time ', getCurrentDateTime());
    reservationLogs.push( {text: `Starting simultaneous reservation attempts for all users...at time ${getCurrentDateTime()}`, color: "normal"} )

    Promise.all(userSelections.map(user => loginAndReserve(user)))
        .then(() => {
            console.log('All reservation attempts complete at time ', getCurrentDateTime())
            reservationLogs.push( {text: `All reservation attempts complete at time ${getCurrentDateTime()}`, color:"normal" })
        })
        .catch((error) => {
            console.error('Error in reservation attempts:', error);
        });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
