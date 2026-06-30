const express = require('express');
const cors = require('cors');
const db = require('./db'); // This imports your PostgreSQL connection
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// --- HOUR 3: The Rate Calculation API ---
app.post('/api/rates/calculate', async (req, res) => {
    try {
        // 1. Get the inputs from the user's request
        const { pickupZoneId, dropZoneId, length, breadth, height, actualWeight, orderType, isCOD } = req.body;

        // 2. Calculate Volumetric Weight: (L * B * H) / 5000
        const volumetricWeight = (length * breadth * height) / 5000.0;

        // 3. Determine Chargeable Weight (Whichever is heavier)
        const chargeableWeight = Math.max(actualWeight, volumetricWeight);

        // 4. Look up the Rate Card in PostgreSQL securely ($1, $2, $3 prevents hacking)
        const rateQuery = `
            SELECT base_price, weight_multiplier 
            FROM rate_cards 
            WHERE source_zone_id = $1 AND dest_zone_id = $2 AND order_type = $3
        `;
        const { rows } = await db.query(rateQuery, [pickupZoneId, dropZoneId, orderType]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "No rate card found for these zones." });
        }

        const rate = rows[0];

        // 5. Calculate the Final Math
        let totalCharge = parseFloat(rate.base_price) + (chargeableWeight * parseFloat(rate.weight_multiplier));

        // 6. Add COD Surcharge if they are paying in cash
        if (isCOD) {
            totalCharge += 50.00; // Flat 50 surcharge for this MVP
        }

        // 7. Send the bill back to the frontend
        res.status(200).json({
            success: true,
            chargeableWeight: chargeableWeight.toFixed(2),
            totalCharge: totalCharge.toFixed(2)
        });

    } catch (error) {
        console.error("Calculation Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});