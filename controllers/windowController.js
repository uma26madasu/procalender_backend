// controllers/windowController.js
const Window = require('../models/Window');

// Get all availability windows for a user
exports.getWindows = async (req, res) => {
  try {
    const windows = await Window.find({ ownerId: req.user._id });
    
    res.status(200).json({
      success: true,
      count: windows.length,
      data: windows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Create a new availability window
exports.createWindow = async (req, res) => {
  try {
    const { dayOfWeek, startHour, endHour, name } = req.body;
    
    // Validate input
    if (!dayOfWeek || !startHour || !endHour) {
      return res.status(400).json({
        success: false,
        error: 'Please provide day, start time and end time'
      });
    }
    
    // Create window
    const window = await Window.create({
      ownerId: req.user._id,
      dayOfWeek,
      startHour,
      endHour,
      name: name || `${dayOfWeek} Availability`
    });
    
    res.status(201).json({
      success: true,
      data: window
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Update an availability window
exports.updateWindow = async (req, res) => {
  try {
    const { id } = req.params;
    const { dayOfWeek, startHour, endHour, name, active } = req.body;
    
    // Find window
    let window = await Window.findById(id);
    
    if (!window) {
      return res.status(404).json({
        success: false,
        error: 'Availability window not found'
      });
    }
    
    // Check ownership
    if (window.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this window'
      });
    }
    
    // Update fields
    if (dayOfWeek) window.dayOfWeek = dayOfWeek;
    if (startHour) window.startHour = startHour;
    if (endHour) window.endHour = endHour;
    if (name) window.name = name;
    if (active !== undefined) window.active = active;
    
    await window.save();
    
    res.status(200).json({
      success: true,
      data: window
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Delete an availability window
exports.deleteWindow = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find window
    const window = await Window.findById(id);
    
    if (!window) {
      return res.status(404).json({
        success: false,
        error: 'Availability window not found'
      });
    }
    
    // Check ownership
    if (window.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this window'
      });
    }
    
    await window.remove();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};