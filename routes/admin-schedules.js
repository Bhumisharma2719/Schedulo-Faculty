const express = require('express');
const router = express.Router();

const TemporarySchedule = require('../models/TemporarySchedule');
const Teacher = require('../models/Teacher');
const ScheduleNotification = require('../models/ScheduleNotification');

/**
 * 📊 GET ALL SCHEDULES (Scheduled + Archived)
 * With filters for teacher name
 */
router.get('/', async (req, res) => {
  try {
    const filterTeacher = req.query.teacher || null;
    
    // Fetch all temporary schedules (both scheduled and archived)
    let schedules = await TemporarySchedule.find()
      .populate('teacherId', 'name email')
      .sort({ createdAt: -1 });

    // Filter by teacher if selected
    if (filterTeacher) {
      schedules = schedules.filter(s => 
        s.teacherId?._id?.toString() === filterTeacher ||
        s.teacherId?.name?.toLowerCase().includes(filterTeacher.toLowerCase())
      );
    }

    // Get all teachers for filter dropdown
    const allTeachers = await Teacher.find().select('_id name email').sort({ name: 1 });

    // Map schedules with all details
    const scheduleDetails = schedules.map(schedule => ({
      _id: schedule._id,
      course: schedule.course,
      subject: schedule.subject,
      teacher: schedule.teacherId?.name || 'Unknown Teacher',
      teacherEmail: schedule.teacherId?.email || '',
      teacherId: schedule.teacherId?._id?.toString() || '',
      from: schedule.from,
      to: schedule.to,
      room: schedule.room,
      building: schedule.building,
      status: schedule.status,
      scheduledDate: schedule.to.date,
      createdAt: schedule.createdAt,
      weekStartDate: schedule.weekStartDate
    }));

    // Separate scheduled and archived
    const scheduledClasses = scheduleDetails.filter(s => s.status === 'scheduled');
    const archivedClasses = scheduleDetails.filter(s => s.status === 'archived');

    res.render('admin/schedules', {
      scheduledClasses,
      archivedClasses,
      allTeachers,
      filterTeacher,
      totalScheduled: scheduledClasses.length,
      totalArchived: archivedClasses.length
    });

  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).send('Error loading schedules');
  }
});

/**
 * 📊 GET SCHEDULE STATISTICS
 */
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await TemporarySchedule.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalSchedules = await TemporarySchedule.countDocuments();
    const uniqueTeachers = await TemporarySchedule.distinct('teacherId');
    const uniqueCourses = await TemporarySchedule.distinct('course');

    res.json({
      totalSchedules,
      uniqueTeachers: uniqueTeachers.length,
      uniqueCourses: uniqueCourses.length,
      byStatus: stats
    });

  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
