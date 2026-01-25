const express = require('express');
const router = express.Router();
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');
const TemporarySchedule = require('../models/TemporarySchedule');
const ScheduleNotification = require('../models/ScheduleNotification');

router.get('/about', (req, res) => {
  res.render('about');
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}

// 🔁 Add this helper function
function getFullDetails(subjectCode, subjectMap) {
  if (!subjectCode || !subjectMap) return { fullSubject: subjectCode, fullTeacher: "" };
  const entry = subjectMap.find(item => item.code === subjectCode);
  return {
    fullSubject: entry ? entry.fullName : subjectCode,
    fullTeacher: entry ? entry.teacher : ""
  };
}

// Helper: Get week start date (Monday)
function getWeekStartDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ✅ Full Timetable View (with temporary schedules)
router.get('/timetable', ensureAuthenticated, async (req, res) => {
  try {
    const selectedCourse = req.query.course || null;
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });

    if (!latestTimetableDoc) {
      return res.render('user/timetable', {
        timetable: null,
        courses: [],
        selectedCourse: null,
        temporarySchedules: [],
        notifications: []
      });
    }

    const {
      timetable: fullTimetable,
      subjectTeachers,
      university,
      faculty,
      effectiveFrom: wefDate,
      days,
      slots
    } = latestTimetableDoc;

    // Store slots for later use in mapping
    const slotsArray = slots || [];

    const courses = Object.keys(fullTimetable);

    let filteredTimetable = fullTimetable;
    let filteredSubjectTeachers = subjectTeachers;

    if (selectedCourse && fullTimetable[selectedCourse]) {
      filteredTimetable = { [selectedCourse]: fullTimetable[selectedCourse] };
      filteredSubjectTeachers = { [selectedCourse]: subjectTeachers[selectedCourse] || [] };
    }

    // 🔹 Fetch temporary schedules for this course
    let temporarySchedules = [];
    if (selectedCourse) {
      temporarySchedules = await TemporarySchedule.find({ course: selectedCourse })
        .populate('teacherId', 'name email')
        .sort({ 'to.date': 1 });
    } else {
      temporarySchedules = await TemporarySchedule.find()
        .populate('teacherId', 'name email')
        .sort({ 'to.date': 1 });
    }

    // 🔹 Fetch all notifications
    let notifications = await ScheduleNotification.find()
      .populate('teacherId', 'name email')
      .sort({ createdAt: -1 });

    if (selectedCourse) {
      notifications = notifications.filter(n => n.course === selectedCourse);
    }

    res.render('user/timetable', {
      timetable: filteredTimetable,
      university,
      faculty,
      wefDate,
      subjectTeachers: filteredSubjectTeachers,
      slots,
      days,
      courses,
      selectedCourse,
      userEmail: req.user?.email || '',
      temporarySchedules: temporarySchedules.map(ts => ({
        _id: ts._id,
        course: ts.course,
        subject: ts.subject,
        teacher: ts.teacherId?.name || 'Unknown Teacher',
        teacherEmail: ts.teacherId?.email || '',
        from: ts.from,
        fromTime: slotsArray[ts.from.slot] || `Slot ${ts.from.slot + 1}`,
        to: ts.to,
        toTime: slotsArray[ts.to.slot] || `Slot ${ts.to.slot + 1}`,
        room: ts.room,
        building: ts.building,
        weekStartDate: ts.weekStartDate
      })),
      notifications: notifications.map(n => ({
        _id: n._id,
        course: n.course,
        subject: n.subject,
        teacher: n.teacherId?.name || 'Unknown Teacher',
        teacherEmail: n.teacherId?.email || '',
        fromSlot: n.fromSlot,
        fromTime: slotsArray[n.fromSlot.slot] || `Slot ${n.fromSlot.slot + 1}`,
        toSlot: n.toSlot,
        toTime: slotsArray[n.toSlot.slot] || `Slot ${n.toSlot.slot + 1}`,
        room: n.room,
        building: n.building,
        scheduledDate: n.scheduledDate,
        createdAt: n.createdAt
      }))
    });
  } catch (err) {
    console.error('Error fetching timetable:', err);
    res.status(500).send('Error loading timetable');
  }
});

