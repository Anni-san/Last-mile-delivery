const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, text) => {
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', 
            // Hardcoded to your registered email for the free tier to work
            to: 'unknowndevilcoder@gmail.com', 
            subject: subject,
            text: text,
        });

        if (error) {
            console.error("Resend API Error:", error);
            return;
        }

        console.log("Real HTTP Email fired! ID:", data.id);
    } catch (error) {
        console.error("Email Execution Error:", error);
    }
};

module.exports = sendEmail;