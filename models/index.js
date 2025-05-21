/**
 * Centralized model exports
 * Standardizes model imports across the application
 */

const User = require('./User');
const Link = require('./Link');
const Booking = require('./Booking');
const Window = require('./Window');

module.exports = {
  User,
  Link,
  Booking,
  Window
};