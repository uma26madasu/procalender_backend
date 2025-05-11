const mongoose = require('mongoose');
const linkSchema = new mongoose.Schema({
  ownerId: mongoose.Schema.Types.ObjectId,
  questions: [{ label: String }],
  usageLimit: Number,
  expirationDate: Date,
  meetingLength: Number,
  maxAdvanceDays: Number,
});
module.exports = mongoose.model('Link', linkSchema);
