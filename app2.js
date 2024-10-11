require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let userSelections = {}; // In-memory storage for user selections

// Save user selections
app.post('/save-selections', (req, res) => {
    const { id1, password1, id2, password2, stadium1, stadium2, day1, day2, timeSlot1, timeSlot2 } = req.body;

    userSelections = {
        id1,
        password1,
        id2,
        password2,
        stadium1,
        stadium2,
        day1,
        day2,
        timeSlot1,
        timeSlot2,
    };
    console.log(userSelections)

    res.send({ message: 'Selections saved successfully!' });
});

// Fetch saved user selections
app.get('/get-selections', (req, res) => {

    console.log(userSelections)

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

// Function to perform login and reserve a slot
async function loginAndReserve(id, password, stadium, day, timeSlot) {
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

        // Wait until 10 AM before proceeding to make reservation request
        // await waitUntilTenAM();
        
        // console.log("It's 10 AM. Making reservation...");

        console.log(`Login successful for ID: ${id}. Attempting reservation...`);
        await attemptReservation(cookie, stadium, day, timeSlot);
    } catch (error) {
        console.error(`Error during login/reservation for ID: ${id}`,  error.response ? error.response.data : error);
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

    console.log(`Attempting reservation for exact slot ${selectedSlot} on day ${selectedDate}...`);

    // First try the exact slot the user selected
    const time_code = `E_${selectedSlot.toString().padStart(2, '0')}`;
    const reservationData = { use_date: selectedDate, stadium_code: stadium, time_code };

    try {
        const reservationResponse = await axios.post(reservationUrl, reservationData, { headers: reservationHeaders });

        if (reservationResponse.data.success) {
            console.log(`Reservation successful for ${selectedDate}, stadium ${stadium}, slot ${time_code}`);
            success = true;
        } else {
            console.log(`Exact slot reservation failed for ${selectedDate}, stadium ${stadium}, slot ${time_code}. Trying other slots...`);
        }
    } catch (error) {
        console.error(`Error during exact slot reservation:`, error.response ? error.response.data : error);
    }

    // If the exact slot fails, try other slots for the same day
    if (!success) {
        for (let slot = 1; slot <= 12; slot++) {
            // Skip the exact slot that has already been tried
            if (slot === selectedSlot) continue;

            const alt_time_code = `E_${slot.toString().padStart(2, '0')}`;
            const altReservationData = { use_date: selectedDate, stadium_code: stadium, time_code: alt_time_code };

            console.log(`Checking alternative reservation for ${selectedDate}, stadium ${stadium}, slot ${alt_time_code}...`);

            try {
                const altReservationResponse = await axios.post(reservationUrl, altReservationData, { headers: reservationHeaders });

                if (altReservationResponse.data.success) {
                    console.log(`Alternative reservation successful for ${selectedDate}, stadium ${stadium}, slot ${alt_time_code}`);
                    success = true;
                    break;
                }
            } catch (error) {
                console.error(`Error during alternative slot reservation:`, error.response ? error.response.data : error);
            }

            // Wait 5 seconds before the next attempt
            await delay(5000);
        }
    }

    // If no slots were found for the selected day, check the following days
    if (!success) {
        for (let dayOffset = 1; dayOffset < 30; dayOffset++) { // Check up to 30 days ahead
            const nextDate = getNextDate(selectedDate, dayOffset); // Get the next date

            console.log(`Checking slots for ${nextDate}...`);

            // Try each slot for the next day
            for (let slot = 1; slot <= 12; slot++) {
                const time_code = `E_${slot.toString().padStart(2, '0')}`;
                const reservationData = { use_date: nextDate, stadium_code: stadium, time_code };

                try {
                    const reservationResponse = await axios.post(reservationUrl, reservationData, { headers: reservationHeaders });

                    if (reservationResponse.data.success) {
                        console.log(`Reservation successful for ${nextDate}, stadium ${stadium}, slot ${time_code}`);
                        success = true;
                        break; // Exit the loop if successful
                    }
                } catch (error) {
                    console.error(`Error during reservation attempt for ${nextDate}, slot ${time_code}:`, error.response ? error.response.data : error);
                }

                // Wait 5 seconds before next attempt
                await delay(5000);
            }

            if (success) break; // Exit if a reservation was successful
        }
    }

    // Notify if no reservation was made
    if (!success) {
        console.log(`No available slots found for the selected date or the following 30 days.`);
    }


}

// Helper delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Schedule every 30seconds
schedule.scheduleJob('*/60 * * * * *', () => {
    if (userSelections.id1 && userSelections.id2) {
        // Run both reservation attempts simultaneously
        console.log('Starting simultaneous reservation attempts for both users...');

        // Run login and reservation attempts for both IDs
        Promise.all([
            loginAndReserve(userSelections.id1, userSelections.password1, userSelections.stadium1, userSelections.day1, userSelections.timeSlot1),
            loginAndReserve(userSelections.id2, userSelections.password2, userSelections.stadium2, userSelections.day2, userSelections.timeSlot2)
        ]).then(() => {
            console.log('Reservation attempts complete.');
        }).catch((error) => {
            console.error('Error during reservation attempts:', error);
        });
    } else {
        console.log('Reservation details are incomplete. Please provide both user details.');
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