// ✅ Today's Timetable View (updated with temporary schedules)
router.get('/timetable/today', ensureAuthenticated, async (req, res) => {
  try {
    const selectedCourse = req.query.course || null;
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });

    const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDate = new Date();
    const today = daysMap[todayDate.getDay()];
    const dayName = today;

    if (!latestTimetableDoc) {
      return res.render('user/today', {
        today,
        todaySchedule: [],
        slots: [],
        courses: [],
        selectedCourse: null,
        dayName,
        subjectTeachers: {},
        temporarySchedules: [],
        notifications: []
      });
    }

    const { timetable: fullTimetable, slots, days } = latestTimetableDoc;
    const slotsArray = slots || [];
    const courses = Object.keys(fullTimetable);
    let todaySchedule = [];

    // 👇 Function to clean shortName
    const extractShortName = (raw) => {
      return raw?.split('(')[0]?.trim() || '';
    };

    if (selectedCourse && fullTimetable[selectedCourse]) {
      const courseSchedule = fullTimetable[selectedCourse];
      const todayIndex = days.indexOf(today);

      if (todayIndex !== -1) {
        const rawSchedule = courseSchedule[today] || [];

        let mergedSchedule = [];
        let i = 0;

        while (i < rawSchedule.length) {
          let current = rawSchedule[i];
          let startIndex = i;
          let endIndex = i;

          // Merge consecutive same entries
          while (
            endIndex + 1 < rawSchedule.length &&
            rawSchedule[endIndex + 1]?.subject === current.subject &&
            rawSchedule[endIndex + 1]?.teacher === current.teacher &&
            rawSchedule[endIndex + 1]?.room === current.room
          ) {
            endIndex++;
          }

          // 🔍 Lookup using cleaned subject shortName
          const cleanedShortName = extractShortName(current.subject);
          const subjectDoc = await Subject.findOne({ shortName: new RegExp(`^${cleanedShortName}$`, 'i') }).populate('assignedTeacher');

          const subjectFullName = subjectDoc?.fullName || current.subject || "Free";
          const teacherFullName = subjectDoc?.assignedTeacher?.name || current.teacher || "N/A";
          const isFree = subjectFullName === "Free";
          const isLab = subjectFullName.toLowerCase().includes('lab');

          const timeRange = `${slots[startIndex].split("-")[0]} - ${slots[endIndex].split("-")[1]}`;

          mergedSchedule.push({
            subject: subjectFullName,
            teacher: isFree ? "" : teacherFullName,
            room: current.room || "N/A",
            time: timeRange,
            type: isFree ? "Free" : (isLab ? "Lab" : "Lecture")
          });

          i = endIndex + 1;
        }

        todaySchedule = mergedSchedule;
      }
    }

    // 🔹 Fetch temporary schedules for today
    const todayStart = new Date(todayDate);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(todayDate);
    todayEnd.setHours(23, 59, 59, 999);

    let temporarySchedules = await TemporarySchedule.find({
      'to.date': { $gte: todayStart, $lte: todayEnd }
    })
      .populate('teacherId', 'name email')
      .sort({ 'to.slot': 1 });

    if (selectedCourse) {
      temporarySchedules = temporarySchedules.filter(ts => ts.course === selectedCourse);
    }

    // 🔹 Fetch all notifications
    let notifications = await ScheduleNotification.find()
      .populate('teacherId', 'name email')
      .sort({ createdAt: -1 });

    if (selectedCourse) {
      notifications = notifications.filter(n => n.course === selectedCourse);
    }

    res.render('user/today', {
      today,
      todaySchedule,
      slots,
      courses,
      selectedCourse,
      dayName,
      subjectTeachers: {},
      temporarySchedules: temporarySchedules.map(ts => ({
        _id: ts._id,
        course: ts.course,
        subject: ts.subject,
        teacher: ts.teacherId?.name || 'Unknown Teacher',
        teacherEmail: ts.teacherId?.email || '',
        from: ts.from,
        fromTime: slotsArray[ts.from.slot] || `Slot ${ts.from.slot + 1}`,
        to: ts.to,
        toTime: slotsArray[ts.to.slot] || `Slot ${ts.to.slot + 1}`,
        room: ts.room,
        building: ts.building
      })),
      notifications: notifications.map(n => ({
        _id: n._id,
        course: n.course,
        subject: n.subject,
        teacher: n.teacherId?.name || 'Unknown Teacher',
        teacherEmail: n.teacherId?.email || '',
        fromSlot: n.fromSlot,
        fromTime: slotsArray[n.fromSlot.slot] || `Slot ${n.fromSlot.slot + 1}`,
        toSlot: n.toSlot,
        toTime: slotsArray[n.toSlot.slot] || `Slot ${n.toSlot.slot + 1}`,
        room: n.room,
        building: n.building,
        scheduledDate: n.scheduledDate,
        createdAt: n.createdAt
      }))
    });

  } catch (err) {
    console.error('Error loading today view:', err);
    res.status(500).send('Error loading today timetable');
  }
});


// ✅ Excel Export Route
const generateStyledTimetableExcel = require('../utils/excelGenerator');

router.get('/timetable/export/excel', async (req, res) => {
  try {
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });
    if (!latestTimetableDoc) return res.status(404).send('No timetable found.');

    const workbook = generateStyledTimetableExcel(latestTimetableDoc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=timetable.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).send('Error generating Excel.');
  }
});

module.exports = router;
