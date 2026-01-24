const express = require('express');
const router = express.Router();
const Timetable = require('../models/Timetable');
const Teacher = require('../models/Teacher');
const TemporarySchedule = require('../models/TemporarySchedule');
const ScheduleNotification = require('../models/ScheduleNotification');

// Middleware: Ensure user is faculty with teacher assigned
function isFacultyWithTeacher(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/auth/login');
  if (!req.user.isFaculty || !req.user.teacherId) return res.redirect('/auth/faculty-setup');
  next();
}

// ✅ Faculty Dashboard
router.get('/', isFacultyWithTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.teacherId);
    res.render('faculty/dashboard', {
      teacherName: teacher?.name || 'Faculty',
      teacherEmail: teacher?.email || req.user.email,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error('Error loading dashboard:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ✅ Faculty Personal Timetable (Classes assigned to this teacher, full week)
router.get('/timetable', isFacultyWithTeacher, async (req, res) => {
  try {
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });
    const teacher = await Teacher.findById(req.user.teacherId);

    if (!latestTimetableDoc || !teacher) {
      return res.render('faculty/personal-timetable', {
        personalTimetable: {},
        scheduledClasses: {},
        days: [],
        slots: [],
        teacherName: teacher?.name || 'Unknown',
        userEmail: req.user.email
      });
    }

    const { timetable: fullTimetable, days, slots, subjectTeachers } = latestTimetableDoc;
    const teacherShortName = teacher.shortName;

    // Extract only classes assigned to this teacher with full details
    const personalTimetable = {};
    
    Object.entries(fullTimetable).forEach(([course, courseData]) => {
      const personalCourse = {};
      
      Object.entries(courseData).forEach(([day, dayData]) => {
        const personalDay = {};
        
        Object.entries(dayData).forEach(([slot, classEntry]) => {
          if (!classEntry) return;
          
          // Check if this teacher teaches this class
          const classTeacher = classEntry.teacher || '';
          if (classTeacher.includes(teacherShortName)) {
            // Detect if it's a lab (contains 'Lab' in subject or room)
            const subject = classEntry.subject || '';
            const room = classEntry.room || '';
            const isLab = subject.toLowerCase().includes('lab') || room.toLowerCase().includes('lab');
            
            personalDay[slot] = {
              ...classEntry,
              isLab
            };
          }
        });
        
        if (Object.keys(personalDay).length > 0) {
          personalCourse[day] = personalDay;
        }
      });
      
      if (Object.keys(personalCourse).length > 0) {
        personalTimetable[course] = personalCourse;
      }
    });

    // 🔹 GET SCHEDULED CLASSES FOR THIS TEACHER
    const scheduledClasses = await TemporarySchedule.find({
      teacherId: teacher._id,
      status: 'scheduled'
    });

    // Format scheduled classes for frontend
    const scheduledData = {};
    scheduledClasses.forEach(sch => {
      const key = `${sch.from.day}-${sch.from.slot}`;
      scheduledData[key] = {
        course: sch.course,
        originalSlot: sch.from,
        newSlot: sch.to,
        room: sch.room,
        building: sch.building,
        date: sch.to.date,
        id: sch._id
      };
    });

    // 🔹 Extract COURSE (STUDENT) timetable Library slots
    const courseTimetables = {};

    Object.entries(fullTimetable).forEach(([courseName, courseData]) => {
      const courseLibrary = {};

      Object.entries(courseData).forEach(([dayName, dayData]) => {
        Object.entries(dayData).forEach(([slotIndex, classEntry]) => {
          if (
            classEntry &&
            classEntry.subject &&
            classEntry.subject.toLowerCase().includes('library')
          ) {
            if (!courseLibrary[dayName]) {
              courseLibrary[dayName] = {};
            }

            courseLibrary[dayName][slotIndex] = {
              subject: 'Library'
            };
          }
        });
      });

      if (Object.keys(courseLibrary).length > 0) {
        courseTimetables[courseName] = courseLibrary;
      }
    });


    res.render('faculty/personal-timetable', {
      personalTimetable,
      scheduledClasses: scheduledData,
      courseTimetables,  
      days,
      slots,
      teacherName: teacher.name,
      teacherId: teacher._id,
      teacherEmail: teacher.email,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error('Error fetching faculty timetable:', err);
    res.status(500).send('Error loading timetable');
  }
});

// ✅ Faculty Today's Classes (Only classes for today)
router.get('/timetable/today', isFacultyWithTeacher, async (req, res) => {
  try {
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });
    const teacher = await Teacher.findById(req.user.teacherId);

    const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDate = new Date();
    const today = daysMap[todayDate.getDay()];
    const dayName = today;

    if (!latestTimetableDoc || !teacher) {
      return res.render('faculty/today-timetable', {
        today,
        todaySchedule: [],
        slots: [],
        teacherName: teacher?.name || 'Unknown',
        dayName,
        userEmail: req.user.email
      });
    }

    const { timetable: fullTimetable, slots } = latestTimetableDoc;
    const teacherShortName = teacher.shortName;
    
    // Get today's schedule for this teacher with full details
    const todaySchedule = [];
    
    Object.entries(fullTimetable).forEach(([course, courseData]) => {
      if (courseData[today]) {
        Object.entries(courseData[today]).forEach(([slotIndex, classEntry]) => {
          if (!classEntry) return;
          
          // Only include if this teacher teaches this class
          const classTeacher = classEntry.teacher || '';
          if (classTeacher.includes(teacherShortName)) {
            todaySchedule.push({
              course,
              slotIndex: parseInt(slotIndex),
              slot: slots[slotIndex] || `Slot ${slotIndex}`,
              room: classEntry.room || 'TBD',
              subject: classEntry.subject || 'TBD',
              teacher: classTeacher
            });
          }
        });
      }
    });

    // Sort by slot number
    todaySchedule.sort((a, b) => a.slotIndex - b.slotIndex);

    res.render('faculty/today-timetable', {
      today,
      todaySchedule,
      slots,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      dayName,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error('Error fetching today timetable:', err);
    res.status(500).send('Error loading timetable');
  }
});

// ✅ Faculty Full Timetable View (All courses, same as regular users)
router.get('/full-timetable', isFacultyWithTeacher, async (req, res) => {
  try {
    const selectedCourse = req.query.course || null;
    const latestTimetableDoc = await Timetable.findOne().sort({ createdAt: -1 });
    const teacher = await Teacher.findById(req.user.teacherId);

    if (!latestTimetableDoc) {
      return res.render('faculty/full-timetable', {
        timetable: null,
        courses: [],
        selectedCourse: null,
        teacherName: teacher?.name || 'Unknown',
        userEmail: req.user.email
      });
    }

    const { timetable: fullTimetable, subjectTeachers, university, faculty, effectiveFrom: wefDate, days, slots } = latestTimetableDoc;
    const courses = Object.keys(fullTimetable);

    let filteredTimetable = fullTimetable;
    let filteredSubjectTeachers = subjectTeachers;

    if (selectedCourse && fullTimetable[selectedCourse]) {
      filteredTimetable = { [selectedCourse]: fullTimetable[selectedCourse] };
      filteredSubjectTeachers = { [selectedCourse]: subjectTeachers[selectedCourse] || [] };
    }

    res.render('faculty/full-timetable', {
      timetable: filteredTimetable,
      university,
      faculty,
      wefDate,
      subjectTeachers: filteredSubjectTeachers,
      slots,
      days,
      courses,
      selectedCourse,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error('Error fetching full timetable:', err);
    res.status(500).send('Error loading timetable');
  }
});

// ✅ Faculty Dashboard
router.get('/', isFacultyWithTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.teacherId);
    
    res.render('faculty/dashboard', {
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dashboard');
  }
});

module.exports = router;
