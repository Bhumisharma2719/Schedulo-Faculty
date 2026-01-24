const mongoose = require('mongoose');

const ScheduleNotificationSchema = new mongoose.Schema({
  course: { type: String, required: true },
  subject: { type: String, required: true },

  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },

  // From original slot
  fromSlot: {
    day: String,
    slot: Number
  },

  // To new slot
  toSlot: {
    day: String,
    slot: Number,
    date: Date
  },

  room: { type: String, required: true },
  building: { type: String, required: true },

  // When the class is scheduled for
  scheduledDate: { type: Date, required: true },

  // When notification was created
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ScheduleNotification', ScheduleNotificationSchema);
