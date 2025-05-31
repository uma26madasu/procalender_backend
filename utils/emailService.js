const nodemailer = require('nodemailer');

// Create transporter once
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Template for new booking notification
const newBookingTemplate = (booking, advisor, link) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #3b82f6; }
          h2 { color: #4b5563; margin-top: 20px; }
          .info { background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .question { margin-top: 5px; font-weight: bold; }
          .answer { margin-top: 2px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>New Meeting Booked</h1>
          <p>A new meeting has been booked through your scheduling link.</p>
          
          <div class="info">
            <h2>Meeting Details</h2>
            <p><strong>Client:</strong> ${booking.clientName} (${booking.clientEmail})</p>
            <p><strong>Meeting Type:</strong> ${booking.meetingName}</p>
            <p><strong>Date:</strong> ${new Date(booking.startTime).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${new Date(booking.startTime).toLocaleTimeString()} - ${new Date(booking.endTime).toLocaleTimeString()}</p>
            ${booking.linkedinUrl ? `<p><strong>LinkedIn:</strong> <a href="${booking.linkedinUrl}">${booking.linkedinUrl}</a></p>` : ''}
          </div>
          
          ${booking.questions && booking.questions.length > 0 ? `
            <div class="info">
              <h2>Client Responses</h2>
              ${booking.questions.map(q => `
                <div class="question">${q.question}</div>
                <div class="answer">${q.answer}</div>
              `).join('')}
            </div>
          ` : ''}
          
          <p>View all your meetings in the <a href="${process.env.FRONTEND_URL}/meetings">ProCalender dashboard</a>.</p>
        </div>
      </body>
    </html>
  `;
};

// Template for booking confirmation to client
const clientConfirmationTemplate = (booking) => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #3b82f6; }
          .info { background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Your Meeting is Confirmed</h1>
          <p>Thank you for scheduling a meeting. Here are the details:</p>
          
          <div class="info">
            <p><strong>Meeting Type:</strong> ${booking.meetingName}</p>
            <p><strong>Date:</strong> ${new Date(booking.startTime).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${new Date(booking.startTime).toLocaleTimeString()} - ${new Date(booking.endTime).toLocaleTimeString()}</p>
          </div>
          
          <p>You should receive a calendar invitation shortly. If you need to reschedule, please contact the advisor directly.</p>
        </div>
      </body>
    </html>
  `;
};

// Function to send advisor notification
exports.sendAdvisorNotification = async (booking, advisor, link) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: advisor.email,
      subject: `New Booking: ${booking.meetingName} with ${booking.clientName}`,
      html: newBookingTemplate(booking, advisor, link)
    });
    return true;
  } catch (error) {
    console.error('Error sending advisor notification:', error);
    return false;
  }
};

// Function to send client confirmation
exports.sendClientConfirmation = async (booking) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.clientEmail,
      subject: `Meeting Confirmation: ${booking.meetingName}`,
      html: clientConfirmationTemplate(booking)
    });
    return true;
  } catch (error) {
    console.error('Error sending client confirmation:', error);
    return false;
  }
};