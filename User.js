const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: String,
  googleTokens: Object,
  hubspotToken: String,
});
module.exports = mongoose.model('User', userSchema);
