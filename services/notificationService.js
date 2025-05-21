const nodemailer = require('nodemailer');
const { User } = require('../models');

// Configure email transport (replace with your email service)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendApprovalRequest = async (booking, approverIds) => {
  try {
    // Get approver details
    const approvers = await User.find({
      _id: { $in: approverIds }
    }).select('name email');
    
    // Format date and time for email
    const bookingDate = new Date(booking.startTime).toLocaleDateString();
    const bookingTime = new Date(booking.startTime).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Send email to each approver
    for (const approver of approvers) {
      const mailOptions = {
        from: `"Slotify" <${process.env.EMAIL_USER}>`,
        to: approver.email,
        subject: `Booking Approval Required: ${booking.clientName}`,
        html: `
          <h3>New Booking Requires Your Approval</h3>
          <p>A new booking has been submitted that requires your approval:</p>
          <ul>
            <li><strong>Client:</strong> ${booking.clientName} (${booking.clientEmail})</li>
            <li><strong>Date:</strong> ${bookingDate}</li>
            <li><strong>Time:</strong> ${bookingTime}</li>
          </ul>
          <p>Please log in to your dashboard to approve or reject this booking.</p>
          <a href="${process.env.FRONTEND_URL}/approvals" style="padding: 10px 15px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
            Review Booking
          </a>
        `
      };
      
      await transporter.sendMail(mailOptions);
    }
    
    return true;
  } catch (error) {
    console.error('Error sending approval request emails:', error);
    throw error;
  }
};

exports.sendApprovalConfirmation = async (booking) => {
  try {
    // Format date and time for email
    const bookingDate = new Date(booking.startTime).toLocaleDateString();
    const bookingTime = new Date(booking.startTime).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Prepare email to client
    const mailOptions = {
      from: `"Slotify" <${process.env.EMAIL_USER}>`,
      to: booking.clientEmail,
      subject: 'Your booking has been approved!',
      html: `
        <h3>Your Booking is Confirmed!</h3>
        <p>Good news! Your booking has been approved:</p>
        <ul>
          <li><strong>Date:</strong> ${bookingDate}</li>
          <li><strong>Time:</strong> ${bookingTime}</li>
        </ul>
        <p>We look forward to meeting with you!</p>
        <p>If you need to cancel or reschedule, please use the link in your original booking confirmation.</p>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    return true;
  } catch (error) {
    console.error('Error sending approval confirmation email:', error);
    throw error;
  }
};

exports.sendRejectionNotification = async (booking, reason) => {
  try {
    // Format date and time for email
    const bookingDate = new Date(booking.startTime).toLocaleDateString();
    const bookingTime = new Date(booking.startTime).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Prepare email to client
    const mailOptions = {
      from: `"Slotify" <${process.env.EMAIL_USER}>`,
      to: booking.clientEmail,
      subject: 'Update on your booking request',
      html: `
        <h3>Your Booking Could Not Be Confirmed</h3>
        <p>We're sorry, but we couldn't confirm your booking request for:</p>
        <ul>
          <li><strong>Date:</strong> ${bookingDate}</li>
          <li><strong>Time:</strong> ${bookingTime}</li>
        </ul>
        <p><strong>Reason:</strong> ${reason || 'No reason provided.'}</p>
        <p>Please feel free to choose another time that works for you:</p>
        <a href="${process.env.FRONTEND_URL}/book/${booking.linkId}" style="padding: 10px 15px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">
          Book Another Time
        </a>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    return true;
  } catch (error) {
    console.error('Error sending rejection email:', error);
    throw error;
  }
};