const mongoose = require('mongoose');
const windowSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  dayOfWeek: String,
  startHour: String,
  endHour: String,
});
module.exports = mongoose.model('Window', windowSchema);
