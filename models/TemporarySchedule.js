const mongoose = require('mongoose');

const TemporaryScheduleSchema = new mongoose.Schema({
  course: { type: String, required: true },
  subject: { type: String, default: '' },

  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },

  // Original slot (from timetable)
  from: {
    day: String,
    slot: Number
  },

  // Rescheduled slot (temporary)
  to: {
    day: String,
    slot: Number,
    date: Date
  },

  room: { type: String, required: true },
  building: { type: String, required: true },

  // Week tracking (for user view)
  weekStartDate: { 
    type: Date,
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'archived'],
    default: 'scheduled'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }
  }
});

module.exports = mongoose.model('TemporarySchedule', TemporaryScheduleSchema);
