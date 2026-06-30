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

// --- HOUR 4: Order Creation & Auto-Assignment API ---
app.post('/api/orders', async (req, res) => {
    // We get a dedicated client for our transaction
    const client = await db.getClient(); 
    
    try {
        await client.query('BEGIN'); // Start the transaction lock

        const { customerId, pickupZoneId, dropZoneId, actualWeight, volumetricWeight, chargeableWeight, totalCharge } = req.body;

        // 1. Create the Order first (Status: PENDING)
        const orderInsertQuery = `
            INSERT INTO orders (customer_id, pickup_zone_id, drop_zone_id, actual_weight, volumetric_weight, chargeable_weight, total_charge)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        const orderResult = await client.query(orderInsertQuery, [customerId, pickupZoneId, dropZoneId, actualWeight, volumetricWeight, chargeableWeight, totalCharge]);
        const newOrderId = orderResult.rows[0].id;

        // 2. Find an available agent in the pickup zone and LOCK the row so no one else can claim them
        const agentQuery = `
            SELECT id FROM agents 
            WHERE current_zone_id = $1 AND status = 'AVAILABLE' 
            ORDER BY last_idle_time ASC 
            LIMIT 1 
            FOR UPDATE; -- This locks the row!
        `;
        const agentResult = await client.query(agentQuery, [pickupZoneId]);

        if (agentResult.rows.length === 0) {
            // No agents available right now. Commit the pending order and return.
            await client.query('COMMIT');
            return res.status(202).json({ 
                success: true, 
                message: "Order created, but no agents currently available. Queued for assignment.",
                orderId: newOrderId 
            });
        }

        const assignedAgentId = agentResult.rows[0].id;

        // 3. Mark the Agent as BUSY
        await client.query(`UPDATE agents SET status = 'BUSY' WHERE id = $1`, [assignedAgentId]);

        // 4. Update the Order with the assigned agent and change status
        await client.query(`UPDATE orders SET agent_id = $1, status = 'ASSIGNED' WHERE id = $2`, [assignedAgentId, newOrderId]);

        await client.query('COMMIT'); // Success! Unlock the database.

        res.status(201).json({
            success: true,
            message: "Order created and agent assigned successfully!",
            orderId: newOrderId,
            agentId: assignedAgentId
        });

    } catch (error) {
        await client.query('ROLLBACK'); // If anything fails, undo all database changes
        console.error("Assignment Error:", error);
        res.status(500).json({ error: "Failed to create order and assign agent" });
    } finally {
        client.release(); // Always return the client to the pool
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});